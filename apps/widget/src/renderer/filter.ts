import { fileType, memoryLevel } from "@guardian/shared";

/**
 * Suche und Filter für die Listen. Ebene und Typ kommen aus dem Pfad, die Suche
 * geht über alles, was in einer Zeile steht — Pfad, Zusammenfassung, Autor,
 * Commit und der eigene Kommentar.
 */
export interface Filter {
  text: string;
  /** Ebenen-Id aus memoryLevel; null heißt „alle Ebenen". */
  level: string | null;
  /** Typ-Label aus fileType; null heißt „alle Typen". */
  type: string | null;
}

export const NO_FILTER: Filter = { text: "", level: null, type: null };

export function isFiltering(f: Filter): boolean {
  return f.text.trim() !== "" || f.level !== null || f.type !== null;
}

/** Alles, was Suche und Filter von einem Eintrag brauchen. */
export interface Filterable {
  filePath: string;
  summary?: string;
  authorName?: string;
  commitShort?: string;
  comment?: string | null;
  /** Dokumentinhalt, sofern er vorliegt — im Verlauf liefert der Server ihn nicht. */
  oldMd?: string | null;
  newMd?: string | null;
}

// Was ohne Suche schon in der Zeile steht, gegenüber dem, was erst die
// Volltextsuche erschließt. Die Trennung entscheidet, ob ein Treffer eine
// Fundstelle braucht.
const metaFelder = (i: Filterable) => [i.filePath, i.summary, i.authorName, i.commitShort, i.comment];
const inhaltFelder = (i: Filterable) => [i.newMd, i.oldMd];

const begriffe = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean);
const enthaelt = (felder: (string | null | undefined)[], term: string) =>
  felder.some(f => f && f.toLowerCase().includes(term));

export function matches(item: Filterable, f: Filter): boolean {
  if (f.level !== null && memoryLevel(item.filePath).id !== f.level) return false;
  if (f.type !== null && fileType(item.filePath).label !== f.type) return false;
  // Mehrere Wörter grenzen ein, statt sich zu widersprechen: „adr anna" findet
  // die Entscheidung von Anna, nicht jede Zeile mit einem der beiden Wörter.
  const terms = begriffe(f.text);
  if (terms.length === 0) return true;
  // Feldweise statt über einen zusammengesetzten Text: der Dokumentinhalt ist
  // groß, und so bricht die Suche beim ersten Treffer ab.
  const felder = [...metaFelder(item), ...inhaltFelder(item)];
  return terms.every(t => enthaelt(felder, t));
}

export interface Fundstelle { vor: string; treffer: string; nach: string; imAltenStand: boolean }

/**
 * Ausschnitt um den ersten Treffer, der nur im Dokument steht. Trifft die Suche
 * schon in dem, was die Zeile ohnehin zeigt, bleibt es null — der Hinweis
 * erscheint also genau dann, wenn er etwas erklärt.
 */
export function fundstelle(item: Filterable, f: Filter, vorlauf = 12, nachlauf = 70): Fundstelle | null {
  const meta = metaFelder(item);
  for (const term of begriffe(f.text)) {
    if (enthaelt(meta, term)) continue;
    for (const [text, imAltenStand] of [[item.newMd, false], [item.oldMd, true]] as const) {
      if (!text) continue;
      // Einzeilig lesbar machen: der Ausschnitt steht in einer Listenzeile.
      const flach = text.replace(/\s+/g, " ").trim();
      const at = flach.toLowerCase().indexOf(term);
      if (at < 0) continue;
      // Wenig Text davor, viel danach: die Zeile ist schmal und schneidet
      // rechts ab — der Treffer selbst muss sichtbar bleiben.
      const von = Math.max(0, at - vorlauf);
      const bis = Math.min(flach.length, at + term.length + nachlauf);
      return {
        vor: (von > 0 ? "…" : "") + flach.slice(von, at),
        treffer: flach.slice(at, at + term.length),
        nach: flach.slice(at + term.length, bis) + (bis < flach.length ? "…" : ""),
        imAltenStand,
      };
    }
  }
  return null;
}

export function applyFilter<T extends Filterable>(items: T[], f: Filter): T[] {
  return items.filter(i => matches(i, f));
}

export interface FilterOption { value: string; label: string; count: number }

/**
 * Nur Ebenen und Typen anbieten, die in den Einträgen vorkommen — ein Filter
 * ohne Treffer ist im Auswahlfeld eine Sackgasse. Die Anzahl steht dabei.
 */
export function filterOptions(items: Filterable[]): { levels: FilterOption[]; types: FilterOption[] } {
  const levels = new Map<string, FilterOption>();
  const types = new Map<string, FilterOption>();
  for (const i of items) {
    const lv = memoryLevel(i.filePath);
    const t = fileType(i.filePath).label;
    bump(levels, lv.id, lv.label);
    bump(types, t, t);
  }
  return {
    // Die Wurzel zuerst, danach alphabetisch — so steht apps/… immer an
    // derselben Stelle, egal welche Änderung gerade oben in der Liste liegt.
    levels: [...levels.values()].sort((a, b) =>
      a.value === "" ? -1 : b.value === "" ? 1 : a.label.localeCompare(b.label, "de")),
    types: [...types.values()].sort((a, b) => a.label.localeCompare(b.label, "de")),
  };
}

function bump(map: Map<string, FilterOption>, value: string, label: string) {
  const found = map.get(value);
  if (found) found.count++;
  else map.set(value, { value, label, count: 1 });
}
