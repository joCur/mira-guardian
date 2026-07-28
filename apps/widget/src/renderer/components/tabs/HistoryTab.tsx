import React from "react";
import type { Cycle } from "@guardian/shared";
import { EmptyState, ICON_HISTORY } from "../EmptyState.js";

// Kompakt ("29.06."), damit der Bereich in die schmale Wochen-Spalte passt.
const day = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
};

export function HistoryTab({ cycles }: { cycles: Cycle[] }) {
  if (cycles.length === 0) return (
    <EmptyState paths={ICON_HISTORY} title="Noch kein Verlauf">
      Abgeschlossene Wochen-Meetings erscheinen hier mit Zeitraum und Notiz —
      der erste Eintrag entsteht, sobald ein Meeting abgeschlossen wird.
    </EmptyState>
  );
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[760px] mx-auto">
        <div className="text-[19px] font-bold text-ctp-text mb-4">Verlauf</div>
        {cycles.map(w => {
          const range = [day(w.startsAt), day(w.endsAt)].filter(Boolean).join(" – ");
          return (
            <div key={w.id} className="flex items-center gap-4 bg-ctp-mantle border border-ctp-surface0 rounded-[10px] px-[18px] py-3.5 mb-2.5">
              <div className="w-[88px] shrink-0">
                <div className="font-mono text-[13px] font-semibold text-ctp-subtext1">{w.isoWeek}</div>
                {range && <div className="text-[10.5px] text-ctp-subtext0 mt-0.5 whitespace-nowrap">{range}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-ctp-subtext1">Meeting abgeschlossen</div>
                {w.note && <div className="text-[11.5px] text-ctp-subtext0 italic mt-0.5 truncate">{w.note}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
