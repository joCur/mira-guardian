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
