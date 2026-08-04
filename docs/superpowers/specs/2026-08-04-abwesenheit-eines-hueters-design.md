# Abwesenheit eines Hüters

**Datum:** 2026-08-04
**Status:** Entwurf zur Review
**Bereich:** `packages/shared`, `apps/server`, `apps/widget`

## Problem

Der Abschluss einer Änderung hängt an der Einstimmigkeit **aller**
eingetragenen Hüter:

```ts
// changeService.ts:11–16
allAccepted(changeId) → guardians.every(g => vote(g)?.status === "akzeptiert")
```

Einen Begriff von Abwesenheit gibt es nirgends im Code. Ist ein Hüter drei
Wochen im Urlaub, folgt daraus:

1. **Nichts kann abgeschlossen werden.** Der gesamte Bestand bleibt in
   `openChanges()` — auch das, was die beiden Anwesenden längst einvernehmlich
   akzeptiert haben.
2. **Der Rückkehrer bekommt den vollen Stapel.** `toRate` enthält jede Änderung
   der Abwesenheit, der Badge nennt dieselbe Zahl, und `AppRoot.tsx:75` toastet
   beim Start jede verpasste Änderung in einer Schleife ohne Deckel.
3. **Die Arbeit der Anwesenden verfällt.** `resetVotesForChange`
   (`adoPoller.ts:157`) löscht bei jedem neuen Commit auf dieselbe Datei alle
   Bewertungen. Weil während der Abwesenheit nichts abgeschlossen wird, liegen
   Einträge wochenlang offen — und werden entsprechend häufiger wieder
   eingesammelt. Das ist der eigentliche Preis der Blockade, nicht der Stapel
   beim Rückkehrer.

Was heute schon gut funktioniert und bleiben soll: der Tab **Offene Punkte**
zeigt nur echte Streitfälle (`meetingChanges()`), rein ausstehende
Bestätigungen zählen nur in eine Hinweiszeile. Die zwei Anwesenden können also
weiterhin sinnvoll besprechen — sie können nur nicht abschließen. Und die
Änderungs-Identität ist bereits ein Eintrag je Repo/Branch/Dateipfad, wobei
`oldMd` und `baselineCommitId` bewusst beim ersten erfassten Commit stehen
bleiben, „damit eine Folgeänderung den Vergleich nicht auf den jüngsten
Zwischenstand verkürzt" (`adoPoller.ts:150`). Der Rückkehrer sieht pro Datei
also **einen kumulativen Diff**, nicht einen pro Commit. Der Stapel wächst mit
der Breite der Memory Bank, nicht mit der Commit-Frequenz — die Grundlage für
die Leseliste weiter unten ist damit schon da.

## Kernentscheidung: Abschluss ist ein Ereignis, kein Rechenergebnis

Die naheliegende Lösung wäre, die Anwesenheit bei jeder Abfrage
mitzurechnen — `allAccepted` ignoriert abwesende Hüter. Das ist falsch: Endet
die Abwesenheit, wird die Bedingung wieder unwahr und **der gesamte während des
Urlaubs abgeschlossene Bestand poppt in die Arbeitsliste zurück**. Genau das
Problem, das gelöst werden soll.

Deshalb wird das Überspringen **festgeschrieben**: Ein neuer Vote-Status
`uebersprungen` hält in der Datenbank fest, dass diese Stimme wegen Abwesenheit
nicht eingeholt wurde. Der Abschluss ist damit ein Fakt und überlebt die
Rückkehr.

`uebersprungen` ist bewusst **nicht** `akzeptiert`: der Verlauf soll keine
Zustimmung behaupten, die es nie gab.

## Abwesenheit

Zwei Datumsangaben am Hüter, beide Ränder inklusive:

```
absentFrom, absentUntil : "YYYY-MM-DD" | null
abwesend  ⇔  absentFrom ≤ heute ≤ absentUntil
```

Reine Datumsangaben, verglichen gegen das Serverdatum — kein Zeitstempel, damit
die Mitternachtskante belanglos ist. Der Ablauf ist damit automatisch; ohne
Enddatum gibt es keine Abwesenheit, ein Trio wird nicht still zum Duo.

**Jeder Hüter darf die Abwesenheit jedes Hüters eintragen.** Das ist kein
Rechteloch, sondern der Kern der Lösung für den Fall, der sich nicht selbst
einträgt: Krankheit. Damit erübrigt sich eine zweite, zeitbasierte Mechanik
(siehe Verworfene Alternativen). Alles ist im Hüter-Tab für alle sichtbar.

## Das Quorum

