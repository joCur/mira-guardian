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
`apps/<app>/docs/decisions/…`.

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

Der Server läuft als Container:

```bash
docker pull ghcr.io/<owner>/mira-guardian-server:latest
docker compose up -d          # nutzt die .env im Wurzelverzeichnis
```

Desktop-Apps für macOS, Windows und Linux hängen an jedem
[Release](../../releases). Sie sind derzeit **nicht signiert** — macOS
verlangt beim ersten Start Rechtsklick → Öffnen, Windows zeigt einen
SmartScreen-Hinweis.

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
