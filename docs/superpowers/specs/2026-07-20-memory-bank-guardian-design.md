# Memory-Bank Guardian — Design Spec

- **Datum:** 2026-07-20
- **Status:** Entwurf (zur Abnahme)
- **Autor:** Jonas Curth (curth@mediainterface.de)
- **Referenz:** Claude-Design „Memory-Bank Hüter" (Form- und Funktions-Referenz)

---

## 1. Ziel & Kontext

Ein kleines, unaufdringliches Tool, das die **Hüter** einer Spec-Driven-Development-**Memory-Bank**
benachrichtigt, sobald sich an ihr etwas ändert, ihnen die Änderung anzeigt und pro Hüter eine
**Bestätigung** einfordert. Ziel ist ein wöchentliches Hüter-Meeting, in dem nur die strittigen
Änderungen besprochen werden müssen.

Die Memory-Bank besteht aus **Markdown-Dateien** in einem Git-Repository auf einem
**Azure-DevOps-Server** (On-Prem). Änderungen werden **per ADO-REST-API** abgerufen.

**Kernanforderungen:**

- Benachrichtigung aller Hüter bei Änderungen an der Memory-Bank.
- Anzeige *was* sich geändert hat — gerendertes Markdown mit Diff.
- Bestätigung je Hüter mit drei Status: **Akzeptiert**, **Klärungsbedarf**, **Abgelehnt**.
- Bei **Klärungsbedarf** und **Abgelehnt** ist ein **Kommentar Pflicht**.
- **Von allen bestätigt** = nur kleiner Nebeninfo-Hinweis. Wichtig und prominent sind
  **Klärungsbedarf** und **Abgelehnt**.
- Klein/unauffällig (Tray-Widget), Änderungen aber in groß betrachtbar (Hauptfenster).
- ADO-**Base-URL** im Backend **konfigurierbar** (für Deep-Links).

## 2. Nicht-Ziele (YAGNI)

- **Keine KI** — Analyse und Diff sind rein mechanisch/deterministisch.
- **Keine OS-Benachrichtigungen und keine E-Mail** in Version 1 — nur In-App-Toast + Badge.
- **Kein Multi-Repo** — genau ein Repo/Branch (konfigurierbar). Mehrere Repos später.
- Kein Editieren der Memory-Bank aus dem Tool — es ist **read-only** gegenüber ADO.
- Keine feingranulare Rollen/Rechte über „Hüter ja/nein" hinaus.

## 3. Rollen

- **Hüter** — verknüpftes Profil, dessen Bestätigung bei jeder Änderung zählt.
- **Gründungs-Hüter** — der erste Hüter, per Setup-Code angelegt; funktional identisch, legt
  danach weitere Hüter an. Keine dauerhafte Sonderrolle.

## 4. Architektur

Zwei Komponenten plus die Datenquelle ADO.

```
Azure DevOps Server (Git, Memory-Bank)
        │  REST-API (Commits, Item-Content) — PAT, read-only
        ▼
┌──────────────────────────────┐        WebSocket + REST         ┌───────────────────────────┐
│ guardian-server (Node/TS)    │◀──────────────────────────────▶│ guardian-widget (Electron) │
│  - ADO-Poller                │                                 │  - Tray / Widget / Toast   │
│  - SQLite-Store              │                                 │  - Hauptfenster (4 Tabs)   │
│  - REST-API + WS-Push        │                                 │  - React + Tailwind        │
│  - Config (ENV/Datei)        │                                 │    + Catppuccin            │
└──────────────────────────────┘                                 └───────────────────────────┘
        (Docker)
```

### 4.1 `guardian-server` (Node/TypeScript, SQLite, Docker)

Verantwortlich für Datenbeschaffung, Persistenz und Verteilung. Trust-Boundary: der PAT liegt
**ausschließlich** hier, nie im Client.

Interne Bausteine (je eigene, testbare Einheit):

