/**
 * Zustand der Update-Prüfung. Lebt in einer eigenen Datei, weil Main-Prozess
 * (electron-updater), Preload-Brücke und Renderer denselben Typ brauchen.
 *
 * - `unsupported`: Entwicklungsmodus — eine ungepackte App kann sich nicht
 *   selbst ersetzen, die Oberfläche zeigt dazu nichts an.
 * - `current`: geprüft, es gibt nichts Neueres.
 * - `error` behält eine bereits bekannte `version`, damit die Oberfläche auch
 *   dann auf das Release verweisen kann, wenn der Download scheitert.
 */
export type UpdatePhase =
  | "unsupported"
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "current"
  | "error";

export interface UpdateStatus {
  phase: UpdatePhase;
  /** Version des gefundenen Updates, `null` solange keine bekannt ist. */
  version: string | null;
  /** Fortschritt in Prozent (0–100), nur während `downloading` aussagekräftig. */
  percent: number;
  /** Release-Seite der gefundenen Version für die Änderungshinweise. */
  notesUrl: string | null;
  /** Klartext des letzten Fehlers, sonst `null`. */
  message: string | null;
}
