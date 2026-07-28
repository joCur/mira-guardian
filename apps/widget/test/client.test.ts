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
  it("sends the bearer token for getMe", async () => {
    let seen = "";
    const c = new ApiClient("http://s", "tok", fake(200, { guardian: { id: "g1" } },
      (_u, init) => { seen = init?.headers?.Authorization ?? ""; }));
    const r = await c.getMe();
    expect(seen).toBe("Bearer tok");
    expect(r.guardian.id).toBe("g1");
  });
});
