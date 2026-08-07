import React from "react";
import type { Lesezoom } from "../useLesezoom.js";

/**
 * Zeigt die Zoomstufe des Lesebereichs und setzt sie per Klick zurück.
 *
 * Nur sichtbar, solange gezoomt ist: Bei 100 % gäbe es nichts zu melden, und
 * eine dauerhafte Anzeige wäre in einer Titelleiste, die schon den
 * Update-Hinweis trägt, nur Rauschen. Sobald sie erscheint, beantwortet sie
 * beides — warum der Text anders aussieht und wie man das rückgängig macht,
 * ohne das Tastenkürzel zu kennen.
 */
export function ZoomBadge({ zoom }: { zoom: Lesezoom }) {
  if (zoom.stufe === 0) return null;
  return (
    <div onClick={zoom.zuruecksetzen} style={{ WebkitAppRegion: "no-drag" } as any}
      title="Textgröße zurücksetzen (Strg/Cmd + 0)"
      className="flex items-center gap-1.5 rounded-[7px] border border-ctp-surface1 bg-ctp-surface0/60 px-2 py-0.5 cursor-pointer hover:bg-ctp-surface1 transition-colors">
      <span className="text-2xs font-semibold text-ctp-subtext1">{zoom.prozent} %</span>
      <span className="text-2xs text-ctp-overlay0">✕</span>
    </div>
  );
}
