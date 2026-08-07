// Zoom wie in VS Code und im Browser: Strg/Cmd mit Plus, Minus und Null.
//
// Chromium rechnet den Zoomfaktor als 1.2^Stufe, Stufe 0 ist 100 %. Weil der
// Zoom am ganzen Renderer hängt, skalieren auch die px-Maße im Layout mit —
// die Lesespalte behält also ihre Zeichenzahl pro Zeile, sie wird nur größer.
//
// Die Grenzen sind enger gesetzt als Chromiums eigene: Unter -3 (58 %) ist die
// 12-px-Grundschrift nicht mehr zu entziffern, über +5 (249 %) bleibt neben der
// 320-px-Sidebar nicht genug für den Diff, und das Fenster kann wegen minWidth
// nicht ausweichen.
export const ZOOM_MIN = -3;
export const ZOOM_MAX = 5;

export function clampZoom(level: number): number {
  // NaN aus einer verfälschten config.json darf nicht bis setZoomLevel kommen —
  // Chromium macht daraus einen unsichtbar kleinen Renderer.
  if (!Number.isFinite(level)) return 0;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));
}

export type ZoomCommand = "in" | "out" | "reset";

/** Der Teil von Electrons `input`-Event, den die Zuordnung braucht. */
export interface ZoomKey {
  type: string;
  control: boolean;
  meta: boolean;
  key: string;
  code: string;
}

/**
 * Ordnet einen Tastendruck einem Zoombefehl zu — oder null, wenn die Taste
 * nichts mit Zoom zu tun hat und normal im Renderer landen soll.
 *
 * Bewusst `control || meta` statt einer Plattform-Abfrage: Auf Windows ist
 * Win+Plus die Bildschirmlupe, die fängt das OS ab, bevor Electron sie sieht.
 * So bleibt die Zuordnung plattformfrei und damit testbar.
 *
 * Abgedeckte Schreibweisen von "Plus" und "Minus": Auf deutschem Layout liegen
 * beide auf eigenen Tasten (`+` / `-`), auf US-Layout ist Plus Shift+`=` — dort
 * ist Strg+`=` die eingebürgerte Variante ohne Shift. Der Ziffernblock meldet
 * je nach Layout nicht immer ein sauberes `key`, darum zusätzlich über `code`.
 */
export function zoomCommandFor(input: ZoomKey): ZoomCommand | null {
  if (input.type !== "keyDown") return null;
  if (!input.control && !input.meta) return null;
  if (input.key === "+" || input.key === "=" || input.code === "NumpadAdd") return "in";
  if (input.key === "-" || input.key === "_" || input.code === "NumpadSubtract") return "out";
  if (input.key === "0" || input.code === "Numpad0") return "reset";
  return null;
}

/** Wendet einen Zoombefehl auf die aktuelle Stufe an. */
export function applyZoom(level: number, cmd: ZoomCommand): number {
  if (cmd === "reset") return 0;
  return clampZoom(clampZoom(level) + (cmd === "in" ? 1 : -1));
}
