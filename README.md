# Memory-Bank Hüter

Ein Review-Werkzeug für die **Memory Bank** eines Repositorys: Decision
Records, Lessons Learned, Prozessdokumente und Coding-Rules ändern sich im
Alltag oft unbemerkt. Der Hüter beobachtet diese Pfade in Azure DevOps,
meldet jede Änderung als Benachrichtigung auf dem Desktop und sammelt die
Bestätigung aller Hüter ein — offene Punkte landen in der Wochenübersicht
fürs Team-Meeting.

<!-- Screenshot folgt -->

## Aufbau

| Teil | Verzeichnis | Aufgabe |
|---|---|---|
| Server | `apps/server` | Pollt Azure DevOps, hält Änderungen und Bewertungen in SQLite, verteilt Ereignisse per WebSocket |
| Widget | `apps/widget` | Electron-Tray-App: Änderungsliste, Markdown-Diff, Bewertung, Toasts |
| Shared | `packages/shared` | Gemeinsame Typen, Statuslogik und die Zuordnung Pfad → Record-Typ |

Der Server erkennt Memory-Bank-Inhalte auf **jeder Ebene** des Repos —
`docs/decisions/…` im Wurzelverzeichnis genauso wie
`apps/<app>/docs/decisions/…`. Das Widget nennt diese Ebene an jedem Eintrag
und lässt Änderungsliste und Verlauf danach filtern — ebenso nach Record-Typ
und nach freiem Text über Pfad, Zusammenfassung, Autor und Kommentar.

## Entwicklung

Voraussetzungen: Node 22+, pnpm.

```bash
pnpm install
pnpm --filter @guardian/shared build   # Tests und Apps nutzen dist/
pnpm test
```

**Server starten** — Konfiguration über `.env` im Wurzelverzeichnis
(siehe `.env.example`):

```bash
pnpm --filter @guardian/server build
cd apps/server && set -a && . ../../.env && set +a && node dist/main.js
```

Beim ersten Start ohne Hüter schreibt der Server einen einmaligen
Setup-Code ins Log — damit verbindet sich das erste Widget.

**Widget starten:**

```bash
pnpm --filter @guardian/widget dev
```

**Desktop-Apps paketieren** (Ergebnis in `apps/widget/dist`):

```bash
pnpm --filter @guardian/widget dist
```

## Betrieb

Der Server läuft als Container. Die `docker-compose.yml` im Wurzelverzeichnis
baut das Image aus dem Arbeitsstand; für einen Server liegt unter
[`deploy/`](deploy/) ein Deployment aus dem veröffentlichten Release-Image — mit
fester Version und der SQLite-Datei als Bind-Mount im Dateisystem statt in einem
Docker-Volume, damit ein Serverumzug ein Kopieren bleibt.

```bash
docker compose up -d                 # Wurzelverzeichnis: baut lokal, nutzt die .env dort
cd deploy && docker compose up -d    # Server: feste Release-Version aus ghcr.io
```

Desktop-Apps für macOS, Windows und Linux hängen an jedem
[Release](../../releases). Sie sind **ad-hoc signiert, aber nicht
notarisiert** — Gatekeeper und SmartScreen kennen den Herausgeber daher
nicht:

**macOS:** App aus dem DMG nach `/Applications` ziehen, dann einmalig die
Quarantäne-Markierung entfernen:

```bash
xattr -dr com.apple.quarantine /Applications/Guardian.app
```

Alternativ Rechtsklick auf die App → *Öffnen* → *Öffnen* bestätigen.

**Windows:** Im SmartScreen-Dialog *Weitere Informationen* → *Trotzdem
ausführen*.

Ein Auto-Update ist nicht eingebaut: Für eine neue Version das aktuelle
Artefakt herunterladen und die App ersetzen.

## Konfiguration

| Variable | Standard | Bedeutung |
|---|---|---|
| `ADO_BASE_URL` | — | Basis-URL des Azure-DevOps-Servers |
| `ADO_COLLECTION`, `ADO_PROJECT`, `ADO_REPO` | — | Ziel-Repository |
| `ADO_BRANCH` | `main` | Beobachteter Branch |
| `ADO_PAT` | — | Personal Access Token mit Leserecht auf Code |
| `SCAN_PATHS` | `docs/decisions,docs/learnings,docs/processes,.claude/rules` | Beobachtete Pfade, auf jeder Ebene |
| `POLL_INTERVAL_SECONDS` | `60` | Abstand der ADO-Abfragen |
| `BACKFILL_DAYS` | `7` | Wie weit eine frische Instanz zurückliest |
| `TYPE_MAP` | — | Optional: eigene Zuordnung Pfad → Record-Typ als JSON |
| `DB_PATH` | `guardian.sqlite` | Ablage der SQLite-Datei |
| `HTTP_PORT` | `4000` | Port des Servers |

## Lizenz

MIT — siehe [LICENSE](LICENSE).
