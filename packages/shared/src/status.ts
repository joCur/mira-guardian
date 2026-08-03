import type { VoteStatus, TypeRule } from "./types.js";

export const STATUS_LABELS: Record<VoteStatus, string> = {
  offen: "ausstehend",
  akzeptiert: "Akzeptiert",
  klaerung: "Klärungsbedarf",
  abgelehnt: "Abgelehnt",
};

// Memory-Bank-Levels: Records liegen auf Repo-Root ODER App-Ebene
// (apps/<app>/docs/…), daher Match auf Segmentgrenze statt Root-Anker.
export const DEFAULT_TYPE_RULES: TypeRule[] = [
  { pattern: "(^|/)docs/decisions/", label: "Decision" },
  { pattern: "(^|/)docs/learnings/", label: "Learning" },
  { pattern: "(^|/)docs/processes/", label: "Process" },
  { pattern: "(^|/)\\.claude/rules/", label: "Convention" },
  { pattern: "^memory-bank/", label: "Kontext" },
];

export function fileType(path: string, rules: TypeRule[] = DEFAULT_TYPE_RULES): { label: string } {
  for (const r of rules) {
    if (new RegExp(r.pattern).test(path)) return { label: r.label };
  }
  return { label: "Sonstige" };
}

export interface MemoryLevel {
  /** Pfad-Präfix vor dem Memory-Bank-Ordner; "" ist die Repo-Wurzel. */
  id: string;
  /** Anzeigename: „Repo" für die Wurzel, sonst der Präfix, z. B. apps/web. */
  label: string;
}

export const ROOT_LEVEL_LABEL = "Repo";

/**
 * Die Ebene eines Records: was vor dem Memory-Bank-Ordner steht. Aus
 * apps/web/docs/decisions/x.md wird apps/web, aus docs/decisions/x.md die
 * Wurzel. Abgeleitet aus derselben Regel, die den Typ bestimmt — so gilt eine
 * eigene TYPE_MAP auch für die Ebenen.
 */
export function memoryLevel(path: string, rules: TypeRule[] = DEFAULT_TYPE_RULES): MemoryLevel {
  for (const r of rules) {
    const m = new RegExp(r.pattern).exec(path);
    if (m) return level(path.slice(0, m.index));
  }
  // Ohne Typ-Treffer ist die Ebene nicht bestimmbar — beobachtet werden ohnehin
  // nur Memory-Bank-Pfade.
  return level("");
}

function level(prefix: string): MemoryLevel {
  // Regeln ohne Segment-Anker (eigene TYPE_MAP) lassen den Trenner stehen.
  const id = prefix.replace(/\/+$/, "");
  return { id, label: id || ROOT_LEVEL_LABEL };
}
