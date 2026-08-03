import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import { AuthService } from "../src/domain/authService.js";
import { RealtimeHub } from "../src/realtime/hub.js";
import { buildApp } from "../src/api/httpApi.js";
import { createLimiter } from "../src/api/rateLimit.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({
  ADO_BASE_URL: "https://ado.x", ADO_COLLECTION: "C", ADO_PROJECT: "P", ADO_REPO: "R", ADO_PAT: "s",
} as any);

let ms = Date.parse("2026-08-03T10:00:00.000Z");
const nowMs = () => ms;
const now = () => new Date(ms).toISOString();

function setup(limit = 100) {
  ms = Date.parse("2026-08-03T10:00:00.000Z");
  const store = new Store(":memory:");
  store.ensureSetupCode("MB-INIT-7743");
  const changeService = new ChangeService(store);
  const authService = new AuthService(store, changeService, now, nowMs);
  const hub = new RealtimeHub();
  const limiter = createLimiter({ limit, windowMs: 1000, now: nowMs });
  const app = buildApp({ store, changeService, authService, hub, config, now, limiter });
  return { store, authService, app };
}

describe("Geräte über die API", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(); });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  async function founder(deviceLabel = "MacBook") {
    const res = await ctx.app.inject({ method: "POST", url: "/auth/init",
      payload: { setupCode: "MB-INIT-7743", name: "Anna Roth", email: "anna@x.de", deviceLabel } });
    return JSON.parse(res.body) as { deviceToken: string; guardian: { id: string; name: string } };
  }

  it("stellt einen Code aus, der das Profil behält statt ein neues anzulegen", async () => {
    const anna = await founder();
    const relink = await ctx.app.inject({ method: "POST", url: `/guardians/${anna.guardian.id}/relink`,
      headers: auth(anna.deviceToken) });
    const { code, guardianName } = JSON.parse(relink.body);
    expect(relink.statusCode).toBe(200);
    expect(guardianName).toBe("Anna Roth");

    const redeem = await ctx.app.inject({ method: "POST", url: "/auth/redeem",
      payload: { code, deviceLabel: "Neuer Rechner" } });
    const zweites = JSON.parse(redeem.body);
    expect(zweites.guardian.id).toBe(anna.guardian.id);

    const guardians = await ctx.app.inject({ method: "GET", url: "/guardians", headers: auth(zweites.deviceToken) });
    expect(JSON.parse(guardians.body).guardians).toHaveLength(1);
  });

  // So schickt der Renderer diese Aufrufe: JSON-Content-Type aus dem
  // gemeinsamen Anfrage-Kopf, aber ohne Nutzlast. Fastify lehnt einen leeren
  // Body dann mit 400 ab — in der App kam "Bad Request" statt eines Codes an.
  it("nimmt einen POST ohne Nutzlast an, auch mit JSON-Content-Type", async () => {
    const anna = await founder();
    const relink = await ctx.app.inject({ method: "POST", url: `/guardians/${anna.guardian.id}/relink`,
      headers: { ...auth(anna.deviceToken), "content-type": "application/json" } });
    expect(relink.statusCode).toBe(200);

    const list = await ctx.app.inject({ method: "GET", url: "/me/devices", headers: auth(anna.deviceToken) });
    const id = JSON.parse(list.body).devices[0].id;
    const revoke = await ctx.app.inject({ method: "POST", url: `/me/devices/${id}/revoke`,
      headers: { ...auth(anna.deviceToken), "content-type": "application/json" } });
    expect(revoke.statusCode).toBe(200);
  });

  it("verlangt für den Code einen Zugang", async () => {
    const anna = await founder();
    const res = await ctx.app.inject({ method: "POST", url: `/guardians/${anna.guardian.id}/relink` });
    expect(res.statusCode).toBe(401);
  });

  it("listet die eigenen Geräte mit dem aktuellen markiert", async () => {
    const anna = await founder("MacBook von Anna");
    const relink = await ctx.app.inject({ method: "POST", url: `/guardians/${anna.guardian.id}/relink`,
      headers: auth(anna.deviceToken) });
    await ctx.app.inject({ method: "POST", url: "/auth/redeem",
      payload: { code: JSON.parse(relink.body).code, deviceLabel: "Zweitrechner" } });

    const res = await ctx.app.inject({ method: "GET", url: "/me/devices", headers: auth(anna.deviceToken) });
    const devices = JSON.parse(res.body).devices as { label: string; current: boolean }[];
    expect(devices.map(d => d.label)).toEqual(["MacBook von Anna", "Zweitrechner"]);
    expect(devices.filter(d => d.current).map(d => d.label)).toEqual(["MacBook von Anna"]);
  });

  it("der Token eines Geräts steht nie in der Antwort", async () => {
    const anna = await founder();
    const res = await ctx.app.inject({ method: "GET", url: "/me/devices", headers: auth(anna.deviceToken) });
    expect(res.body).not.toContain(anna.deviceToken);
  });

  it("entzogenes Gerät ist sofort ausgesperrt", async () => {
    const anna = await founder();
    const relink = await ctx.app.inject({ method: "POST", url: `/guardians/${anna.guardian.id}/relink`,
      headers: auth(anna.deviceToken) });
    const zweites = JSON.parse((await ctx.app.inject({ method: "POST", url: "/auth/redeem",
      payload: { code: JSON.parse(relink.body).code, deviceLabel: "Zweitrechner" } })).body);

    const list = await ctx.app.inject({ method: "GET", url: "/me/devices", headers: auth(anna.deviceToken) });
    const zweitId = JSON.parse(list.body).devices.find((d: any) => d.label === "Zweitrechner").id;
    const revoke = await ctx.app.inject({ method: "POST", url: `/me/devices/${zweitId}/revoke`,
      headers: auth(anna.deviceToken) });
    expect(revoke.statusCode).toBe(200);

    const nachher = await ctx.app.inject({ method: "GET", url: "/changes", headers: auth(zweites.deviceToken) });
    expect(nachher.statusCode).toBe(401);
  });

  it("fremdes Gerät lässt sich nicht entziehen", async () => {
    const anna = await founder();
    const invite = await ctx.app.inject({ method: "POST", url: "/guardians/invite",
      headers: auth(anna.deviceToken), payload: { name: "Ben Keller", email: "ben@x.de" } });
    const ben = JSON.parse((await ctx.app.inject({ method: "POST", url: "/auth/redeem",
      payload: { code: JSON.parse(invite.body).code, deviceLabel: "Bens Rechner" } })).body);
    const benDevice = JSON.parse((await ctx.app.inject({ method: "GET", url: "/me/devices",
      headers: auth(ben.deviceToken) })).body).devices[0].id;

    const res = await ctx.app.inject({ method: "POST", url: `/me/devices/${benDevice}/revoke`,
      headers: auth(anna.deviceToken) });
    expect(res.statusCode).toBe(404);
    expect((await ctx.app.inject({ method: "GET", url: "/changes", headers: auth(ben.deviceToken) })).statusCode).toBe(200);
  });
});

