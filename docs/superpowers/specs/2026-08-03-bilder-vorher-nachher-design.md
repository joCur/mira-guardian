# Bilder im Review: vorher und nachher statt Quelltext

**Datum:** 2026-08-03
**Status:** Entwurf zur Review
**Bereich:** `apps/server` (ADO-Anbindung, HTTP-API), `apps/widget` (Dateiansicht), `packages/shared`

## Problem

Zur Memory Bank gehören nicht nur Dokumente, sondern auch Bilder — Diagramme,
die neben den Dokumenten liegen und von ihnen eingebettet werden. Für Hüter
sind sie bisher nicht bewertbar:

1. **Eine geänderte Bilddatei** wird wie ein Dokument eingelesen. Der Server
   holt jeden Dateiinhalt über `includeContent=true` als JSON-Zeichenkette;
   Binärdaten überleben diese Umwandlung nicht. In der Datenbank landet eine
   beschädigte Zeichenkette, die das Widget als Markdown rendert — im Review
   steht Quelltext statt eines Bildes.
2. **Eingebettete Bilder in Dokumenten** waren mit `img: () => null`
   abgeschaltet. Ein Dokument, dessen Aussage an einem Diagramm hängt, wird
   also mit einer Lücke an der entscheidenden Stelle zur Bewertung gestellt.

Punkt 2 war in der Spec zur Lesbarkeit der Dateiansicht (2026-07-28) bewusst
ein Nicht-Ziel: „bräuchte ADO-Authentifizierung". Genau die liegt inzwischen
im Server — das Widget muss ADO nie selbst ansprechen.

## Entscheidung

Bilder werden **nicht** in der Datenbank abgelegt, sondern beim Anzeigen über
eine geschützte Serverroute aus ADO geholt:

    GET /changes/:id/bild/:seite            → die geänderte Bilddatei selbst
    GET /changes/:id/bild/:seite?pfad=…     → ein Bild, das das Dokument einbettet

`seite` ist `vorher` oder `nachher`. Gründe gegen die Datenbank: sie liegt als
Bind-Mount auf dem Server und wüchse pro Bildfassung um hunderte Kilobyte,
während ADO zur Anzeigezeit ohnehin erreichbar ist. Der Server hält die zuletzt
geholten Bilder im Speicher, damit wiederholtes Ansehen ADO nicht belastet.

Dargestellt wird **nebeneinander** (vom User gewählt), mit Klick zum
Vergrößern. Bei nur einer Fassung — neu angelegt, gelöscht, nur verschoben —
steht nur diese da.

## Architektur

- `packages/shared/media.ts` — was ein Bild ist (`istBilddatei`) und wohin ein
  relativer Bildpfad zeigt (`aufloesenBildPfad`). Beide Seiten müssen dieselbe
  Regel verwenden, sonst holt der Server etwas anderes, als die Anzeige fragt.
- `AdoClient.getItemBytes` — Rohbytes über `download=true&$format=octetStream`
  statt `includeContent`. Auf der Vorher-Seite gilt zusätzlich HTTP 400 als
  „kein Vorgängerstand": So antwortet ADO, wenn die Datei im angefragten Commit
  erst angelegt wurde.
- `AdoPoller` — liest Bilddateien nicht mehr als Text ein und hält in
  `baselineCommitId` fest, gegen welchen Commit verglichen wird. Bei Dokumenten
  steckt die Basis in `oldMd`; Bilder brauchen den Bezugspunkt, damit eine
  Folgeänderung den Vergleich nicht auf den jüngsten Zwischenstand verkürzt.
- `BildDienst` (`apps/server/src/api/bilder.ts`) — Pfadauflösung, Seitenlogik,
  Zwischenspeicher.
- Widget: `BildVergleich` für Bilddateien, `EingebettetesBild` für Bilder in
  Dokumenten, beide über den Kontext in `renderer/bild/kontext.tsx`. Innerhalb
  eines Diffs bestimmt der Block die Fassung: ein Bild in gelöschtem Text
  gehört zur alten, überall sonst zur neuen.

## Nicht-Ziele (YAGNI)

- Kein Überblend-Regler und keine Hervorhebung der Unterschiede im Bild.
- Bilder von fremden Adressen (`http…`) werden nicht geladen, sondern nur
  benannt: Eine Doku darf nicht dafür sorgen, dass das Widget beim Ansehen
  fremde Server kontaktiert.
- Kein dauerhafter Bildspeicher auf dem Server (kein Cache auf der Platte).

## Sicherheit

Der `pfad`-Parameter wird gegen das Dokument aufgelöst und muss innerhalb des
Repos auf eine Bilddatei zeigen; alles andere wird abgewiesen. Sonst ließe sich
über eine Doku steuern, welchen Pfad der Server bei ADO anfragt. Die Route
liegt hinter der Anmeldung wie alle anderen Änderungsdaten.
