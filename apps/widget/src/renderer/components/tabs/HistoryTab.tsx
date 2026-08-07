import React, { useState } from "react";
import { STATUS_LABELS } from "@guardian/shared";
import type { HistoryEntry } from "../../api/client.js";
import { statusText, statusBorder } from "../../theme.js";
import { EmptyState, ICON_HISTORY } from "../EmptyState.js";
import { FilterBar, LevelPill } from "../FilterBar.js";
import { NO_FILTER, applyFilter, filterOptions, isFiltering, type Filter } from "../../filter.js";
import { LESESPALTE } from "../../layout.js";

function when(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long" }) +
    ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function HistoryTab({ entries, onOpen }:
  { entries: HistoryEntry[]; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>(NO_FILTER);

  if (entries.length === 0) return (
    <EmptyState paths={ICON_HISTORY} title="Noch nichts bewertet">
      Sobald du eine Änderung akzeptierst, ablehnst oder zur Klärung stellst,
      erscheint sie hier — mit deinem Kommentar und dem Zeitpunkt.
    </EmptyState>
  );

  const optionen = filterOptions(entries, filter);
  const gezeigt = applyFilter(entries, filter);
  const gefiltert = isFiltering(filter);

  return (
    // Hier zoomt der ganze Inhalt, anders als im Änderungen-Tab: Diese Seite
    // ist eine Übersicht ohne Fließtext, und ein Zoom, der nur die Einträge
    // aufbläst, lässt Überschrift und Suchfeld winzig zurück.
    <div className="lesezoom flex-1 overflow-y-auto px-8 py-6">
      <div className={LESESPALTE}>
        <div className="flex items-baseline gap-3.5 mb-3">
          <span className="text-lg font-bold text-ctp-text">Meine Bewertungen</span>
          <span className="text-xs text-ctp-subtext0">
            {gefiltert ? `${gezeigt.length} von ${entries.length}` : `${entries.length} insgesamt`}
          </span>
        </div>
        <div className="mb-4">
          <FilterBar value={filter} onChange={setFilter} levels={optionen.levels} types={optionen.types} />
        </div>
        {gezeigt.length === 0 && (
          <div className="text-xs text-ctp-subtext0 py-6 text-center">Keine Bewertung passt zur Suche.</div>
        )}
        {gezeigt.map(e => (
          <div key={`${e.changeId}-${e.updatedAt}`}
            className={`bg-ctp-mantle border border-ctp-surface0 border-l-[3px] ${statusBorder(e.status)} rounded-[10px] px-[18px] py-3.5 mb-2.5`}>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className={`text-xs font-semibold ${statusText(e.status)}`}>{STATUS_LABELS[e.status]}</span>
              <LevelPill filePath={e.filePath} />
              <span className="font-mono text-xs text-ctp-subtext1 break-all">{e.filePath}</span>
              <span className="flex-1" />
              <span className="text-xs text-ctp-subtext0 whitespace-nowrap">{when(e.updatedAt)}</span>
              <span onClick={() => onOpen(e.changeId)}
                className="text-xs text-ctp-blue cursor-pointer hover:underline whitespace-nowrap">Ansehen →</span>
            </div>
            <div className="text-xs text-ctp-subtext0 mt-1">{e.commitShort} · {e.summary}</div>
            {e.comment && <div className="text-xs text-ctp-subtext1 italic mt-1.5">„{e.comment}"</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
