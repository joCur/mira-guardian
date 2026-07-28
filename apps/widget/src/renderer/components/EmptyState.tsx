import React from "react";

// Leere Zustände im einheitlichen Stil: Icon im Teal-Kreis, Titel, Erklärtext.
// Icons: Lucide (https://lucide.dev, ISC) als Pfad-Sets im 24er-ViewBox.
export function EmptyState({ paths, title, children }:
  { paths: string[]; title: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center text-center max-w-[380px] px-6 pb-12">
        <div className="w-16 h-16 rounded-full bg-ctp-teal/10 border border-ctp-teal/20 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-ctp-teal" aria-hidden="true">
            {paths.map((d, i) => <path key={i} d={d} />)}
          </svg>
        </div>
        <div className="text-[15px] font-semibold text-ctp-text mt-4">{title}</div>
        <div className="text-[12.5px] text-ctp-subtext0 leading-relaxed mt-1.5">{children}</div>
      </div>
    </div>
  );
}

export const ICON_SHIELD_CHECK = [
  "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
  "m9 12 2 2 4-4",
];
export const ICON_HISTORY = [
  "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
  "M3 3v5h5",
  "M12 7v5l4 2",
];
export const ICON_CIRCLE_CHECK = [
  "M21.801 10A10 10 0 1 1 17 3.335",
  "m9 11 3 3L22 4",
];
