import { describe, it, expect } from "vitest";
import { ApiClient, ApiError } from "../src/renderer/api/client.js";

function fake(status: number, body: unknown, capture?: (u: string, init?: any) => void): typeof fetch {
  return (async (u: string, init?: any) => { capture?.(u, init); return {
    ok: status >= 200 && status < 300, status, json: async () => body,
  } as Response; }) as unknown as typeof fetch;
}

describe("ApiClient", () => {
  it("sends the bearer token and returns changes", async () => {
    let seen = "";
    const c = new ApiClient("http://s", "tok", fake(200, { cycle: null, active: [], accepted: [], badge: 0 },
      (_u, init) => { seen = init?.headers?.Authorization ?? ""; }));
    const r = await c.getChanges();
    expect(seen).toBe("Bearer tok");
    expect(r.badge).toBe(0);
  });
  // /health braucht keinen Zugang und ist die Quelle für die Server-Version.
  it("reads the server version from health", async () => {
    let url = "";
    const c = new ApiClient("http://s", "tok", fake(200, { ok: true, version: "0.1.9" }, (u) => { url = u; }));
    expect(await c.getServerVersion()).toBe("0.1.9");
    expect(url).toBe("http://s/health");
  });

  // Ein älterer Server kennt das Feld noch nicht — das darf nichts auslösen.
  it("returns null when health carries no version", async () => {
    const c = new ApiClient("http://s", "tok", fake(200, { ok: true }));
    expect(await c.getServerVersion()).toBeNull();
  });

  it("throws ApiError on 400", async () => {
    const c = new ApiClient("http://s", "tok", fake(400, { error: "Kommentar erforderlich" }));
    await expect(c.vote("c1", "abgelehnt", "no")).rejects.toBeInstanceOf(ApiError);
  });
  it("posts init without a token", async () => {
    let seenBody: any;
    const c = new ApiClient("http://s", null, fake(200, { deviceToken: "t", guardian: { id: "g" } },
      (_u, init) => { seenBody = JSON.parse(init.body); }));
    const r = await c.init("MB-INIT-7743", "Anna", "a@x.de");
    expect(seenBody.setupCode).toBe("MB-INIT-7743");
    expect(r.deviceToken).toBe("t");
  });
  // Der Gerätename landet in der Geräteliste des Hüters — ohne ihn steht dort
  // ein Platzhalter, und niemand weiß, welchen Rechner er da entzieht.
  it("schickt den Gerätenamen beim Verknüpfen mit", async () => {
    let seenBody: any;
    const c = new ApiClient("http://s", null, fake(200, { deviceToken: "t", guardian: { id: "g" } },
      (_u, init) => { seenBody = JSON.parse(init.body); }));
    await c.redeem("MB-HWFT-NMR7", "MacBook-Pro (macOS)");
    expect(seenBody).toEqual({ code: "MB-HWFT-NMR7", deviceLabel: "MacBook-Pro (macOS)" });
  });

  // Kennt die App den Namen nicht, gehört kein leeres Feld in die Anfrage.
  it("lässt einen unbekannten Gerätenamen weg", async () => {
    let seenBody: any;
    const c = new ApiClient("http://s", null, fake(200, { deviceToken: "t", guardian: { id: "g" } },
      (_u, init) => { seenBody = JSON.parse(init.body); }));
    await c.redeem("MB-HWFT-NMR7", "");
    expect(seenBody).toEqual({ code: "MB-HWFT-NMR7" });
  });

  it("stellt einen Code für ein bestehendes Profil aus", async () => {
    let url = "", init: any;
    const c = new ApiClient("http://s", "tok", fake(200, { code: "MB-AAAA-AAAA", expiresAt: "x", guardianName: "Anna" },
      (u, i) => { url = u; init = i; }));
    const r = await c.relink("g1");
    expect(url).toBe("http://s/guardians/g1/relink");
    expect(r.code).toBe("MB-AAAA-AAAA");
    // Ohne Nutzlast kein JSON-Content-Type: der Server antwortet darauf mit 400.
    expect(init.body).toBeUndefined();
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("entzieht einem Gerät den Zugang", async () => {
    let url = "", method = "";
    const c = new ApiClient("http://s", "tok", fake(200, { ok: true }, (u, init) => { url = u; method = init.method; }));
    await c.revokeDevice("d2");
    expect([method, url]).toEqual(["POST", "http://s/me/devices/d2/revoke"]);
  });

  it("sends the bearer token for getMe", async () => {
    let seen = "";
    const c = new ApiClient("http://s", "tok", fake(200, { guardian: { id: "g1" } },
      (_u, init) => { seen = init?.headers?.Authorization ?? ""; }));
    const r = await c.getMe();
    expect(seen).toBe("Bearer tok");
    expect(r.guardian.id).toBe("g1");
  });
});