- **AdoPoller** — pollt periodisch die ADO-Git-API, erkennt neue Commits auf dem Zielbranch,
  die konfigurierte Pfade berühren, und erzeugt/aktualisiert Change-Records. Kennt „last seen
  commit" pro Branch.
- **AdoClient** — dünner HTTP-Client um die benötigten ADO-Endpunkte (Commits, Changes, Item-
  Content). Einzige Stelle mit ADO-Wissen; gegen Fixtures testbar.
- **Store** — SQLite-Zugriff (Repository-Pattern), s. Datenmodell.
- **ChangeService** — Ableitung von Change/Vote-Zuständen, Aggregation (all-accepted, Meeting-
  Gruppierung, Badge-Zahlen, Vote-Backfill für neue Hüter).
- **AuthService** — Setup-Code, Invite-Codes, Device-Token, Hüter-Verwaltung.
- **HttpApi** — REST-Endpunkte.
- **RealtimeHub** — WebSocket-Broadcast an verbundene Widgets.

### 4.2 `guardian-widget` (Electron + React + Tailwind + Catppuccin)

Reine Präsentations-/Interaktionsschicht. Kein direkter ADO-Zugriff. Zustände exakt nach Design
(s. §10). Speichert lokal nur den Device-Token und die Server-URL.

## 5. Datenmodell (SQLite)

```
guardian        id (uuid, PK), name, email, initials, avatar_color, created_at, is_founder
invite_code     code (PK, "MB-XXXX"), name, email, created_by (guardian.id),
                created_at, redeemed_at (nullable), redeemed_by (guardian.id, nullable)
setup_state     id (=1), setup_code, initialized_at (nullable)   -- einmaliger Erst-Setup-Code
device          id (uuid, PK), guardian_id (FK), token (secret), label, last_seen_at

change          id (uuid, PK), repo, branch, file_path, change_kind (add|modify|delete),
                commit_id, commit_short, author_name, author_email, committed_at,
                summary,                       -- Commit-Subject
                old_md (nullable), new_md (nullable),
                cycle_id (FK), first_seen_at
vote            id (uuid, PK), change_id (FK), guardian_id (FK),
                status (offen|akzeptiert|klaerung|abgelehnt), comment (nullable),
                updated_at
                UNIQUE(change_id, guardian_id)

cycle           id (uuid, PK), iso_week, starts_at, ends_at (nullable),
                closed_at (nullable), note (nullable)   -- Review-Zyklus (Woche)
```

Ableitungen (nicht persistiert, im ChangeService berechnet):

- `allAccepted(change)` = jeder Hüter hat für den Change `status = akzeptiert`.
- `active` = Changes des offenen Zyklus, die **nicht** von allen akzeptiert sind.
- `accepted` = Changes, die von allen akzeptiert sind (nur Nebeninfo).
- `badgeCount(guardian)` = Anzahl Changes im offenen Zyklus mit `status = offen` für diesen Hüter.
- `stripe(change)` = schlechtester Status: abgelehnt > klaerung > offen > akzeptiert.

## 6. ADO-Anbindung & Änderungserkennung

- **Quelle:** Commits auf dem konfigurierten Zielbranch. Der Poller fragt Commits seit dem
  zuletzt gesehenen Commit ab, filtert auf die konfigurierten Pfade und ermittelt je geänderte
  **Datei** ein Change-Item.
- **Alt-/Neu-Inhalt:** Für jede geänderte Datei werden Vorher- (`old_md`, Parent-Commit) und
  Nachher-Stand (`new_md`, Commit) als Text geladen.
  - Neue Datei: `old_md = null` → UI „Neue Datei — gesamter Inhalt ist neu".
  - Gelöschte Datei: `new_md = null` → als Löschung markiert.
  - Rename/Move wird mechanisch als **delete + add** behandelt (dokumentierte Grenze).
