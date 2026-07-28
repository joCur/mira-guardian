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
  root sichern. Bei Konten aus dem Active Directory sind das keine 1000er-Werte.
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

## Plattenplatz: eine Falle bei getrenntem /var

Seit Docker den containerd-Snapshotter als Image-Store nutzt (`docker info` →
`driver-type: io.containerd.snapshotter.v1`) liegen die Image-Layer **nicht**
mehr unter `data-root` aus `/etc/docker/daemon.json`, sondern im
Datenverzeichnis des System-containerd — per Default `/var/lib/containerd`.

Auf Servern mit kleinem eigenem `/var` läuft das Entpacken deshalb auch dann in
`no space left on device`, wenn `data-root` längst auf eine große Partition
zeigt. `data-root` steuert nur Volumes, Container-Metadaten und Netzwerke. Wer
die Docker-Daten verlagert, muss `root` in `/etc/containerd/config.toml`
mit umziehen:

```toml
root = '/opt/containerd'
```

Danach `containerd` und `docker` neu starten. Prüfen mit:

```bash
containerd config dump | grep '^root'
```
