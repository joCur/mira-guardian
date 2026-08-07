# Server-Deployment

Betreibt den Guardian-Server als einzelnen Container aus einem veröffentlichten
Release-Image. Alle Daten liegen unter `./data` im Dateisystem — kein
Docker-Volume, damit ein Serverumzug ein reines Kopieren ist.

Für die lokale Entwicklung ist stattdessen die `docker-compose.yml` im
Wurzelverzeichnis gedacht: die baut das Image aus dem Arbeitsstand.

## Installation

Auf dem Zielserver braucht es nur Docker mit dem Compose-Plugin und ein Konto in
der Gruppe `docker`. Das Image liegt öffentlich in der GitHub Container Registry,
eine Anmeldung ist nicht nötig.

```bash
mkdir -p ~/mira-guardian && cd ~/mira-guardian
# docker-compose.yml und .env.example aus deploy/ hierher kopieren
# (für automatische Updates zusätzlich guardian-update.sh, siehe unten)
cp .env.example .env && chmod 600 .env
mkdir -p data
```

In der `.env` ausfüllen:

- die fünf Pflichtfelder `ADO_BASE_URL`, `ADO_COLLECTION`, `ADO_PROJECT`,
  `ADO_REPO`, `ADO_PAT`
- `GUARDIAN_UID` und `GUARDIAN_GID` mit den Werten von `id -u` und `id -g`.
  Damit gehören die Datenbankdateien dem Betreiberkonto und lassen sich ohne
  root sichern. Die Werte weichen je Server ab, deshalb nicht raten.
