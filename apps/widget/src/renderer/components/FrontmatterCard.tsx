import React from "react";
import type { FmField } from "../diff/frontmatter.js";

const STATUS_COLORS: Record<string, string> = {
  active: "text-ctp-green bg-ctp-green/15 border-ctp-green/40",
  resolved: "text-ctp-green bg-ctp-green/15 border-ctp-green/40",
  declined: "text-ctp-red bg-ctp-red/15 border-ctp-red/40",
  deprecated: "text-ctp-red bg-ctp-red/15 border-ctp-red/40",
};
const NEUTRAL = "text-ctp-subtext1 bg-ctp-surface0 border-ctp-surface1";
const CATEGORY = "text-ctp-blue bg-ctp-blue/15 border-ctp-blue/40";

function badgeColor(key: string, value: string): string {
  if (key === "category") return CATEGORY;
  const v = value.toLowerCase();
  if (STATUS_COLORS[v]) return STATUS_COLORS[v];
  if (v.startsWith("superseded")) return "text-ctp-yellow bg-ctp-yellow/15 border-ctp-yellow/40";
  return NEUTRAL;
}

// Die Record-Schemata sind pro Typ konstant (Decisions/Learnings/Rules) —
// bekannte Felder erscheinen in fester, sinnvoller Reihenfolge, unbekannte
// dahinter in YAML-Reihenfolge.
const FIELD_ORDER = ["date", "last-modified", "deciders", "observed-in", "paths", "name"];
function fieldRank(key: string): number {
  const i = FIELD_ORDER.indexOf(key);
  return i === -1 ? FIELD_ORDER.length : i;
}

// ISO-Daten (2026-07-23) deutsch formatieren, wie im Rest der App.
function fmtValue(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

// Leere YAML-Werte (`deciders:`) als gedimmter Strich statt Leerstelle.
function joined(values: string[]): React.ReactNode {
  const s = values.map(fmtValue).join(", ");
  return s.trim() ? s : <span className="text-ctp-overlay0">–</span>;
}

function Value({ field }: { field: FmField }) {
  return (
    <>
      {field.changed && field.oldValues && (
        <del className="text-ctp-red mr-1.5">{joined(field.oldValues)}</del>
      )}
      {field.newValues && (
        field.changed
          ? <ins className="text-ctp-green no-underline">{joined(field.newValues)}</ins>
          : <span>{joined(field.newValues)}</span>
      )}
      {!field.newValues && <span className="italic text-ctp-overlay0">entfernt</span>}
    </>
  );
}

export function FrontmatterCard({ fields }: { fields: FmField[] }) {
  if (fields.length === 0) return null;
  const badges = fields.filter(x => (x.key === "status" || x.key === "category") && !x.changed && x.newValues?.length === 1);
  const description = fields.find(x => x.key === "description" && !x.changed);
  const rest = fields
    .filter(x => !badges.includes(x) && x !== description)
    .map((x, i) => ({ x, i }))
    .sort((a, b) => fieldRank(a.x.key) - fieldRank(b.x.key) || a.i - b.i)
    .map(({ x }) => x);
  const hasHeader = badges.length > 0 || !!description?.newValues;
  return (
    <div className="bg-ctp-mantle border border-ctp-surface0 rounded-lg px-4 py-3 mb-4">
      {badges.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {badges.map(b => (
            <span key={b.key} className={`text-xs font-semibold tracking-wide border rounded-full px-2 py-[2px] ${badgeColor(b.key, b.newValues![0])}`}>
              {b.newValues![0]}
            </span>
          ))}
        </div>
      )}
      {description?.newValues && <div className="text-base text-ctp-text leading-snug mt-2">{description.newValues.join(", ")}</div>}
      {rest.length > 0 && (
        <div className={`grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1.5 ${hasHeader ? "mt-2.5 pt-2.5 border-t border-ctp-surface0" : ""}`}>
          {rest.map(field => (
            <React.Fragment key={field.key}>
              {/* Feld-Namen im Label-Duktus der App (vgl. DIESE WOCHE / KOMMENTARE) */}
              <span className="text-xs tracking-[0.08em] font-semibold uppercase text-ctp-subtext0 leading-[1.9] truncate">{field.key}</span>
              {field.newValues && field.newValues.length > 1 && !field.changed
                ? <span className="min-w-0 text-sm leading-relaxed">{field.newValues.map((v, i) => <span key={i} className="font-mono text-ctp-subtext1 block truncate">{v}</span>)}</span>
                : <span className="text-sm text-ctp-subtext1 leading-relaxed min-w-0"><Value field={field} /></span>}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
