#!/bin/sh
# Mira Guardian — den Server auf das neueste veröffentlichte Image bringen.
#
# Gedacht für den Aufruf aus guardian-update.timer, läuft aber genauso von Hand.
# Der Kern ist bewusst das, was ein Betreiber ohnehin tippen würde:
# `docker compose pull && docker compose up -d`. `up -d` entscheidet selbst
# anhand des Image-Digests, ob der Container ersetzt werden muss, und tut sonst
# nichts — ein Versionsvergleich vorweg wäre nur eine zweite Quelle für dieselbe
# Entscheidung, die irgendwann von der ersten abweicht.
#
# Der Ausstieg aus dem Auto-Update steht in der .env: trägt GUARDIAN_VERSION
# eine feste Version statt `latest`, holt `pull` immer denselben Digest und
# dieses Skript wird zur Leerlaufschleife. Genau das ist der Rückweg nach einem
# schlechten Release — deshalb rollt das Skript nichts von selbst zurück.

set -eu

# Neben der docker-compose.yml liegen, nicht im Aufrufverzeichnis: der Timer
# startet ohne definiertes Arbeitsverzeichnis.
cd "$(dirname "$0")"

# Jede Meldung geht zusätzlich in diese Datei, weil das Journal kein verlässlicher
# Kanal ist: für Konten aus einer Domäne legt systemd-journald kein eigenes
# Benutzer-Journal an, die Ausgaben landen im System-Journal, und das darf ein
# Konto ohne Gruppe `adm` oder `systemd-journal` nicht öffnen. `journalctl --user`
# findet dann nichts. Wo das Journal lesbar ist, steht alles doppelt — das ist die
# günstigere Seite des Fehlers.
PROTOKOLL=./update.log

# Sonst wächst die Datei mit jedem Lauf; bei einem Lauf alle fünf Minuten sind
# 200 Zeilen ungefähr ein halber Tag Rückschau.
if [ -f "$PROTOKOLL" ] && [ "$(wc -l < "$PROTOKOLL")" -gt 500 ]; then
  tail -n 200 "$PROTOKOLL" > "$PROTOKOLL.neu" && mv "$PROTOKOLL.neu" "$PROTOKOLL"
fi

# Das `|| true` ist wichtig: ein nicht beschreibbares Protokoll darf das Update
# nicht verhindern — es ist die Nebensache, nicht der Zweck.
melde() {
  echo "$1"
  printf '%s  %s\n' "$(date '+%F %T')" "$1" >> "$PROTOKOLL" || true
}

melde_fehler() {
  echo "$1" >&2
  printf '%s  FEHLER: %s\n' "$(date '+%F %T')" "$1" >> "$PROTOKOLL" || true
}

# Die Version steckt als GUARDIAN_BUILD_VERSION im Image. Gelesen wird sie am
# Container und nicht über /health, weil der Port des Hosts konfigurierbar ist,
# und nicht per `exec`, weil das einen laufenden Container voraussetzt — hier
# soll auch der Stand eines gestoppten Containers noch ablesbar sein.
# Gibt nichts aus, solange es den Container noch nicht gibt — beim ersten Lauf
# nach der Installation ist das der Normalfall.
laufende_version() {
  cid="$(docker compose ps --all --quiet server 2>/dev/null)" || return 0
  [ -n "$cid" ] || return 0
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$cid" 2>/dev/null \
    | sed -n 's/^GUARDIAN_BUILD_VERSION=//p'
}

vorher="$(laufende_version)"

# Ein fehlgeschlagener Pull heißt: nichts geändert, der alte Container läuft
# weiter. Das ist keine Störung, sondern ein Netzproblem, das der nächste Lauf
# erledigt — mit `exit 1` stünde die Unit nach jedem Registry-Schluckauf auf
# `failed` und die Meldung wäre nichts mehr wert.
if ! docker compose pull; then
  melde "Image konnte nicht geholt werden; ${vorher:-unbekannte Version} läuft weiter."
  exit 0
fi

# --wait wartet den Healthcheck aus der docker-compose.yml ab und endet mit
# Fehlercode, wenn er nicht grün wird. Ohne --wait-timeout wartet Compose
# unbegrenzt und der Timer-Lauf hinge am Ende an TimeoutStartSec der Unit.
if ! docker compose up --detach --wait --wait-timeout 180; then
  melde_fehler "Der Server wurde nach dem Update nicht gesund."
  melde_fehler "Zurück auf einen bekannten Stand: GUARDIAN_VERSION=${vorher:-<letzte gute Version>} in die .env, dann 'docker compose up -d'."
  exit 1
fi

nachher="$(laufende_version)"

if [ "$vorher" = "$nachher" ]; then
  melde "Keine neue Version, ${nachher:-unbekannt} läuft weiter."
else
  melde "Aktualisiert: ${vorher:-unbekannt} -> ${nachher:-unbekannt}"
fi

# Das ersetzte Image hat nach dem Pull keinen Tag mehr und bliebe sonst liegen.
# `until=24h` lässt es einen Tag stehen: kostet einmal Plattenplatz, erspart
# aber den erneuten Download, wenn direkt zurückgepinnt wird.
#
# Achtung: prune wirkt hostweit und nicht nur auf dieses Compose-Projekt. Laufen
# auf dem Server weitere Stacks mit ungetaggten Images, diesen Block streichen.
docker image prune --force --filter "until=24h" \
  || melde "Alte Images konnten nicht aufgeräumt werden — unkritisch."