describe("Versuchslimit auf der Code-Eingabe", () => {
  it("bremst das Durchprobieren von Codes", async () => {
    const ctx = setup(3);
    for (let i = 0; i < 3; i++) {
      const res = await ctx.app.inject({ method: "POST", url: "/auth/redeem", payload: { code: `MB-XXX${i}` } });
      expect(res.statusCode).toBe(400);
    }
    const gebremst = await ctx.app.inject({ method: "POST", url: "/auth/redeem", payload: { code: "MB-XXXX" } });
    expect(gebremst.statusCode).toBe(429);
  });

  it("greift auch auf dem Erst-Setup", async () => {
    const ctx = setup(2);
    for (let i = 0; i < 2; i++) {
      await ctx.app.inject({ method: "POST", url: "/auth/init",
        payload: { setupCode: "MB-INIT-0000", name: "X", email: "x@x.de" } });
    }
    const res = await ctx.app.inject({ method: "POST", url: "/auth/init",
      payload: { setupCode: "MB-INIT-7743", name: "Anna Roth", email: "anna@x.de" } });
    expect(res.statusCode).toBe(429);
  });

  // Wer mehrere Geräte hintereinander verknüpft, darf nicht in die Sperre laufen.
  it("ein geglückter Zugang setzt den Zähler zurück", async () => {
    const ctx = setup(2);
    const anna = JSON.parse((await ctx.app.inject({ method: "POST", url: "/auth/init",
      payload: { setupCode: "MB-INIT-7743", name: "Anna Roth", email: "anna@x.de" } })).body);

    for (const label of ["Zweiter", "Dritter"]) {
      const relink = await ctx.app.inject({ method: "POST", url: `/guardians/${anna.guardian.id}/relink`,
        headers: { authorization: `Bearer ${anna.deviceToken}` } });
      const res = await ctx.app.inject({ method: "POST", url: "/auth/redeem",
        payload: { code: JSON.parse(relink.body).code, deviceLabel: label } });
      expect(res.statusCode).toBe(200);
    }
  });
});
