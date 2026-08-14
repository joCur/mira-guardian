import React from "react";

/**
 * Umschalter für Einträge, die mehrere Commits zusammenfassen.
 *
 * Die Vergleichsbasis bleibt für alle Hüter dieselbe — sonst sähen zwei Leute
 * verschiedene Diffs und redeten im Meeting über verschiedene Dinge. Wer aber
 * die vorigen Commits schon gelesen hat, muss sie nicht erneut durchgehen:
 * dafür lässt sich der jüngste für einen Moment allein anzeigen. Das ändert
 * nur die eigene Sicht, nicht die Grundlage der Bewertung.
 */
export function DiffUmfang({ commitCount, nurLetzter, onChange }:
  { commitCount: number; nurLetzter: boolean; onChange: (nurLetzter: boolean) => void }) {
  const knopf = (aktiv: boolean) =>
    "px-3 py-1.5 text-xs transition-colors " + (aktiv
      ? "bg-ctp-surface1 text-ctp-text font-semibold"
      : "text-ctp-subtext0 hover:text-ctp-text");
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-ctp-subtext0">
          Fasst {commitCount} Commits zusammen
        </span>
        <div role="group" aria-label="Umfang des Vergleichs"
          className="flex rounded-lg border border-ctp-surface1 overflow-hidden">
          <button type="button" aria-pressed={!nurLetzter} onClick={() => onChange(false)}
            className={knopf(!nurLetzter)}>Alles seit Basis</button>
          <button type="button" aria-pressed={nurLetzter} onClick={() => onChange(true)}
            className={knopf(nurLetzter)}>Nur letzter Commit</button>
        </div>
      </div>
      {nurLetzter && (
        <div className="text-xs text-ctp-subtext0 leading-snug mt-2">
          Nur zur Orientierung — bewertet wird die Änderung als Ganzes, und die
          übrigen Hüter sehen sie so.
        </div>
      )}
    </div>
  );
}
