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
cp .env.example .env && chmod 600 .env
mkdir -p data
```

In der `.env` ausfüllen:

- die fünf Pflichtfelder `ADO_BASE_URL`, `ADO_COLLECTION`, `ADO_PROJECT`,
  `ADO_REPO`, `ADO_PAT`
- `GUARDIAN_UID` und `GUARDIAN_GID` mit den Werten von `id -u` und `id -g`.
  Damit gehören die Datenbankdateien dem Betreiberkonto und lassen sich ohne
  root sichern. Die Werte weichen je Server ab, deshalb nicht raten.
- `GUARDIAN_VERSION` auf die gewünschte Version
  ([Releases](https://github.com/joCur/mira-guardian/releases))

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
```

Der Container startet nach Reboot und Absturz automatisch neu
(`restart: unless-stopped`).

## Update

`GUARDIAN_VERSION` in der `.env` auf die neue Version setzen, dann:

```bash
docker compose pull && docker compose up -d
```

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
