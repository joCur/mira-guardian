# Widget-Dateiansicht: Lesbarkeit verbessern

**Datum:** 2026-07-28
**Status:** Entwurf zur Review
**Bereich:** `apps/widget` (Renderer, Dateiansicht im Änderungen-Tab)

## Problem

Die Dateiansicht (rechte Spalte im Änderungen-Tab, `DiffView`) rendert
Memory-Bank-Inhalte mit einem minimalen Eigenbau-Renderer. Drei konkrete
Schmerzpunkte:

1. **Platznutzung:** Der Inhalt ist auf `max-w-[660px]` begrenzt; bei
   breiterem Fenster bleibt viel Fläche ungenutzt.
2. **Neue Dateien:** Der gesamte Inhalt liegt in einer grünen Vollflächen-Box
   (`bg-ctp-green/10` mit grünem Rand) — heller Text auf grünem Grund liest
   sich schlecht und wirkt seltsam.
3. **Frontmatter:** Das YAML-Frontmatter der Records (name, description,
   metadata) wird nicht sinnvoll dargestellt, sondern landet als roher
   Fließtext im Inhalt.

Zusätzlich rendert der Eigenbau-Renderer nur einen Markdown-Bruchteil
(H1–H3 als Einzeiler, Listen, `**fett**`, `` `code` ``) — Codefences,
Tabellen, Blockquotes und Links erscheinen als unformatierter Text.

## Entscheidung (vom User gewählt: Ansatz B)

Umstieg auf eine echte Markdown-Bibliothek plus gezielte Fixes der drei
Schmerzpunkte. Das Frontmatter wird als **Metadaten-Karte** dargestellt.

## Nicht-Ziele (YAGNI)

- Kein Syntax-Highlighting in Codeblöcken.
- Keine Bild-Einbettung (bräuchte ADO-Authentifizierung).
- Keine Gliederungs-Navigation / Inhaltsverzeichnis.
- Kein HTML-Passthrough (kein `rehype-raw`) — Inhalte kommen aus ADO,
  Rendering bleibt XSS-sicher.

## Architektur

### Markdown-Rendering

- Neue Abhängigkeiten: `react-markdown`, `remark-gfm` (Tabellen,
  Durchstreichen, Task-Listen), `yaml` (Frontmatter-Parsing).
- Die bestehende Diff-Pipeline bleibt unverändert: `diffBlocks()` liefert
  weiterhin Blöcke (`same`/`add`/`del`/`changed`) mit `⟦+…⟧`/`⟦-…⟧`-
  Wortmarkern; die Block-Färbung (grüner/roter Seitenstreifen) bleibt.
- Pro Diff-Block rendert ein `<ReactMarkdown>`-Aufruf den Block-Inhalt.
- Ein kleines eigenes remark-Plugin (`remarkDiffMarks`) wandelt die
  `⟦+…⟧`/`⟦-…⟧`-Textmuster in `ins`/`del`-Knoten um; die components-Map
  stylt sie wie bisher (grün/rot hinterlegt).
- Alle Elemente werden über die components-Map im Catppuccin-Schema
  gestylt (h1–h6, p, ul/ol/li, code/pre, table, blockquote, a, hr).
  Die Design-Referenz (Claude-Design-Dokument) bleibt maßgeblich,
  Catppuccin-Farben bleiben.
- Links: Klick öffnet den Standard-Browser über eine IPC-Brücke
  `openExternal` (main-Prozess: `shell.openExternal`). Existiert eine
  solche Brücke noch nicht, wird sie ergänzt (preload + bridge.d.ts).
  Nur `http(s)`-URLs werden durchgelassen.

### Frontmatter-Karte

- Vor `diffBlocks()` wird das Frontmatter von altem und neuem Stand
  abgetrennt (`---`-Fences am Dateianfang) und mit `yaml` geparst.