**Untergrenze zwei Anwesende.** Würde die Abwesenheit dazu führen, dass weniger
als zwei Hüter anwesend sind, wirkt sie **für niemanden** — der Stand fällt auf
das heutige Verhalten (Einstimmigkeit aller) zurück. Bei drei Hütern darf also
höchstens einer effektiv abwesend sein. Ein Hüter allein soll nichts
durchwinken können.

```
absent = Hüter mit absentFrom ≤ heute ≤ absentUntil
if (alle.length - absent.length < 2) absent = []      // Abwesenheit wirkt nicht
```

**Das Abschluss-Ereignis** (`settle`) läuft für eine einzelne Änderung:

| Bedingung | Ergebnis |
|---|---|
| Kein Hüter effektiv abwesend | nichts zu tun |
| Ein anwesender Hüter hat nicht `akzeptiert` | nichts zu tun |
| Ein abwesender Hüter hat `abgelehnt` oder `klaerung` | **nichts zu tun** — ein Einspruch überlebt den Urlaub |
| sonst | alle `offen`-Votes abwesender Hüter → `uebersprungen` |

Nur **offene** Stimmen werden übersprungen, niemals eine abgegebene. Sonst
ließe sich ein Einspruch durch Urlaub wegräumen.

Ausgelöst wird `settle` an genau zwei Stellen:

1. nach jedem Vote — für diese Änderung,
2. nach jeder Änderung an einer Abwesenheit — für alle noch offenen Änderungen
   (die Menge ist klein genug, ein Durchlauf über `openChanges()` genügt).

Beim **Ablauf** einer Abwesenheit passiert nichts, und das ist der Punkt: kein
Cron, kein Nachlauf, nichts poppt zurück.

Folgeanpassungen in `ChangeService`: `allAccepted` heißt künftig `isSettled`
und akzeptiert `akzeptiert` **oder** `uebersprungen`; `stripeStatus` und `RANK`
behandeln `uebersprungen` wie `akzeptiert` (es blockiert nichts);
`badgeCount` liefert für einen abwesenden Hüter `0`.

## Rückkehr: eine Leseliste, kein Arbeitsstapel

Alles, was ohne mich entschieden wurde, ist mein Vote mit Status
`uebersprungen` und leerem `seenAt`, **solange die Änderung abgeschlossen
ist**. Diese Einträge sind keine offenen Aufgaben — sie erscheinen nicht in
`toRate` und nicht im Badge.

Der Zusatz „solange abgeschlossen" verhindert eine Doppelung: wird eine
übersprungene Änderung wieder strittig (jemand legt Einspruch ein), ist sie
wieder eine echte Aufgabe. Dann hat die Arbeitsliste Vorrang und der Eintrag
verschwindet aus der Leseliste. Bei drei Hütern ist der Fall konstruiert — bei
vier reicht ein Einspruch des einen Rückkehrers, während der zweite noch
abwesend ist.

Im Änderungen-Tab kommt dafür ein weiterer Abschnitt in der linken Spalte:
**OHNE MICH ENTSCHIEDEN**, mit Anzahl, eingeklappt und gedämpft. Er steht
zwischen „VON MIR AKZEPTIERT" und „AUS DEM VERLAUF" und wird von `applyFilter`
und der Suchzeile genauso erfasst wie die beiden Arbeitsabschnitte — sonst
verschwindet er bei aktivem Filter nicht mit, sondern bleibt stehen. Der
Detailbereich zeigt die Änderung wie gewohnt mit kumulativem Diff, aber statt
der drei Bewertungsknöpfe zwei Aktionen:

- **Gesehen** — setzt `seenAt`, der Eintrag verlässt die Liste. Im Kopf des
  Abschnitts zusätzlich „Alle als gesehen markieren".
- **Einspruch** — ein gewöhnlicher Vote `klaerung` mit Pflichtkommentar über den
  bestehenden Endpunkt. Damit ist die Änderung nicht mehr abgeschlossen, landet
  wieder in `openChanges()` und erscheint in Offene Punkte. Kein neuer
  Mechanismus nötig.

„Gesehen" ist freiwillig und erzeugt keinen Druck: kein Badge, keine Toasts,
keine Erinnerung. Wer die Liste ignoriert, blockiert nichts.

## Datenmodell und Migration

| Tabelle | Änderung |
|---|---|
| `guardian` | `absent_from TEXT`, `absent_until TEXT` (beide nullable) |
| `vote` | `seen_at TEXT` (nullable) |
| Vote-Status | `VOTE_STATUSES` um `uebersprungen` erweitert (deutsch, ASCII-transliteriert wie `klaerung`) |

