import React from "react";
import { memoryLevel } from "@guardian/shared";
import { type Filter, type FilterOption, NO_FILTER, isFiltering } from "../filter.js";

// Jeder Wert im Auswahlfeld trägt ein Präfix: die Repo-Wurzel hat die leere
// Ebenen-Id, und ein Auswahlfeld ohne passenden Eintrag liefert ebenfalls "" —
// ohne Präfix wäre „Repo" von „alle" nicht zu unterscheiden.
const ALLE = "alle";

const FELD = "bg-ctp-crust border border-ctp-surface1 focus:border-ctp-overlay0 rounded-lg " +
  "text-ctp-text outline-none transition-colors";

function Auswahl({ label, prefix, value, options, onChange, alleLabel }: {
  label: string; prefix: string; value: string | null; options: FilterOption[];
  onChange: (v: string | null) => void; alleLabel: string;
}) {
  // Ein einziger Wert ist keine Auswahl — dann steht das Feld nur im Weg.
  if (options.length < 2) return null;
  const gewaehlt = options.find(o => o.value === value);
  return (
    <select aria-label={label} title={gewaehlt?.label ?? alleLabel}
      value={value === null ? ALLE : `${prefix}:${value}`}
      onChange={e => {
        const v = e.target.value;
        onChange(v.startsWith(`${prefix}:`) ? v.slice(prefix.length + 1) : null);
      }}
      className={`${FELD} text-xs px-1.5 py-1 cursor-pointer min-w-0 flex-1`}>
      <option value={ALLE}>{alleLabel}</option>
      {/* Was gerade nichts trifft, bleibt sichtbar, aber unwählbar — außer es
          ist die eigene Auswahl, sonst käme man aus ihr nicht mehr heraus. */}
      {options.map(o => (
        <option key={o.value} value={`${prefix}:${o.value}`} disabled={o.count === 0 && o.value !== value}>
          {o.label} ({o.count})
        </option>
      ))}
    </select>
  );
}

function Zuruecksetzen({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="text-xs text-ctp-subtext0 hover:text-ctp-text px-1.5 py-1 whitespace-nowrap transition-colors">
      Zurücksetzen
    </button>
  );
}

export function FilterBar({ value, onChange, levels, types, stacked, placeholder = "Suchen…" }: {
  value: Filter; onChange: (f: Filter) => void;
  levels: FilterOption[]; types: FilterOption[];
  /** Schmale Spalte: Suchfeld über den Auswahlfeldern statt daneben. */
  stacked?: boolean;
  /** Sagt, wie weit die Suche reicht — die Tabs können unterschiedlich viel. */
  placeholder?: string;
}) {
  const aktiv = isFiltering(value);
  const felder = (
    <>
      <Auswahl label="Ebene" prefix="lvl" alleLabel="Alle Ebenen" value={value.level} options={levels}
        onChange={v => onChange({ ...value, level: v })} />
      <Auswahl label="Typ" prefix="typ" alleLabel="Alle Typen" value={value.type} options={types}
        onChange={v => onChange({ ...value, type: v })} />
    </>
  );
  return (
    <div className={stacked ? "flex flex-col gap-1.5" : "flex items-center gap-2"}>
      <input type="search" aria-label="Suchen" placeholder={placeholder} value={value.text}
        onChange={e => onChange({ ...value, text: e.target.value })}
        className={`${FELD} text-xs placeholder:text-ctp-overlay0 px-2.5 py-1.5 ${stacked ? "w-full" : "flex-1"}`} />
      {/* In der schmalen Spalte bekommen die Auswahlfelder die volle Breite —
          das Zurücksetzen rutscht darunter, statt sie zusammenzuquetschen. */}
      <div className="flex gap-2 items-center">
        {felder}
        {!stacked && aktiv && <Zuruecksetzen onClick={() => onChange(NO_FILTER)} />}
      </div>
      {stacked && aktiv && (
        <div className="flex justify-end -mt-0.5"><Zuruecksetzen onClick={() => onChange(NO_FILTER)} /></div>
      )}
    </div>
  );
}

/**
 * Die Ebene eines Records — bewusst ohne Farbe, damit die farbige Typ-Plakette
 * daneben weiter führt.
 */
export function LevelPill({ filePath, className = "" }: { filePath: string; className?: string }) {
  const lv = memoryLevel(filePath);
  return (
    <span title={lv.id ? `Ebene: ${lv.id}` : "Ebene: Repo-Wurzel"}
      className={`text-2xs px-1 py-px font-semibold tracking-wide rounded shrink-0 max-w-[120px] truncate
        text-ctp-overlay1 bg-ctp-surface0 border border-ctp-surface1 ${className}`}>
      {lv.label}
    </span>
  );
}
