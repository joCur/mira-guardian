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
[Release](../../releases). Sie sind **mit einem eigenen Zertifikat signiert,
aber nicht notarisiert** — Gatekeeper und SmartScreen kennen den Herausgeber
daher nicht:

**macOS:** App aus dem DMG nach `/Applications` ziehen, dann einmalig die
Quarantäne-Markierung entfernen:

```bash
xattr -dr com.apple.quarantine /Applications/Guardian.app
```

Alternativ Rechtsklick auf die App → *Öffnen* → *Öffnen* bestätigen.

**Windows:** Im SmartScreen-Dialog *Weitere Informationen* → *Trotzdem
ausführen*.

Das ist nur beim ersten Mal nötig — danach hält sich die App selbst aktuell.

### Aktualisierung

Die installierte App fragt beim Start und danach alle sechs Stunden beim
Release-Kanal nach, lädt eine neuere Version im Hintergrund und meldet sie
als Hinweis in der Titelleiste. Von dort führt ein Klick zu den
Änderungshinweisen des Releases oder startet die App mit der neuen Version
neu. Im Hüter-Tab steht daneben, wann zuletzt gesucht wurde, und lässt sich
eine Suche auslösen.

Zwei Varianten bleiben Handarbeit: das portable Windows-EXE (es hat keinen
Installer, der sich ersetzen ließe) und das DEB-Paket (es gehört dem
Paketmanager, der für ein Update nach Rechten fragen müsste).

Auf macOS hängt die Aktualisierung am Zertifikat: Squirrel.Mac spielt ein
Update nur ein, wenn es dieselbe Signatur trägt wie die laufende App. Dafür
genügt ein selbstsigniertes Zertifikat — geprüft wird gegen die *Designated
Requirement* der laufenden App, nicht gegen Apples Vertrauenskette. Notariat
und Developer-ID ändern daran nichts; sie würden nur die Warnung beim ersten
Öffnen ersparen. Wechselt das Zertifikat, verlieren alle bereits installierten
Apps ihren Update-Pfad und müssen einmal von Hand ersetzt werden.

Ein lokaler `pnpm --filter @guardian/widget dist` braucht dieses Zertifikat
deshalb in der Schlüsselbundverwaltung (Identität `Guardian Code Signing`,
Zertifikatstyp *Codeunterzeichnung*, für Codeunterzeichnung auf *immer
vertrauen* gestellt). Fehlt es, entsteht ohne Fehlermeldung ein Artefakt, das
sich später nicht aktualisieren lässt — electron-builder behandelt ein
gescheitertes Signieren nur als Warnung. Nachsehen lohnt sich:

```bash
codesign -d --requirements - apps/widget/dist/mac-*/Guardian.app
# muss "certificate leaf = H\"…\"" nennen, nicht "cdhash"
```

Die Pipeline zieht das Zertifikat aus den Secrets `MAC_CSC_LINK` (die `.p12`
base64-kodiert) und `MAC_CSC_KEY_PASSWORD`. Das Secret allein genügt dort
nicht: in einer frisch angelegten Keychain gilt ein selbstsigniertes
Zertifikat als nicht vertrauenswürdig, weil Vertrauenseinstellungen am
Benutzer hängen und nicht an der Keychain — electron-builder sortiert solche
Identitäten aus und baut unsigniert weiter. Darum richtet
[`.github/scripts/mac-signierschluessel.sh`](.github/scripts/mac-signierschluessel.sh)
die Keychain samt Vertrauenseintrag ein, ein Prüfschritt danach lässt kein
Release mit fehlender Signatur mehr durch, und die CI prüft bei jedem Pull
Request, dass sich mit dem hinterlegten Zertifikat überhaupt signieren lässt.

### Wo die Anmeldung liegt

Gerätetoken und Server-Adresse stehen außerhalb der App und überleben das
Ersetzen des Artefakts:

| System | Datei |
|---|---|
| macOS | `~/Library/Application Support/de.mediainterface.mira-guardian/config.json` |
| Windows | `%APPDATA%\de.mediainterface.mira-guardian\config.json` |
| Linux | `~/.config/de.mediainterface.mira-guardian/config.json` |

Der Ordnername ist fest verdrahtet und nicht aus dem App-Namen abgeleitet.
Früher lag die Datei unter `@guardian/widget` — dem Paketnamen, den Electron
ohne eigene Angabe als App-Namen nimmt. Dorthin schrieb auch ein lokales
`pnpm dev`, und ein Abmelden oder ein Umstellen auf `localhost` im
Entwicklungsbetrieb hat die installierte App mit abgemeldet. Beide haben jetzt
getrennte Ordner; eine vorhandene Anmeldung wird beim ersten Start übernommen,
die alte Datei bleibt liegen. Ein Backup der Anmeldung ist ein Kopieren dieser
Datei.

Ist sie trotzdem verloren: [Anmeldung wiederherstellen](deploy/README.md#anmeldung-eines-hüters-wiederherstellen).

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
