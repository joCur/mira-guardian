import React from "react";
import type { ChangeKind } from "@guardian/shared";

/**
 * Zu einer geänderten oder gelöschten Datei fehlt der Stand von vorher, also
 * gibt es nichts zu vergleichen. Das muss dastehen: ohne den Hinweis liest sich
 * der unmarkierte Text wie ein frisch angelegtes Dokument, und der Hüter
 * bewertet eine Änderung, die er nie gesehen hat.
 */
export function BaselineNotice({ changeKind }: { changeKind: ChangeKind }) {
  return (
    <div className="bg-ctp-yellow/10 border border-ctp-yellow/35 rounded-lg px-4 py-3 mb-4">
      <span className="text-[10px] tracking-[0.08em] font-semibold uppercase text-ctp-yellow">
        Vergleichsstand fehlt
      </span>
      <div className="text-[11.5px] text-ctp-subtext0 leading-snug mt-1.5">
        {changeKind === "delete"
          ? "Der Inhalt vor dem Löschen ist nicht abrufbar."
          : "Unten steht das vollständige Dokument, nicht der Unterschied zum vorigen Stand."}
      </div>
    </div>
  );
}
