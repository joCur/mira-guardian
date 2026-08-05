import React from "react";

/**
 * Der Weg zum Original. Wo unsere Darstellung nicht weiterhilft — fehlende
 * Vergleichsbasis, reines Verschieben, ein Bild —, ist der Diff in ADO die
 * verlässliche Auskunft darüber, was der Commit an dieser Datei geändert hat.
 *
 * Kein `<a href>`: im Widget würde das die Seite im Fenster ersetzen. Der Link
 * geht über die Bridge an den Standardbrowser, wie schon bei Links im Dokument.
 */
export function AdoLink({ href, label = "In ADO ansehen" }: { href?: string; label?: string }) {
  // Ein älterer Server schickt den Link noch nicht mit — dann steht hier
  // nichts, statt ein Knopf, der nichts tut.
  if (!href || !/^https?:\/\//.test(href)) return null;
  return (
    <button type="button" title={href}
      onClick={() => { Promise.resolve(window.guardian.openExternal(href)).catch(() => {}); }}
      className="text-xs font-semibold text-ctp-blue bg-ctp-blue/10 border border-ctp-blue/40 rounded px-1.5 py-0.5 shrink-0 hover:bg-ctp-blue/20 transition-colors whitespace-nowrap">
      {label} ↗
    </button>
  );
}