Der Weg dafür steht bereits: `Store.migrate()` (`store.ts:21`) zieht neue
Spalten idempotent über `PRAGMA table_info` und `ALTER TABLE … ADD COLUMN`
nach, weil `schema.sql` mit `CREATE TABLE IF NOT EXISTS` bestehende Tabellen
unangetastet lässt. Die drei neuen Spalten reihen sich dort ein — zusätzlich
gehören sie in `schema.sql`, damit Neuinstallationen sie ohne Migration haben.
Ein Neuanlegen der Datenbank ist ohnehin keine Option, sie liegt als
Bind-Mount.

`resetVotesForChange` muss `seen_at` mit zurücksetzen — sonst gilt eine neue
Fassung einer Datei als bereits gesehen.

`STATUS_LABELS` bekommt `uebersprungen: "Übersprungen (abwesend)"`. Bewusst
neutral formuliert, weil dasselbe Label im eigenen Verlauf **und** in der
Hüter-Zeile fremder Änderungen erscheint; „Ohne mich akzeptiert" würde dort in
die falsche Person zeigen.

## Server-Änderungen

| Endpunkt | Änderung |
|---|---|
| `GET /changes` | zusätzlich `decidedWithoutMe`: meine `uebersprungen`-Votes ohne `seenAt` zu abgeschlossenen Änderungen, neueste zuerst — nie eine Änderung, die auch in `toRate` steht |
| `GET /guardians` | Hüter tragen `absentFrom` und `absentUntil` |
| `PUT /guardians/:id/absence` | **Neu.** Body `{ from, until }` oder `null` zum Löschen. Jeder Hüter darf für jeden setzen; `until ≥ from`, sonst 400. Löst `settle` über alle offenen Änderungen aus |
| `POST /me/seen` | **Neu.** `{ changeIds: string[] }`, setzt `seenAt` nur auf eigenen Votes |
| `POST /changes/:id/vote` | `uebersprungen` ist über die API **nicht** setzbar (400); setzt `seenAt` zurück; löst `settle` aus. Dazu die heute fehlende Laufzeitprüfung gegen `VOTE_STATUSES` nachziehen — bisher wird der Body nur gecastet (`httpApi.ts:113`), ein Tippfehler landete stumm in der DB |
| `GET /me/history` | enthält `uebersprungen`-Einträge (Label „Übersprungen (abwesend)") |

## Widget-Änderungen

- **Hüter-Tab:** die Hüter-Karte trägt neben „Neu verknüpfen" einen Chip
  „abwesend bis 28.08." beziehungsweise den Knopf „Abwesenheit eintragen", der
  zwei Datumsfelder aufklappt („von" vorbelegt mit heute) — dasselbe Muster wie
  der Relink-Code, der dort schon aufklappt. Greift die Untergrenze, erscheint
  der Hinweis, dass die Abwesenheit derzeit ohne Wirkung ist.
- **Änderungen-Tab:** Abschnitt „OHNE MICH ENTSCHIEDEN" wie oben; er erscheint
  nur, wenn er Inhalt hat.
- **Offene Punkte:** in der Hüter-Zeile wird ein `offen`-Vote eines derzeit
  abwesenden Hüters als „abwesend" dargestellt statt als „ausstehend" — im
  Meeting muss sichtbar sein, auf wen **nicht** gewartet wird. Die Zählzeile
  ergänzt „Anna ist bis 28.08. abwesend".
- **Toasts:** unterdrückt, solange ich selbst abwesend bin. Zusätzlich ein
  Deckel auf die Catch-up-Toasts (fünf plus Sammelzeile „und 23 weitere") —
  wirkt auch bei jedem längeren Wochenende und ist unabhängig vom Rest nützlich.

## Randfälle

| Fall | Verhalten |
|---|---|
| Abwesender hat vor dem Urlaub abgelehnt | Kein Abschluss, die Änderung wartet auf die Rückkehr |
| Zwei von drei abwesend | Abwesenheit wirkt für niemanden, heutiges Verhalten |
| Abwesenheit endet | Nichts passiert, Abgeschlossenes bleibt abgeschlossen |
| Urlaub abgesagt, Abwesenheit gelöscht | Bereits Übersprungenes bleibt übersprungen und landet in der Leseliste |
| Neuer Commit auf eine übersprungene Datei | Alle Votes zurück auf `offen`, `seenAt` gelöscht; erneut überspringbar, Diff bleibt kumulativ |
| Neuer Hüter während der Abwesenheit | Unverändert: offene Votes nur für noch nicht abgeschlossene Änderungen |
| Abwesender arbeitet trotzdem im Widget | Kann normal bewerten; eine abgegebene Stimme verhindert das Überspringen |
| Übersprungene Änderung wird wieder strittig | Sie verlässt die Leseliste und erscheint in `toRate` — nie in beiden Listen |

## Verworfene Alternativen

- **Anwesenheit bei jeder Abfrage berechnen** (ohne `uebersprungen`): der
  naheliegende Einzeiler in `allAccepted`. Bei der Rückkehr poppt der ganze
  Bestand zurück in die Arbeitsliste — siehe Kernentscheidung.
- **Dauerhaftes 2-von-3-Quorum:** gibt den Grundgedanken auf, dass jeder Hüter
  jede Änderung gesehen hat. Das ist der Zweck des Werkzeugs.
- **Stille Zustimmung nach Frist** (Auto-Accept nach X Tagen): nicht nötig,
  weil die Abwesenheit von jedem für jeden eingetragen werden kann und damit
  auch Krankheit abdeckt. Eine zeitbasierte Automatik kann Abwesenheit nicht
  von Nachlässigkeit unterscheiden — genau die Verwechslung, die niemand will.
- **Vertretung/Delegation:** im Trio faktisch dasselbe Ergebnis wie das
  Quorum, aber ein Konzept mehr.
- **Nur Massen-Bewertung bei der Rückkehr:** löst die Blockade während der
  Abwesenheit nicht, nur ihre Nachwirkung.

## Nicht-Ziele

- Keine Anbindung an ein Urlaubs- oder Kalendersystem.
- Keine Rollen und Rechte — drei Hüter, keine Berechtigungsprüfung außer
  „eingetragener Hüter".
- Keine Änderung an Kommentarpflicht, Diff-Darstellung oder Poller.
- Kein Entfernen der Zyklus-Tabelle oder von `cycle_id`.
- Die Kosmetik der Status-Labels (`offen` wird als „ausstehend" angezeigt,
  gemischte Groß-/Kleinschreibung) bleibt unangetastet.

## Reihenfolge

`packages/shared` (Status, Labels, Typen) → Store samt Migration →
`ChangeService` (`isSettled`, `settle`, Anwesenheit) → API → Widget.
Nach dem Shared-Schritt ist jeder folgende Schritt für sich lauffähig.

## Tests

- **ChangeService:** `settle` setzt nur offene Votes Abwesender; kein Abschluss
  bei Ablehnung oder Klärungsbedarf eines Abwesenden; kein Abschluss, wenn die
  Untergrenze greift; `isSettled` akzeptiert `uebersprungen`; `stripeStatus`
  und `RANK` behandeln `uebersprungen` wie `akzeptiert`; `badgeCount` ist `0`
  für Abwesende.
- **Regressionstest zur Kernentscheidung:** nach Ablauf der Abwesenheit bleibt
  eine abgeschlossene Änderung abgeschlossen und erscheint nicht in `toRate`.
- **Store:** `migrate()` zieht die drei Spalten auf einer Datenbank ohne sie
  nach und ist beim zweiten Lauf wirkungslos; `resetVotesForChange` löscht
  `seen_at`.
- **API:** `/changes` liefert `decidedWithoutMe` und stellt keine Änderung
  gleichzeitig in `toRate` und `decidedWithoutMe`; `uebersprungen` über
  `POST /changes/:id/vote` wird mit 400 abgewiesen, ein unbekannter Status
  ebenso; `/me/seen` markiert nur eigene Votes; `until < from` wird abgewiesen.
- **Widget:** der dritte Abschnitt erscheint nur bei Inhalt; Einspruch setzt
  Klärungsbedarf und die Änderung erscheint in Offene Punkte; die Hüter-Zeile
  zeigt „abwesend" statt „ausstehend"; Toast-Deckel greift.
- Verifikation abschließend in der echten Electron-App.

## Entscheidungspunkte für die Review

1. **Verortung der Leseliste:** dritter Abschnitt im Änderungen-Tab (so
   entworfen) oder ein eigener vierter Tab? Der Abschnitt hält die Tab-Leiste
   schmal, ein eigener Tab wäre nach einem langen Urlaub übersichtlicher.
2. **„Gesehen" freiwillig** (so entworfen) oder mit sanfter Erinnerung, solange
   die Liste nicht leer ist?
3. **Untergrenze zwei Anwesende** — passt das für ein Trio, oder soll bei zwei
   gleichzeitig Abwesenden lieber der zuletzt eingetragene Urlaub verfallen
   statt beide unwirksam zu machen?
