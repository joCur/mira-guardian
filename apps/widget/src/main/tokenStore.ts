import { app } from "electron";
import Store from "electron-store";
import { configDir, migrateLegacyConfig } from "./configPath.js";

interface Schema { token: string | null; serverUrl: string; lastSeenChangeAt: string | null }

// Fester Ablageort statt electron-stores Standard (userData = Anzeigename der
// App) — Begründung in configPath.ts. Vor dem Öffnen einmal aus einem
// Altordner übernehmen, damit die Anmeldung eine Umbenennung überlebt.
const appDataDir = app.getPath("appData");
const migratedFrom = migrateLegacyConfig(appDataDir, app.isPackaged);
if (migratedFrom) console.log(`[guardian] Anmeldung aus ${migratedFrom} übernommen`);

const store = new Store<Schema>({
  cwd: configDir(appDataDir, app.isPackaged),
  defaults: { token: null, serverUrl: "http://localhost:4000", lastSeenChangeAt: null },
});

export const tokenStore = {
  // Pfad der config.json — fürs Log und für die Frage "wo liegt meine Anmeldung?".
  path: store.path,
  get(): Pick<Schema, "token" | "serverUrl"> { return { token: store.get("token"), serverUrl: store.get("serverUrl") }; },
  setToken(token: string) { store.set("token", token); },
  clearToken() { store.set("token", null); },
  setServerUrl(url: string) { store.set("serverUrl", url); },
  // Wasserlinie für Catch-up-Benachrichtigungen: firstSeenAt der neuesten
  // Änderung, die dieses Gerät gesehen hat. Bewegt sich nur vorwärts.
  getLastSeenChange(): string | null { return store.get("lastSeenChangeAt"); },
  bumpLastSeenChange(iso: string) {
    const cur = store.get("lastSeenChangeAt");
    if (!cur || iso > cur) store.set("lastSeenChangeAt", iso);
  },
};
