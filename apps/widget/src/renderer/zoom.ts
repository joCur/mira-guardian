// Zoom für den Lesebereich — Strg/Cmd mit Plus, Minus und Null.
//
// Bewusst *nicht* Electrons Fenster-Zoom (`webContents.setZoomLevel`): Der
// skaliert die gesamte Oberfläche mit, also auch Sidebar, Tab-Leiste und die
// Bewertungsknöpfe. Auf einem breiten Schirm ist das das Gegenteil des
// Gewünschten — man verliert Fläche an Bedienelemente, statt mehr Text lesen zu
// können. Hier skaliert deshalb nur der Dokumentbereich, über die CSS-Eigenschaft
// `zoom` auf dessen Container (anders als `transform: scale` bricht sie das
// Layout nicht, sondern löst einen echten Reflow aus).
//
// Die Stufen folgen der gewohnten 1,2er-Reihe aus Browsern und VS Code.
export const ZOOM_MIN = -2;
export const ZOOM_MAX = 6;

/** Skalierungsfaktor einer Stufe — Stufe 0 ist die unveränderte Größe. */
export function zoomFaktor(level: number): number {
  // Auf drei Stellen gerundet: Der Rohwert hat sonst eine lange Dezimalreihe,
  // die als CSS-Wert nur den DOM aufbläht.
  return Math.round(1.2 ** clampZoom(level) * 1000) / 1000;
}

export function clampZoom(level: number): number {
  // NaN aus einer verfälschten config.json darf nicht bis ins CSS kommen —
  // daraus würde ein unlesbar skalierter Textbereich.
  if (!Number.isFinite(level)) return 0;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(level)));
}

export type ZoomCommand = "in" | "out" | "reset";

/** Der Teil eines Tastatur-Events, den die Zuordnung braucht. */
export interface ZoomKey {
  ctrlKey: boolean;
  metaKey: boolean;
  key: string;
  code: string;
}

/**
 * Ordnet einen Tastendruck einem Zoombefehl zu — oder null, wenn die Taste
 * nichts mit Zoom zu tun hat und normal weiterlaufen soll.
 *
 * Abgedeckte Schreibweisen von "Plus" und "Minus": Auf deutschem Layout liegen
 * beide auf eigenen Tasten (`+` / `-`), auf US-Layout ist Plus Shift+`=` — dort
 * ist Strg+`=` die eingebürgerte Variante ohne Shift. Der Ziffernblock meldet
 * je nach Layout nicht immer ein sauberes `key`, darum zusätzlich über `code`.
 */
export function zoomCommandFor(e: ZoomKey): ZoomCommand | null {
  if (!e.ctrlKey && !e.metaKey) return null;
  if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") return "in";
  if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract") return "out";
  if (e.key === "0" || e.code === "Numpad0") return "reset";
  return null;
}

/** Wendet einen Zoombefehl auf die aktuelle Stufe an. */
export function applyZoom(level: number, cmd: ZoomCommand): number {
  if (cmd === "reset") return 0;
  return clampZoom(clampZoom(level) + (cmd === "in" ? 1 : -1));
}