- `GUARDIAN_VERSION` nur, wenn ein fester Stand gewollt ist
  ([Releases](https://github.com/joCur/mira-guardian/releases)). Ohne Angabe
  läuft `latest` — siehe „Automatische Updates"

Starten und den Setup-Code holen — er wird bei einer frischen Datenbank genau
einmal ausgegeben und ist für die Anmeldung des Widgets nötig:

```bash
docker compose up -d
docker compose logs | grep Setup-Code
```

Im Widget als Server-Adresse `http://<server>:4000` eintragen.

## Betrieb

```bash
docker compose ps                    # Status inklusive Healthcheck
docker compose logs -f               # Log verfolgen
docker compose restart
docker compose down                  # Stoppen; Daten unter ./data bleiben
curl -s localhost:4000/health        # erwartet {"ok":true}
tail -n 20 update.log                # letzte Läufe des Update-Timers
```

Der Container startet nach Reboot und Absturz automatisch neu
(`restart: unless-stopped`).

## Update

Ohne `GUARDIAN_VERSION` in der `.env` läuft der Server auf `latest`, ein Update
von Hand ist dann:

```bash
docker compose pull && docker compose up -d
```

Auf einen bestimmten Stand geht es über `GUARDIAN_VERSION` in der `.env`, mit
derselben Befehlsfolge danach. Automatisch geht beides auch — siehe
„Automatische Updates".

Die Datenbank bleibt liegen, das Schema wird beim Start migriert. Vor einem
Sprung über mehrere Versionen vorher ein Backup ziehen.

### Welche Version läuft gerade?

Der Server sagt es selbst — der Tag aus der `.env` taugt dafür nicht, erst recht
nicht bei `GUARDIAN_VERSION=latest`:

```bash
docker compose logs | grep "hört auf"     # guardian-server 0.1.11 hört auf :4000
curl -s localhost:4000/health             # {"ok":true,"version":"0.1.11"}
```

Dieselbe Angabe steht im Widget im Hüter-Tab unter „Verbindung", neben der
Version der App. Weichen beide voneinander ab, weist die App darauf hin.

## Automatische Updates

Jeder Push auf `main` erzeugt ein Release: Server-Image und Widget-Apps tragen
dieselbe Versionsnummer. Das Widget holt sich neue Versionen selbst — damit der
Server nicht zurückfällt, liegt hier ein systemd-Timer, der stündlich nach einem
neuen Image sieht.

Der Server zieht dabei selbst; es gibt keinen Deployment-Schritt in der Pipeline,
keinen Zugang von GitHub auf den Server und keinen Dienst mit Docker-Socket.

Einrichten — das Skript neben die `docker-compose.yml`, die beiden Units zu den
Benutzer-Units des Betreiberkontos:

```bash
cd ~/mira-guardian
# guardian-update.sh aus deploy/ hierher kopieren
chmod +x guardian-update.sh

mkdir -p ~/.config/systemd/user
# guardian-update.service und guardian-update.timer aus deploy/ dorthin kopieren

# Benutzer-Units laufen sonst nur, solange eine Sitzung offen ist:
loginctl enable-linger "$USER"

systemctl --user daemon-reload
systemctl --user enable --now guardian-update.timer
```

`loginctl enable-linger` ist der Schritt, den man vergisst. Ohne ihn beendet
systemd die Benutzer-Units beim Abmelden, und nach dem nächsten Reboot läuft der
Timer nicht wieder an.

Einmal von Hand nachsehen, ob der Weg steht:

```bash
systemctl --user start guardian-update.service      # jetzt ausführen
tail -n 20 update.log                               # was dabei herauskam
systemctl --user list-timers guardian-update.timer  # wann der nächste Lauf ist
```

### Was ein Lauf tut

`docker compose pull`, dann `docker compose up -d --wait`. Hat sich der
Image-Digest nicht geändert, tut `up` nichts und der Server läuft ohne Neustart
weiter. Sonst wird der Container ersetzt, und der Lauf wartet den Healthcheck aus
der `docker-compose.yml` ab. Zum Schluss werden ungetaggte Images abgeräumt, die
älter als ein Tag sind.

In `update.log` neben der `docker-compose.yml` steht danach eine Zeile pro Lauf,
mit Zeitstempel — entweder `Keine neue Version, X läuft weiter.` oder
`Aktualisiert: X -> Y`. Das Skript kürzt die Datei selbst, sobald sie über 500
Zeilen wächst.

Warum eine Datei und nicht nur das Journal: für Konten aus einer Domäne legt
systemd-journald kein eigenes Benutzer-Journal an. Die Ausgaben der Unit landen
dann im System-Journal, das ein Konto ohne Gruppe `adm` oder `systemd-journal`
nicht öffnen darf — `journalctl --user -u guardian-update` findet in diesem Fall
nichts. Wo das Journal lesbar ist, steht alles doppelt.

### Wenn ein Release den Server nicht gesund werden lässt

Dann endet `up -d --wait` mit einem Fehler, die Unit steht auf `failed`, und in
`update.log` steht der Hinweis samt vorheriger Version:

```bash
systemctl --user list-units --failed    # der Alarm, unabhängig vom Journal
grep FEHLER update.log | tail           # die Begründung
```

Zurückgerollt wird nicht automatisch. Das ist Absicht: ein Automatismus, der
zwischen zwei Ständen pendelt, ist schwerer zu durchschauen als ein Server, der
stehen bleibt und es sagt.

Der Rückweg ist ein Pin — `GUARDIAN_VERSION=<vorige Version>` in die `.env`
schreiben, dann `docker compose up -d`. Der Timer läuft von da an ins Leere, weil
`pull` immer denselben Digest holt. Das ist gleichzeitig die Bremse: solange dort
eine feste Version steht, aktualisiert sich nichts mehr. Zum Mitlaufen die Zeile
wieder entfernen.

Ein fehlgeschlagener `pull` — Registry nicht erreichbar — ist dagegen kein
Fehler: es wurde nichts geändert, der alte Container läuft weiter, der nächste
Lauf holt es nach. Die Unit bleibt dann absichtlich grün, damit `failed` etwas
wert bleibt.

### Takt ändern oder abschalten

```bash
systemctl --user edit guardian-update.timer          # OnCalendar= überschreiben
systemctl --user disable --now guardian-update.timer
```

`systemctl edit` legt einen Drop-in an, der die Unit aus `deploy/` unangetastet
lässt — eine Abweichung überlebt damit das nächste Kopieren. `OnCalendar=` ist
dabei eine Liste: ohne eine leere Zeile `OnCalendar=` davor kommt der neue Wert
zum alten dazu, statt ihn zu ersetzen, und der Timer feuert nach beiden Angaben.

Stündlich ist auf das Widget abgestimmt, das alle sechs Stunden nach Updates
sieht. Ein Fenster mit unterschiedlichen Versionen bleibt damit möglich; das
Widget weist im Hüter-Tab darauf hin. Wer Neustarts aus der Arbeitszeit
heraushalten will, setzt etwa `OnCalendar=03:00` — dann läuft der Server dem
Widget allerdings bis zu einen Tag hinterher.

### Was der Timer nicht tut

Er zieht **kein Backup**. Schema-Migrationen laufen von jetzt an unbeaufsichtigt
beim Containerstart, und der einzige Rückweg aus einer fehlgeschlagenen Migration
ist eine Kopie von `./data` (siehe unten) — die gehört in eine eigene,
regelmäßige Sicherung. Im Update-Skript wäre sie falsch aufgehoben: ein
konsistentes Backup braucht einen gestoppten Container, also stündlich einen
Ausfall für eine Sicherung, die fast immer unnötig ist.

## Anmeldung eines Hüters wiederherstellen

Der Weg auf einen neuen Rechner läuft ohne den Server: Im Hüter-Tab stellt jeder
Hüter über **Gerät verknüpfen** einen Zugangscode für ein bestehendes Profil aus
— auch für sich selbst, solange noch ein Gerät angemeldet ist. Der Code ist 24
Stunden gültig, gilt einmalig, und das Profil bleibt dasselbe: Bewertungen und
Gründungsrolle kommen mit.

Der Betreiber wird nur gebraucht, wenn **kein** Gerät mehr angemeldet ist, das
einen Code ausstellen könnte — beim Gründungs-Hüter zusätzlich deshalb, weil
sein Setup-Code verbraucht ist und `/auth/init` eine initialisierte Instanz
ablehnt:

```bash
cd ~/mira-guardian
docker compose exec server node dist/cli.js guardians          # E-Mail und Geräte nachsehen
docker compose exec server node dist/cli.js relink <mail@example.com>
```

Der ausgegebene Code wird im Widget unter „Gerät verknüpfen" eingegeben. Er ist
kurzlebig und einmalig — aber solange er gültig ist, öffnet er den Zugang zu
diesem Profil: nicht in einem Ticket ablegen, und ein nicht genutzter Code wird
am besten durch einen neuen entwertet.

Verlorene und ausgetauschte Rechner gehören danach aus der Liste: Im Hüter-Tab
zeigt **Meine Geräte** jedes verknüpfte Gerät mit letztem Kontakt, und *Zugang
entziehen* sperrt es sofort aus.

## Backup und Umzug auf einen anderen Server

Der Container **muss dafür gestoppt sein**: SQLite läuft im WAL-Modus, ein
Kopieren im Betrieb kann einen inkonsistenten Stand ergeben.

```bash
docker compose down
tar czf ~/guardian-backup-$(date +%Y%m%d).tar.gz -C ~/mira-guardian data .env docker-compose.yml
docker compose up -d
```

Auf dem Zielserver das Archiv nach `~/mira-guardian/` entpacken, in der `.env`
`GUARDIAN_UID`/`GUARDIAN_GID` auf die dortigen Werte anpassen und
`docker compose up -d` ausführen. Ohne diese Anpassung darf der Container nicht
in `./data` schreiben.
