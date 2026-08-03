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
}

export function matches(item: Filterable, f: Filter): boolean {
  if (f.level !== null && memoryLevel(item.filePath).id !== f.level) return false;
  if (f.type !== null && fileType(item.filePath).label !== f.type) return false;
  // Mehrere Wörter grenzen ein, statt sich zu widersprechen: „adr anna" findet
  // die Entscheidung von Anna, nicht jede Zeile mit einem der beiden Wörter.
  const terms = f.text.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [item.filePath, item.summary, item.authorName, item.commitShort, item.comment]
    .filter(Boolean).join(" ").toLowerCase();
  return terms.every(t => haystack.includes(t));
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
