import { useEffect, useState } from "react";
import type { UpdateStatus } from "../types/update.js";

const INITIAL: UpdateStatus = { phase: "idle", version: null, percent: 0, notesUrl: null, message: null };

/**
 * Update-Zustand aus dem Main-Prozess. Der Stand wird beim Aufbauen einmal
 * abgefragt, weil die Prüfung schon vor dem ersten Rendern gelaufen sein kann —
 * danach hält das Event ihn aktuell.
 */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>(INITIAL);
  useEffect(() => {
    void window.guardian.getUpdateStatus().then(setStatus).catch(() => {});
    return window.guardian.onUpdateStatus(setStatus);
  }, []);
  return status;
}
