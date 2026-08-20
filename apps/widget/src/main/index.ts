import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell } from "electron";
import { join } from "node:path";
import { registerIpc } from "./ipc.js";
import { initUpdater, registerUpdaterIpc } from "./updater.js";
import { tokenStore } from "./tokenStore.js";
import { TRAY_ICON_16_TEMPLATE, TRAY_ICON_32_TEMPLATE, TRAY_ICON_32_LIGHT } from "./trayIcon.js";
import { WINDOW_ICON_256 } from "./windowIcon.js";

let win: BrowserWindow | null = null;
let toastWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

// Eigenes kleines Always-on-top-Fenster für die Custom-Benachrichtigungen.
// Ein eigenes Fenster, weil das Hauptfenster als Tray-App meist versteckt ist.
// Die Höhe folgt dem Karten-Stapel (guardian:toastResize aus dem Renderer).
const TOAST_W = 376;
let toastHeight = 168;

function positionToast(t: BrowserWindow, height = toastHeight) {
  const wa = screen.getPrimaryDisplay().workArea;
  toastHeight = Math.min(Math.max(height, 1), wa.height - 24);
  const x = wa.x + wa.width - TOAST_W - 12;
  // Nativ wirken: macOS zeigt Benachrichtigungen oben rechts, Windows unten
  // rechts — der Stapel wächst von der jeweiligen Ecke weg.
  const y = process.platform === "darwin" ? wa.y + 12 : wa.y + wa.height - toastHeight - 12;
  t.setBounds({ x, y, width: TOAST_W, height: toastHeight });
}

// Änderungen-Karten enthalten jetzt echte <a href>-Anker mit ADO-Links. Klicks
// werden im Renderer per preventDefault abgefangen, aber Mittelklick/Cmd-Klick
// löst Chromiums Open-in-new-window-Pfad aus — ohne Guard bekäme das Kindfenster
// das Guardian-Preload (Token via getConfig) mit. will-navigate blockt zusätzlich
// Fremdnavigation im selben Fenster, erlaubt aber Same-URL-Reloads (Dev-Server-HMR).
function guardWindowNavigation(w: BrowserWindow) {
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  w.webContents.on("will-navigate", (e, url) => {
    if (url !== w.webContents.getURL()) e.preventDefault();
  });
}

function ensureToastWindow(): BrowserWindow {
  if (toastWin && !toastWin.isDestroyed()) return toastWin;
  toastWin = new BrowserWindow({
    width: TOAST_W, height: toastHeight, show: false, frame: false, transparent: true,
    resizable: false, movable: false, skipTaskbar: true, focusable: false,
    hasShadow: false, alwaysOnTop: true,
    webPreferences: { preload: join(import.meta.dirname, "../preload/index.mjs"), contextIsolation: true, sandbox: false },
  });
  guardWindowNavigation(toastWin);
  toastWin.setAlwaysOnTop(true, "floating");
  toastWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (process.env.ELECTRON_RENDERER_URL) toastWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}#toast`);
  else toastWin.loadFile(join(import.meta.dirname, "../renderer/index.html"), { hash: "toast" });
  return toastWin;
}

function createWindow() {
  win = new BrowserWindow({
    // 1080×720 is the layout the design doc targets; the minimum keeps the
    // Änderungen-Tab (264px sidebar + diff + vote buttons) from overflowing.
    width: 1080, height: 720, minWidth: 920, minHeight: 600,
    show: false, resizable: true,
    // macOS keeps its native traffic lights (renderer leaves an 80px inset and
    // drops the custom ✕); other platforms stay frameless with the custom ✕.
    ...(process.platform === "darwin"
      // Nominell wäre y:16 mittig (Leiste 43.75px, Ampel 12px) — macOS rendert
      // die Ampel aber 1.5px tiefer als angefragt (per Screenshot vermessen),
      // daher y:14 für eine optisch zentrierte Mitte bei ~21.5px.
      ? { titleBarStyle: "hidden" as const, trafficLightPosition: { x: 18, y: 14 } }
      : { frame: false as const }),
    // Nur Linux braucht das Icon explizit — siehe windowIcon.ts.
    ...(process.platform === "linux" ? { icon: nativeImage.createFromDataURL(WINDOW_ICON_256) } : {}),
    webPreferences: { preload: join(import.meta.dirname, "../preload/index.mjs"), contextIsolation: true, sandbox: false },
  });
  guardWindowNavigation(win);
  // Chromium merkt sich den Fenster-Zoom pro Origin in der Session. Gezoomt
  // wird hier aber nur der Lesebereich (siehe renderer/useLesezoom.ts) — ein
  // aus einer früheren Fassung übrig gebliebener Fensterzoom würde die
  // Oberfläche sonst dauerhaft mitskalieren, ohne dass sie ihn zurücksetzen
  // könnte.
  win.webContents.on("did-finish-load", () => { win?.webContents.setZoomLevel(0); });
  // Native close must behave like the custom ✕ (hide to tray), not destroy the
  // window — otherwise the tray's "Öffnen" points at a dead BrowserWindow.
  // app.quit() (tray "Beenden" or Cmd+Q) sets `quitting` and really exits.
  win.on("close", (e) => { if (!quitting) { e.preventDefault(); win?.hide(); } });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  win.center();
  // Tray-App: das macOS-Dock-Icon nur zeigen, solange das Hauptfenster offen
  // ist (Windows nimmt versteckte Fenster von selbst aus der Taskleiste).
  if (process.platform === "darwin") {
    win.on("show", () => { void app.dock?.show(); });
    win.on("hide", () => { app.dock?.hide(); });
  }
}