- Oberhalb des Inhalts erscheint eine kompakte Karte. Die echten Records
  haben **kein einheitliches Schema** (Decisions: `status`, `date`,
  `last-modified`, `category`, `deciders`; Learnings zusätzlich
  `observed-in`; Rules: `paths`-Array), daher rendert die Karte
  **generisch**:
  - `status` und `category` als farbige Badges (Theming analog
    `typeBadge`),
  - Arrays (z. B. `paths`) als Monospace-Zeilen,
  - `description`/`name` — falls vorhanden — prominent bzw. Monospace,
  - alle übrigen Skalarfelder als kompakte Key-Value-Zeilen.
- YAML-Kommentare (`# status: Active | Declined | …`-Schemazeilen) fallen
  beim Parsen weg und erscheinen nicht — gewollter Lesbarkeitsgewinn.
- Diff im Frontmatter: Felder werden alt/neu verglichen; geänderte Werte
  zeigen den alten Wert rot durchgestrichen, den neuen grün hinterlegt.
- Fehlerfälle: kein Frontmatter oder kaputtes YAML → keine Karte, der
  Inhalt rendert normal (das rohe Frontmatter wird dann nicht in den
  Inhalt übernommen, wenn es als solches erkannt, aber nicht parsebar
  ist — es erscheint als dezenter Codeblock).
- Der Diff läuft nur über den Inhalt nach dem Frontmatter; die Karte
  übernimmt die Frontmatter-Darstellung vollständig.

### Neue Dateien

- Die grüne Vollflächen-Box entfällt; der Inhalt rendert als normales
  Dokument (inkl. Frontmatter-Karte).
- Das vorhandene „NEUE DATEI"-Badge im Header bleibt das Signal; das
  redundante Inline-Badge („＋ Neue Datei — gesamter Inhalt ist neu")
  entfällt.

### Platznutzung

- Content-Breite in `ChangesTab` von `max-w-[660px]` auf `max-w-[820px]`;
  gilt für Dateiinhalt und Kommentarliste. Bewusst nicht unbegrenzt:
  Zeilenlängen über ~90 Zeichen verschlechtern die Lesbarkeit.

## Komponenten

| Einheit | Zweck |
|---|---|
| `DiffView.tsx` (Umbau) | Orchestriert: Frontmatter abtrennen → Karte → Diff-Blöcke rendern |
| `FrontmatterCard.tsx` (neu) | Metadaten-Karte inkl. Feld-Diff |
| `MarkdownBlock.tsx` (neu) | `<ReactMarkdown>` mit remark-gfm, remarkDiffMarks und Catppuccin-components-Map |
| `diff/frontmatter.ts` (neu) | Abtrennen + Parsen (yaml), Feldvergleich alt/neu |
| `diff/remarkDiffMarks.ts` (neu) | remark-Plugin: `⟦+…⟧`/`⟦-…⟧` → `ins`/`del` |
| `diff/diff.ts` (unverändert) | Block-/Wort-Diff wie bisher |

## Fehlerbehandlung

- Kaputtes YAML → keine Karte, Frontmatter als dezenter Codeblock.
- Nicht-`http(s)`-Links → kein `openExternal`, Link inert.
- `newMd === null` (gelöschte Datei) → Verhalten wie bisher.

## Tests (vitest, bestehende Suite erweitern)

- Codefence rendert als `<pre><code>`, Tabelle als `<table>`.
- `⟦+…⟧`/`⟦-…⟧` werden zu `ins`/`del` mit bestehenden Farben.
- Frontmatter-Karte: status/category als Badges, `paths`-Array als
  Monospace-Zeilen, Key-Value-Felder erscheinen; YAML-Kommentare
  erscheinen nicht; geändertes Feld zeigt alt (del) und neu (ins);
  kaputtes YAML → keine Karte, Frontmatter als Codeblock.
- Neue Datei: kein grüner Vollflächen-Container mehr; Inhalt rendert.
- Bestehende DiffView/ChangesTab-Tests werden angepasst statt gelöscht.
- Abschließende Verifikation in der echten Electron-App (Playwright
  `_electron`), nicht im Browser-Harness.
