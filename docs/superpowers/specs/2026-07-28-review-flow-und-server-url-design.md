# Review-Ablauf neu ordnen + Server-URL konfigurierbar

**Datum:** 2026-07-28
**Status:** Entwurf zur Review
**Bereich:** `apps/widget`, `apps/server`, `packages/shared`

## Problem

Vier Punkte aus dem Praxistest:

1. **Server-URL nicht einstellbar.** Der Client nimmt immer
   `http://localhost:4000`. Die Brücke `setServerUrl` existiert, wird vom
   Renderer aber nie aufgerufen. Sobald der Server zentral läuft, ist die App
   unbrauchbar.
2. **Hüter-Übersicht und Verlauf tragen nicht.** Die Hüter-Übersicht zeigt nur
   abgelehnte Änderungen und solche mit Klärungsbedarf — ausstehende
   Bewertungen fehlen, obwohl genau die im Meeting durchzugehen sind. Der
   Verlauf listet abgeschlossene Wochen-Meetings, was niemandem hilft.
3. **Die Änderungsliste läuft voll.** Selbst bewertete Änderungen bleiben
   zwischen den unbewerteten stehen.
4. **Kein Weiterspringen.** Nach einer Bewertung bleibt die App auf derselben
   Änderung stehen; die nächste muss von Hand gewählt werden.

## Kernentscheidung: Listen lösen sich vom Wochen-Zyklus

Heute hängen alle Listen am offenen Zyklus (`getOpenCycle()`). Eine nicht
akzeptierte Änderung verschwindet damit beim Zyklus-Wechsel aus dem Blick —
das widerspricht der Vorgabe „wird es nicht akzeptiert, bleibt es einfach
weiterhin stehen".

Deshalb: **Arbeitslisten werden zyklus-unabhängig.** Sie zeigen alle
Änderungen, die noch nicht von allen Hütern akzeptiert sind — egal aus welcher
Woche. Der Zyklus bleibt im Datenmodell als Wochen-Zuordnung erhalten
(`cycle_id` an jeder Änderung), verliert aber seine Rolle als Filter.

**Folge:** Die Aktion „Meeting abgeschlossen" (Zyklus schließen samt Notiz)
hat damit keine sichtbare Wirkung mehr — der bisherige Verlauf, der genau
diese Abschlüsse zeigte, wird zum persönlichen Bewertungsverlauf. Die Aktion
entfällt aus der Oberfläche; `POST /cycles/:id/close` bleibt vorerst im Server
bestehen (ungenutzt, kein Aufwand für Entfernung, keine Datenmigration).

## Die drei Tabs

### Änderungen — die eigene Arbeitsliste

Zwei Abschnitte in der linken Spalte:

| Abschnitt | Inhalt |
|---|---|
| **Zu bewerten** | Alle Änderungen, die ich noch nicht akzeptiert habe (mein Vote ist `offen`, `klaerung` oder `abgelehnt`) und die nicht von allen akzeptiert sind. Sortierung worst-first wie bisher. |
| **Von mir akzeptiert** | Änderungen, die ich akzeptiert habe, bei denen aber noch Hüter fehlen. Eingeklappt dargestellt, gedämpft. |

Von allen akzeptierte Änderungen verschwinden vollständig aus beiden
Abschnitten — nachlesbar bleiben sie im persönlichen Verlauf.

Eine von mir abgelehnte Änderung bleibt bewusst unter „Zu bewerten": Sie ist
unerledigt und gehört ins Meeting.

### Hüter-Übersicht — die Meeting-Liste

Zeigt **alle Änderungen, die nicht von allen akzeptiert sind**, damit das Team
sie gemeinsam durchgehen kann. Sortierung worst-first: abgelehnt →
Klärungsbedarf → ausstehend. Jede Karte zeigt wie bisher Pfad, Commit, Autor,
Zusammenfassung, alle Kommentare — plus neu eine Zeile mit dem Stand aller
Hüter (Avatare mit Status), damit im Meeting sichtbar ist, auf wen noch
gewartet wird.