// Öffnet das Hauptfenster auf dem Display des Auslösers (Tray-Icon-Bounds,
// sonst Cursor) und auf dem gerade AKTIVEN Space — ohne die Klammer aus
// setVisibleOnAllWorkspaces würde macOS stattdessen zum alten Space des
// Fensters springen. skipTransformProcessType verhindert Dock-Flackern.
// Die vom User gewählte Fensterposition bleibt erhalten, solange das Fenster
// bereits auf dem Ziel-Display steht; nur bei Display-Wechsel wird zentriert.
function showOnActiveDisplay(trigger?: Electron.Rectangle) {
  if (!win) return;
  const display = trigger
    ? screen.getDisplayMatching(trigger)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (screen.getDisplayMatching(win.getBounds()).id !== display.id) {
    const [w, h] = win.getSize();
    const wa = display.workArea;
    win.setBounds({
      x: Math.round(wa.x + (wa.width - w) / 2),
      y: Math.round(wa.y + (wa.height - h) / 2),
      width: w, height: h,
    });
  }
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.show(); win.focus();
    win.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true });
  } else {
    win.show(); win.focus();
  }
}

function toggle(trigger?: Electron.Rectangle) {
  if (!win) return;
  if (win.isVisible()) { win.hide(); return; }
  showOnActiveDisplay(trigger);
}

// Window-scoped IPC (needs `win`/`toastWin`), registered once the window exists.
function registerWindowIpc() {
  ipcMain.handle("guardian:showToast", (_e, data: unknown) => {
    const t = ensureToastWindow();
    const present = () => { positionToast(t); t.webContents.send("guardian:toastData", data); t.showInactive(); };
    if (t.webContents.isLoading()) t.webContents.once("did-finish-load", present);
    else present();
  });
  ipcMain.handle("guardian:toastResize", (_e, height: number) => {
    if (toastWin && !toastWin.isDestroyed()) positionToast(toastWin, height);
  });
  ipcMain.handle("guardian:toastAction", (_e, action: string, changeId: string | null) => {
    // "view" lässt das Toast-Fenster stehen — der Renderer entfernt nur die eine
    // Karte und meldet "dismiss", sobald der Stapel leer ist.
    if (action === "view" && changeId) {
      showOnActiveDisplay();
      win?.webContents.send("guardian:openChange", changeId);
    }
    if (action === "dismiss") toastWin?.hide();
  });
  ipcMain.handle("guardian:hideWindow", () => { win?.hide(); });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => toggle());
  app.on("before-quit", () => { quitting = true; });
  app.whenReady().then(() => {
    if (process.platform === "darwin") app.dock?.hide();
    registerIpc();
    registerUpdaterIpc(() => { quitting = true; });
    createWindow();
    registerWindowIpc();
    // Nach dem Fenster: der Status wird an alle offenen Fenster gesendet, und
    // der Renderer holt sich den Stand beim Aufbauen zusätzlich selbst ab.
    initUpdater();
    let icon;
    if (process.platform === "darwin") {
      // 16pt-Basis + 2x-Retina-Repräsentation; als Template-Image färbt macOS
      // das Schild passend zur Menüleiste (hell/dunkel/aktiv) selbst ein.
      icon = nativeImage.createEmpty();
      icon.addRepresentation({ scaleFactor: 1, dataURL: TRAY_ICON_16_TEMPLATE });
      icon.addRepresentation({ scaleFactor: 2, dataURL: TRAY_ICON_32_TEMPLATE });
      icon.setTemplateImage(true);
    } else {
      icon = nativeImage.createFromDataURL(TRAY_ICON_32_LIGHT);
    }
    tray = new Tray(icon);
    tray.setToolTip("Memory-Bank Hüter");
    tray.on("click", (_e, bounds) => toggle(bounds));
    // Right-click menu — the app stays alive in the tray (window-all-closed does
    // not quit), so "Beenden" is the only way to actually quit it.
    const trayMenu = Menu.buildFromTemplate([
      { label: "Öffnen", click: () => showOnActiveDisplay() },
      { type: "separator" },
      { label: "Beenden", click: () => app.quit() },
    ]);
    tray.on("right-click", () => tray?.popUpContextMenu(trayMenu));

    // First run (no token yet) needs the setup dialog visible; once linked, the
    // window stays hidden at startup and the tray click brings it up (ambient).
    if (tokenStore.get().token === null) showOnActiveDisplay();
  });
  app.on("window-all-closed", () => { /* keep running in tray */ });
}
