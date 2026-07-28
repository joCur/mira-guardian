import React from "react";
import { STATUS_LABELS } from "@guardian/shared";
import type { HistoryEntry } from "../../api/client.js";
import { statusText, statusBorder } from "../../theme.js";
import { EmptyState, ICON_HISTORY } from "../EmptyState.js";

function when(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long" }) +
    ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function HistoryTab({ entries, onOpen }:
  { entries: HistoryEntry[]; onOpen: (id: string) => void }) {
  if (entries.length === 0) return (
    <EmptyState paths={ICON_HISTORY} title="Noch nichts bewertet">
      Sobald du eine Änderung akzeptierst, ablehnst oder zur Klärung stellst,
      erscheint sie hier — mit deinem Kommentar und dem Zeitpunkt.
    </EmptyState>
  );
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[820px] mx-auto">
        <div className="flex items-baseline gap-3.5 mb-4">
          <span className="text-[19px] font-bold text-ctp-text">Meine Bewertungen</span>
          <span className="text-[12.5px] text-ctp-subtext0">{entries.length} insgesamt</span>
        </div>
        {entries.map(e => (
          <div key={`${e.changeId}-${e.updatedAt}`}
            className={`bg-ctp-mantle border border-ctp-surface0 border-l-[3px] ${statusBorder(e.status)} rounded-[10px] px-[18px] py-3.5 mb-2.5`}>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className={`text-[11px] font-semibold ${statusText(e.status)}`}>{STATUS_LABELS[e.status]}</span>
              <span className="font-mono text-[12.5px] text-ctp-subtext1 break-all">{e.filePath}</span>
              <span className="flex-1" />
              <span className="text-[11px] text-ctp-subtext0 whitespace-nowrap">{when(e.updatedAt)}</span>
              <span onClick={() => onOpen(e.changeId)}
                className="text-[11.5px] text-ctp-blue cursor-pointer hover:underline whitespace-nowrap">Ansehen →</span>
            </div>
            <div className="text-[11.5px] text-ctp-subtext0 mt-1">{e.commitShort} · {e.summary}</div>
            {e.comment && <div className="text-[12.5px] text-ctp-subtext1 italic mt-1.5">„{e.comment}"</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
