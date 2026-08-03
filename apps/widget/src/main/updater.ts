import { app, BrowserWindow, ipcMain } from "electron";
import electronUpdater from "electron-updater";
import type { UpdateStatus } from "../types/update.js";

// electron-updater ist CommonJS: der Default-Export ist immer das Modulobjekt,
// ein named import darauf wird je nach Bündelung still zu undefined.
const { autoUpdater } = electronUpdater;

// Die App läuft als Tray-Anwendung wochenlang durch. Ohne wiederkehrende
// Prüfung erfährt sie von einem Release erst beim nächsten Neustart.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Der Start soll nicht auf das Netz warten: erst Fenster und Tray, dann prüfen.
const FIRST_CHECK_DELAY_MS = 8_000;

let status: UpdateStatus = { phase: "idle", version: null, percent: 0, notesUrl: null, message: null };

/** Release-Seite der Version — dort stehen die von der Pipeline erzeugten Notizen. */
function notesUrlFor(version: string): string {
  return `${__RELEASES_URL__}/tag/v${version}`;
}

function publish(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next };
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("guardian:updateStatus", status);
  }
}

/**
 * Neue Prüfung anstoßen. Läuft schon eine Prüfung oder liegt ein Update
 * bereit, ist nichts zu tun — sonst würde die Anzeige beim Intervall-Lauf
 * kurz auf "suche" zurückfallen und der Hinweis in der Titelleiste flackern.
 */
async function check(): Promise<void> {
  if (status.phase === "checking" || status.phase === "downloading" || status.phase === "ready") return;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    // checkForUpdates meldet denselben Fehler zusätzlich über das error-Event;
    // der catch verhindert nur eine unbehandelte Rejection.
    publish({ phase: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * @param prepareQuit Gibt das Fenster zum Schließen frei. Als Tray-App
 *   versteckt Guardian sein Fenster beim Schließen statt es zu zerstören
 *   (siehe index.ts). Auf macOS beendet Squirrel die App aber nicht über
 *   app.quit(), sondern über den Terminate-Pfad von AppKit — dabei feuert
 *   before-quit nicht, das Fenster verweigert das Schließen und das Update
 *   bleibt liegen. Geprüft: ohne diesen Aufruf lief die alte Version weiter.
 */
export function registerUpdaterIpc(prepareQuit: () => void): void {
  ipcMain.handle("guardian:getUpdateStatus", () => status);
  ipcMain.handle("guardian:checkForUpdate", () => { void check(); });
  ipcMain.handle("guardian:installUpdate", () => {
    if (status.phase !== "ready") return;
    prepareQuit();
    // setImmediate, damit der Renderer noch seine Antwort bekommt, bevor die
    // App abtritt. isSilent: der NSIS-Installer läuft ohne Rückfragen durch.
    // isForceRunAfter startet die App danach wieder — ohne das Flag bliebe sie
    // auf Windows nach dem Update aus.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });
}

export function initUpdater(): void {
  // Eine ungepackte App hat keinen Installer, den sie ersetzen könnte —
  // checkForUpdates würde nur mit "application is not packed" abbrechen.
  if (!app.isPackaged) {
    publish({ phase: "unsupported" });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.logger = {
    info: (m?: unknown) => console.log("[updater]", m),
    warn: (m?: unknown) => console.warn("[updater]", m),
    error: (m?: unknown) => console.error("[updater]", m),
    debug: () => { /* zu gesprächig für den Normalbetrieb */ },
  };

  autoUpdater.on("checking-for-update", () => publish({ phase: "checking", message: null }));
  autoUpdater.on("update-available", (info) => publish({
    phase: "downloading", version: info.version, percent: 0,
    notesUrl: notesUrlFor(info.version), message: null,
  }));
  autoUpdater.on("update-not-available", () => publish({
    phase: "current", version: null, percent: 0, notesUrl: null, message: null,
  }));
  autoUpdater.on("download-progress", (p) => publish({ phase: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => publish({
    phase: "ready", version: info.version, percent: 100, notesUrl: notesUrlFor(info.version), message: null,
  }));
  // version und notesUrl bleiben absichtlich stehen: scheitert der Download
  // (auf macOS etwa an der Signaturprüfung), verweist die Oberfläche weiter
  // auf das Release, aus dem man die neue Version von Hand holen kann.
  autoUpdater.on("error", (err) => publish({
    phase: "error", message: err instanceof Error ? err.message : String(err),
  }));

  setTimeout(() => { void check(); }, FIRST_CHECK_DELAY_MS);
  setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
}
