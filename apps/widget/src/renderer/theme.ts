import type { VoteStatus } from "@guardian/shared";

// "uebersprungen" bekommt eine eigene, zurückgenommene Farbe: es ist kein
// Urteil, soll aber unterscheidbar von einer echten Zustimmung bleiben.
const TEXT: Record<VoteStatus, string> = {
  akzeptiert: "text-ctp-green",
  klaerung: "text-ctp-yellow",
  abgelehnt: "text-ctp-red",
  offen: "text-ctp-subtext0",
  uebersprungen: "text-ctp-overlay1",
};
export function statusText(s: VoteStatus) { return TEXT[s]; }

const BORDER: Record<VoteStatus, string> = {
  akzeptiert: "border-ctp-green",
  klaerung: "border-ctp-yellow",
  abgelehnt: "border-ctp-red",
  offen: "border-ctp-surface2",
  uebersprungen: "border-ctp-overlay0",
};
export function statusBorder(s: VoteStatus) { return BORDER[s]; }

const DOT: Record<VoteStatus, string> = {
  akzeptiert: "bg-ctp-green",
  klaerung: "bg-ctp-yellow",
  abgelehnt: "bg-ctp-red",
  offen: "bg-ctp-surface2",
  uebersprungen: "bg-ctp-overlay0",
};
// Worst-first aggregate for a change's sidebar dot: one rejection outweighs
// everything, one open vote keeps the change "pending" even if others accepted.
export function aggregateDot(statuses: VoteStatus[]) {
  if (statuses.includes("abgelehnt")) return DOT.abgelehnt;
  if (statuses.includes("klaerung")) return DOT.klaerung;
  if (statuses.includes("offen")) return DOT.offen;
  return DOT.akzeptiert;
}

const TYPE: Record<string, { text: string; bg: string }> = {
  Decision: { text: "text-ctp-blue", bg: "bg-ctp-blue/15" },
  Learning: { text: "text-ctp-mauve", bg: "bg-ctp-mauve/15" },
  Convention: { text: "text-ctp-peach", bg: "bg-ctp-peach/15" },
  Process: { text: "text-ctp-green", bg: "bg-ctp-green/15" },
  Kontext: { text: "text-ctp-teal", bg: "bg-ctp-teal/15" },
};
export function typeBadge(label: string) {
  return TYPE[label] ?? { text: "text-ctp-overlay1", bg: "bg-ctp-surface1" };
}
