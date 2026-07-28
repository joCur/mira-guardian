import { ipcMain, shell } from "electron";
import { tokenStore } from "./tokenStore.js";

export function registerIpc() {
  ipcMain.handle("guardian:getConfig", () => tokenStore.get());
  // Beim Bauen eingebacken (siehe electron.vite.config.ts) — nicht
  // app.getVersion(), das ohne gefundene package.json die Electron-Version
  // zurückgibt und damit je nach Startart etwas anderes bedeutet.
  ipcMain.handle("guardian:getAppVersion", () => __APP_VERSION__);
  ipcMain.handle("guardian:setToken", (_e, token: string) => tokenStore.setToken(token));
  ipcMain.handle("guardian:clearToken", () => tokenStore.clearToken());
  ipcMain.handle("guardian:setServerUrl", (_e, url: string) => tokenStore.setServerUrl(url));
  ipcMain.handle("guardian:getLastSeenChange", () => tokenStore.getLastSeenChange());
  ipcMain.handle("guardian:bumpLastSeenChange", (_e, iso: string) => tokenStore.bumpLastSeenChange(iso));
  ipcMain.handle("guardian:openExternal", (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url);
  });
}