Kopfzeile: Anzahl je Status statt der bisherigen Zwei-Zahlen-Zeile. Die
Notiz-Eingabe und der Abschluss-Knopf entfallen.

### Verlauf — der eigene Bewertungsverlauf

Liste **meiner** Bewertungen, neueste zuerst: Zeitpunkt, Datei, mein Status,
mein Kommentar. Klick öffnet die Änderung im Änderungen-Tab. Damit ist
nachvollziehbar, was ich wann entschieden habe — auch für Änderungen, die
inzwischen aus den Arbeitslisten verschwunden sind.

## Weiterspringen nach der Bewertung

Nach dem Speichern einer Bewertung wählt die App automatisch die nächste
Änderung aus der Liste „Zu bewerten". Regeln:

- Verlässt die bewertete Änderung die Liste (Akzeptieren), rückt der Eintrag
  an derselben Position nach — also der nachfolgende.
- Bleibt sie in der Liste (Ablehnen, Klärungsbedarf), springt die Auswahl auf
  den nächsten Eintrag darunter.
- Am Listenende: zurück zum ersten noch unbewerteten Eintrag; ist keiner mehr
  offen, bleibt die Auswahl stehen und der Leerzustand erscheint.

## Server-URL

- **Setup-Dialog:** Feld „Server-Adresse" oberhalb des Setup-Codes,
  vorbelegt mit `http://localhost:4000`. Wird vor dem Verbinden über
  `setServerUrl` gespeichert. Schlägt die Verbindung fehl, erscheint eine
  Fehlermeldung, die die Adresse als mögliche Ursache benennt.
- **Hüter-Tab:** Abschnitt „Verbindung" mit der aktuellen Adresse, Ändern
  möglich. Nach dem Speichern verbindet sich die App neu (Token bleibt).
- Validierung: nur `http(s)`-URLs, Leerzeichen werden getrimmt, ein
  abschließender `/` entfernt.

## Server-Änderungen

| Endpunkt | Änderung |
|---|---|
| `GET /changes` | Nicht mehr auf den offenen Zyklus beschränkt. Neue Struktur: `{ toRate, acceptedByMe, badge }` — `toRate` = nicht von allen akzeptiert und mein Vote ≠ `akzeptiert`; `acceptedByMe` = mein Vote = `akzeptiert`, aber nicht alle. |
| `GET /meeting` | Nicht mehr zyklus-gebunden. Liefert `{ changes, counts }` mit allen nicht vollständig akzeptierten Änderungen, worst-first, plus Zählern je Status. |
| `GET /me/history` | **Neu.** Meine Bewertungen (`status ≠ offen`), neueste zuerst, je Eintrag: Änderung (Pfad, Commit, Zusammenfassung), mein Status, mein Kommentar, `updatedAt`. |
| `GET /history` | Entfällt (Zyklus-Liste wird nicht mehr angezeigt). |

`ChangeService` bekommt dafür zyklus-freie Varianten (`allOpenChanges()`,
`toRate(guardianId)`, `acceptedByMe(guardianId)`); `Store` eine Abfrage für
die Votes eines Hüters mit zugehöriger Änderung.

## Nicht-Ziele

- Keine Änderung an Bewertungslogik, Kommentarpflicht oder Toasts.
- Kein Entfernen der Zyklus-Tabelle oder Datenmigration.
- Keine Paginierung im Verlauf (bei aktuell ~150 Änderungen unnötig).

## Tests

- `ChangeService`: `toRate` schließt von mir akzeptierte und vollständig
  akzeptierte aus; `acceptedByMe` nur teilweise akzeptierte; beides
  zyklus-übergreifend.
- API: `/changes` liefert die neue Struktur, `/me/history` nur eigene Votes,
  neueste zuerst.
- Widget: Änderungen-Tab zeigt beide Abschnitte; Auto-Sprung wählt den
  nächsten Eintrag (inkl. Listenende); Hüter-Übersicht zeigt auch
  ausstehende; Verlauf zeigt eigene Bewertungen; Server-URL-Feld speichert
  und validiert.
- Verifikation abschließend in der echten Electron-App.
