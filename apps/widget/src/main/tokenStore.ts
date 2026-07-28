import Store from "electron-store";

interface Schema { token: string | null; serverUrl: string; lastSeenChangeAt: string | null }
const store = new Store<Schema>({ defaults: { token: null, serverUrl: "http://localhost:4000", lastSeenChangeAt: null } });

export const tokenStore = {
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
