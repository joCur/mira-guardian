import React from "react";
import type { ChangeKind } from "@guardian/shared";

const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/") + 1);
const nameOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/**
 * Wie sich der Pfad geändert hat. Für Hüter ist der Unterschied wichtig:
 * ein anderer Ordner heißt in der Memory-Bank andere Ebene und damit anderer
 * Geltungsbereich, ein anderer Dateiname meist nur ein anderes Namensschema.
 */
export function moveLabel(previousPath: string, filePath: string): string {
  const ordner = dirOf(previousPath) !== dirOf(filePath);
  const name = nameOf(previousPath) !== nameOf(filePath);
  if (ordner && name) return "Verschoben und umbenannt";
  return ordner ? "Verschoben" : "Umbenannt";
}

/**
 * Ohne inhaltliche Änderung gibt es keinen Diff zu sehen. Damit die Änderung
 * trotzdem bewertbar ist, muss dastehen, was aus was geworden ist.
 */
export function RenameNotice({ previousPath, filePath, changeKind }:
  { previousPath: string; filePath: string; changeKind: ChangeKind }) {
  const nurVerschoben = changeKind === "rename";
  return (
    <div className="bg-ctp-blue/10 border border-ctp-blue/35 rounded-lg px-4 py-3 mb-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] tracking-[0.08em] font-semibold uppercase text-ctp-blue">
          {moveLabel(previousPath, filePath)}
        </span>
        <span className="text-[11.5px] text-ctp-subtext0">
          {nurVerschoben ? "Inhalt unverändert" : "Inhalt zusätzlich geändert"}
        </span>
      </div>
      <div className="mt-2 font-mono text-[12px] leading-relaxed">
        <div className="flex gap-1.5 min-w-0">
          <span className="text-ctp-overlay0 shrink-0 select-none" aria-hidden>·</span>
          <span className="text-ctp-red/90 line-through break-all">{previousPath}</span>
        </div>
        <div className="flex gap-1.5 min-w-0">
          <span className="text-ctp-overlay0 shrink-0 select-none" aria-hidden>→</span>
          <span className="text-ctp-green break-all">{filePath}</span>
        </div>
      </div>
    </div>
  );
}