- **Ein Item pro Datei pro Review-Fenster:** Ändert sich dieselbe Datei innerhalb eines Zyklus
  mehrfach, wird das bestehende Change-Item auf den neuesten Netto-Diff aktualisiert (Alt =
  Stand bei Zyklus-Beginn bzw. erste Sichtung, Neu = aktueller Stand). Bereits abgegebene Voten
  zu einer Datei, die sich erneut ändert, werden auf `offen` zurückgesetzt (erneute Bestätigung
  nötig) — die vorherigen Kommentare bleiben in der Historie sichtbar.
- **Deep-Link:** Aus ADO-Base-URL + Collection/Project/Repo + Commit/Pfad wird der ADO-Link
  gebaut (Commit- bzw. Datei-Ansicht).
- **Auth:** Personal Access Token (PAT), read-only, nur serverseitig.

### 6.1 Typ-Erkennung (konfigurierbar)

Zuordnung Datei → Typ per Pfad-Regex, Default aus dem Design:

| Regex               | Label     | Farbe (semantisch) |
|---------------------|-----------|--------------------|
| `^docs/decisions/`  | Decision  | Blue               |
| `^docs/learnings/`  | Learning  | Mauve              |
| `^memory-bank/`     | Kontext   | Teal               |
| (sonst)             | Sonstige  | Overlay            |

Pfade und Mapping sind Config (das reale Repo nutzt u.a. auch `.claude/rules/`).

## 7. Diff & Rendering (mechanisch)

- Diff wird **clientseitig** aus `old_md`/`new_md` berechnet — LCS auf Block-, Zeilen- und
  Wortebene (Port des Algorithmus aus der Design-Referenz).
- Rendering: Markdown (Überschriften, Listen, Code, Bold) via `react-markdown`, darüber ein
  Highlight-Layer:
  - hinzugefügte Blöcke/Wörter grün (ins), gelöschte rot durchgestrichen (del),
  - geänderte Blöcke wortweise diffbar,
  - neue Datei = gesamter Inhalt als „add".
- Vollständig deterministisch, keine KI.

## 8. Onboarding & Identität

1. **Instanz initialisieren:** Beim ersten Start ohne Hüter gibt der Server einen einmaligen
   **Setup-Code** (`MB-INIT-XXXX`) in der Konsole aus. Wer ihn + Name + E-Mail eingibt, wird
   **Gründungs-Hüter**. Der Setup-Code verfällt danach.
2. **Hüter einladen:** Im Tab *Hüter* legt ein Hüter einen neuen an (Name + E-Mail →
   „Zugangscode erzeugen"). Erzeugt einen einmaligen **Zugangscode** (`MB-XXXX`).
3. **Gerät verknüpfen:** Der neue Hüter gibt seinen Code im Setup-Dialog ein → das Gerät erhält
   einen **Device-Token**; danach keine Anmeldung mehr nötig. Erst nach Einlösung zählt seine
   Bestätigung.
4. **Neuer Hüter → Vote-Backfill:** Wird ein Hüter verknüpft, erhält er für alle bestehenden
   offenen Changes einen `offen`-Vote (er muss künftig mitbestätigen).
5. **Wechseln:** „wechseln" im Widget-Header löst die Verknüpfung und öffnet erneut den Setup-
   Dialog.

Codes sind einmalig einlösbar; ungültige/verbrauchte Codes ergeben eine Fehlermeldung.

## 9. Abstimmung, Aggregation, Zyklus

- **Status:** `ausstehend` (offen), `Akzeptiert`, `Klärungsbedarf`, `Abgelehnt`.
- **Kommentarpflicht:** Klärungsbedarf und Abgelehnt erfordern einen Kommentar (min. 5 Zeichen);
  Akzeptiert ohne Kommentar.
- **Neu bewerten:** Ein Hüter kann seinen Vote zurücksetzen und neu abgeben.
- **Von allen bestätigt:** sobald alle Hüter `akzeptiert` haben → Change verschwindet aus der
  aktiven Liste und erscheint nur noch als kleiner Hinweis („N Änderungen von allen Hütern
  bestätigt").
- **Review-Zyklus = Kalenderwoche.** Der offene Zyklus zeigt die aktuellen Änderungen. Im
  **Wochen-Meeting** werden Abgelehnt/Klärungsbedarf besprochen; der Zyklus wird **manuell** über
  „Meeting abgeschlossen" beendet (bewusstes Schließen der Woche) und wandert mit Ergebnis und
  optionaler Notiz in den **Verlauf**. Der nächste Zyklus wird beim ersten neuen Change nach dem
  Abschluss angelegt.

## 10. UI-Spezifikation

Das Claude-Design ist **verbindliche Form- und Funktions-Referenz** (Layout, Struktur, Texte,
Interaktion). **Farben kommen aus Catppuccin (Flavor: Mocha, dark) via Tailwind**, nicht aus den
Hex-Werten des Mockups. Deutsche UI-Texte verwenden „Hüter"; Bezeichner im Code „Guardian".

### 10.1 Semantik → Catppuccin-Mapping

| Semantik            | Catppuccin (Mocha)      |
|---------------------|-------------------------|
| Akzeptiert          | Green                   |
| Klärungsbedarf      | Yellow                  |
| Abgelehnt           | Red                     |
| NEU / Info          | Sapphire                |
| Decision            | Blue                    |
| Learning            | Mauve                   |
| Kontext             | Teal                    |
| Sonstige / dezent   | Overlay / Subtext       |
| Flächen             | Base / Mantle / Crust / Surface0–2 |
| Text                | Text / Subtext0/1       |

### 10.2 Screens

- **Setup-Dialog** — Modi „Gerät verknüpfen" (Code `MB-XXXX`) und „Instanz initialisieren"
  (Setup-Code + Name + E-Mail).
- **Tray-Widget** (unten rechts):
  - *Eingeklappt:* Pille „Memory-Bank" + roter Badge (= offene Bestätigungen des Hüters).
  - *Ausgeklappt (352px):* Header „Memory-Bank Hüter · Angemeldet als … · wechseln", Liste
    offener Changes (Status-Streifen, Dateiname, Typ-Label, „NEU", Summary, ein Punkt je Hüter
    mit Vote-Farbe, „deine Bestätigung fehlt"), kleiner Nebeninfo-Hinweis „von allen bestätigt",
    Buttons „Meeting-Übersicht" / „Verlauf".
  - *Toast:* bei neuer Änderung eingeschoben („Memory-Bank geändert", Datei/Typ/Summary/Autor,
    „Ansehen"/„Später", ~8s-Timer), Badge pulsiert.
- **Hauptfenster** (1080×720, 4 Tabs):
  - **Änderungen:** Sidebar „DIESE WOCHE · KW …" (aktive Changes) + „VON ALLEN BESTÄTIGT"
    (gedimmt). Detail: Kopf (Dateiname, Typ, „NEUE DATEI", Commit-Hash, Summary · Autor · Datum,
    Vote-Chips je Hüter), gerenderter Diff, Abschnitt „KOMMENTARE", Fußleiste mit Vote-Buttons
    bzw. Pflicht-Kommentarfeld bzw. „Deine Bewertung … / Neu bewerten".
  - **Meeting-Übersicht:** „Wochen-Meeting · KW …", Zählzeile, „⏳ N Bestätigungen stehen aus",
    Abschnitte **ABGELEHNT** (rot) und **KLÄRUNGSBEDARF** (gelb) als Karten mit Kommentaren je
    Hüter und „Änderung ansehen →", plus kleine Zeile „von allen bestätigt: …".
  - **Verlauf:** vergangene Wochen (KW, Zeitraum, Zusammenfassung, Notiz, Ergebnis-Chips).
  - **Hüter:** verknüpfte Hüter (✓ Verknüpft), offene Einladungen („Code offen" + Code), Formular
    „Neuen Hüter anlegen".

## 11. Realtime & API (Skizze)

REST (Auswahl):

- `POST /auth/init` — Setup-Code + Name + E-Mail → Gründungs-Hüter + Device-Token.
- `POST /auth/redeem` — Zugangscode → Device-Token.
- `GET /changes?cycle=current` — aktive + akzeptierte Changes inkl. Voten.
- `GET /changes/:id` — Detail inkl. `old_md`/`new_md`.
- `POST /changes/:id/vote` — `{status, comment}` (Kommentar-Validierung serverseitig).
- `GET /guardians`, `POST /guardians/invite`.
- `GET /meeting?cycle=current`, `POST /cycles/:id/close`.
- `GET /history`.

**WebSocket:** Server broadcastet `change:new`, `change:updated`, `vote:updated`,
`guardian:added` → Widgets aktualisieren Liste/Badge/Toast live.

## 12. Konfiguration (ENV/Datei, serverseitig)

- `ADO_BASE_URL` (Deep-Links), `ADO_COLLECTION`, `ADO_PROJECT`, `ADO_REPO`, `ADO_BRANCH`.
- `ADO_PAT` (Secret, read-only).
- `POLL_INTERVAL_SECONDS` (Default z.B. 60).
- `SCAN_PATHS` + `TYPE_MAP` (Pfad-Regex → Typ/Label).
- `DB_PATH` (SQLite-Datei), `HTTP_PORT`.

## 13. Fehlerbehandlung

- **ADO nicht erreichbar / Auth-Fehler:** letzter Stand bleibt erhalten; Poller retryt mit
  exponentiellem Backoff; Server exponiert einen Health-/Status-Indikator (im Widget dezent
  sichtbar). Kein Datenverlust, kein Crash.
- **Teil-Fehler beim Content-Laden:** betroffener Change wird als „Inhalt nicht ladbar"
  markiert, restliche Changes normal.
- **Ungültiger/verbrauchter Code:** klare Fehlermeldung im Dialog.
- **Widget offline:** zeigt gecachten Stand; verbindet WS automatisch neu.
- **Gleichzeitige Voten:** pro Hüter/Change gilt „last write wins" (UNIQUE-Constraint).

## 14. Sicherheit

- PAT nur serverseitig; Client erhält niemals ADO-Credentials.
- Device-Token als Bearer für API/WS; einmalige, zufällige Codes.
- Für Version 1 Betrieb im vertrauenswürdigen internen Netz angenommen (kein öffentliches
  Deployment). TLS/Reverse-Proxy ist Deployment-Sache.

## 15. Teststrategie

- **AdoPoller/AdoClient:** Unit-Tests gegen aufgezeichnete ADO-API-Fixtures — Erkennung von
  add/modify/delete, Pfad-Filter, Alt-/Neu-Content, „last seen"-Fortschritt.
- **ChangeService:** all-accepted, Badge-Zahlen, Meeting-Gruppierung (rejected vor klaerung),
  Vote-Backfill neuer Hüter, Vote-Reset bei erneuter Dateiänderung.
- **AuthService/API:** Kommentarpflicht, Code-Einlösung (Init/Invite), Doppel-Einlösung
  abgelehnt.
- **Diff-Engine:** Snapshot-Tests (neue Datei, add/del/changed-Blöcke, Wort-Diff).
- **UI:** Komponententests der Widget-Zustände (eingeklappt/ausgeklappt/Toast) und des Vote-Flows
  (Pflicht-Kommentar erzwungen), Tab-Navigation.

## 16. Repo-Struktur (Vorschlag)

```
mira-guardian/
  apps/
    server/      # guardian-server (Node/TS, SQLite, Docker)
    widget/      # guardian-widget (Electron + React + Tailwind + Catppuccin)
  packages/
    shared/      # gemeinsame Typen (Change, Vote, Guardian, DTOs)
  docker-compose.yml   # Service: guardian-server
  docs/
```

## 17. Offene Punkte / bewusste Grenzen

- Rename/Move = delete+add (kein Move-Tracking).
- Ein Repo/Branch pro Instanz.
- Zyklus-Abschluss ist **manuell** („Meeting abgeschlossen"); kein automatischer Wochenwechsel
  (bestätigte Entscheidung).
- Betrieb im internen Netz; Härtung für externes Deployment ist späteres Thema.
