import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import { AuthService } from "../src/domain/authService.js";
import { RealtimeHub } from "../src/realtime/hub.js";
import { buildApp } from "../src/api/httpApi.js";
import { loadConfig } from "../src/config.js";
import type { BildDienst } from "../src/api/bilder.js";

const config = loadConfig({
  ADO_BASE_URL: "https://ado.x", ADO_COLLECTION: "C", ADO_PROJECT: "P", ADO_REPO: "R", ADO_PAT: "s",
} as any);

let clock = 0; const now = () => `t${clock++}`;

function setup() {
  clock = 0;
  const store = new Store(":memory:");
  store.ensureSetupCode("MB-INIT-7743");
  const changeService = new ChangeService(store);
  const authService = new AuthService(store, changeService, now);
  const hub = new RealtimeHub();
  const app = buildApp({ store, changeService, authService, hub, config, now });
  return { store, changeService, authService, app };
}

describe("HTTP API", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(); });

  async function initFounder() {
    const res = await ctx.app.inject({ method: "POST", url: "/auth/init",
      payload: { setupCode: "MB-INIT-7743", name: "Anna Roth", email: "anna@x.de" } });
    return JSON.parse(res.body).deviceToken as string;
  }

  it("health needs no auth", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  // Die Version gehört hierher, damit das Widget sie ohne Zugang lesen kann und
  // Monitoring sie mitbekommt.
  it("health reports the running version", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/health" });
    expect(JSON.parse(res.body)).toEqual({ ok: true, version: expect.any(String) });
  });

  it("rejects unauthenticated /changes", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/changes" });
    expect(res.statusCode).toBe(401);
  });

  it("init then list changes (both lists empty) with badge 0", async () => {
    const token = await initFounder();
    const res = await ctx.app.inject({ method: "GET", url: "/changes", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.toRate).toEqual([]);
    expect(body.ratedByMe).toEqual([]);
    expect(body.badge).toBe(0);
  });

  // Der Verlauf im Widget holt sich Änderungen einzeln über ihre Id — auch
  // solche, die alle Hüter akzeptiert haben und die deshalb in keiner der beiden
  // Listen mehr auftauchen. Bricht das weg, zeigt der Verlauf die falsche
  // Änderung.
  it("serves a change that every guardian has accepted", async () => {
    const token = await initFounder();
    const cycle = ctx.store.getOpenCycle()!;
    ctx.store.upsertChange({ id: "c1", repo: "R", branch: "main", filePath: "memory-bank/a.md",
      changeKind: "modify", commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de",
      committedAt: "t", summary: "s", oldMd: "o", newMd: "n", previousPath: null, baselineCommitId: null, previousNewMd: null, commitCount: 1, cycleId: cycle.id, firstSeenAt: "t" });
    ctx.changeService.ensureVotesForChange("c1", now());
    await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
      headers: { authorization: `Bearer ${token}` }, payload: { status: "akzeptiert" } });

    const lists = await ctx.app.inject({ method: "GET", url: "/changes", headers: { authorization: `Bearer ${token}` } });
    const body = JSON.parse(lists.body);
    expect([...body.toRate, ...body.ratedByMe]).toEqual([]);
    // Ältere Widgets lesen acceptedByMe — das Feld muss mitkommen.
    expect(body.acceptedByMe).toEqual([]);

    const single = await ctx.app.inject({ method: "GET", url: "/changes/c1", headers: { authorization: `Bearer ${token}` } });
    expect(single.statusCode).toBe(200);
    expect(JSON.parse(single.body).id).toBe("c1");
  });

  it("enforces the comment rule on votes", async () => {
    const token = await initFounder();
    const cycle = ctx.store.getOpenCycle()!;
    ctx.store.upsertChange({ id: "c1", repo: "R", branch: "main", filePath: "memory-bank/a.md",
      changeKind: "modify", commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de",
      committedAt: "t", summary: "s", oldMd: "o", newMd: "n", previousPath: null, baselineCommitId: null, previousNewMd: null, commitCount: 1, cycleId: cycle.id, firstSeenAt: "t" });
    ctx.changeService.ensureVotesForChange("c1", now());

    const bad = await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
      headers: { authorization: `Bearer ${token}` }, payload: { status: "abgelehnt", comment: "no" } });
    expect(bad.statusCode).toBe(400);

    const ok = await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
      headers: { authorization: `Bearer ${token}` }, payload: { status: "abgelehnt", comment: "Bitte zuerst Specs migrieren." } });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).votes[0].status).toBe("abgelehnt");
  });

  describe("Bilder", () => {
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    function mitBildern(hole: BildDienst["hole"]) {
      const store = new Store(":memory:");
      store.ensureSetupCode("MB-INIT-7743");
      const changeService = new ChangeService(store);
      const authService = new AuthService(store, changeService, now);
      const app = buildApp({ store, changeService, authService, hub: new RealtimeHub(), config, now,
        bildDienst: { hole } as BildDienst });
      return { store, app };
    }

    async function angemeldet(app: ReturnType<typeof buildApp>) {
      const res = await app.inject({ method: "POST", url: "/auth/init",
        payload: { setupCode: "MB-INIT-7743", name: "Anna Roth", email: "anna@x.de" } });
      return JSON.parse(res.body).deviceToken as string;
    }

    function bildAenderung(store: Store) {
      if (!store.getOpenCycle()) {
        store.insertCycle({ id: "cy1", isoWeek: "2026-W30", startsAt: "t", endsAt: null, closedAt: null, note: null });
      }
      store.upsertChange({ id: "b1", repo: "R", branch: "main", filePath: "docs/decisions/flow.png",
        changeKind: "modify", commitId: "c9", commitShort: "c9", authorName: "A", authorEmail: "a@x.de",
        committedAt: "t", summary: "s", oldMd: null, newMd: null, previousPath: null,
        baselineCommitId: "c9", previousNewMd: null, commitCount: 1, cycleId: store.getOpenCycle()!.id, firstSeenAt: "t" });
    }

    it("liefert das Bild mit seinem Bildtyp aus", async () => {
      const { store, app } = mitBildern(async () => ({ bytes: PNG, contentType: "image/png" }));
      const token = await angemeldet(app);
      bildAenderung(store);
      const res = await app.inject({ method: "GET", url: "/changes/b1/bild/nachher",
        headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("image/png");
      expect(res.rawPayload.subarray(0, 4).toString("hex")).toBe("89504e47");
    });

    it("reicht den Pfad eines eingebetteten Bildes an den Dienst weiter", async () => {
      const gesehen: unknown[] = [];
      const { store, app } = mitBildern(async (_c, seite, pfad) => {
        gesehen.push([seite, pfad]);
        return { bytes: PNG, contentType: "image/png" };
      });
      const token = await angemeldet(app);
      bildAenderung(store);
      await app.inject({ method: "GET", url: "/changes/b1/bild/vorher?pfad=diagrams%2Fflow.png",
        headers: { authorization: `Bearer ${token}` } });
      expect(gesehen).toEqual([["vorher", "diagrams/flow.png"]]);
    });

    // "Gibt es nicht" ist bei Bildern eine normale Auskunft — neu angelegt hat
    // kein Vorher, gelöscht kein Nachher. Das Widget zeigt dafür einen Hinweis.
    it("antwortet mit 404, wenn es die Seite nicht gibt", async () => {
      const { store, app } = mitBildern(async () => null);
      const token = await angemeldet(app);
      bildAenderung(store);
      const res = await app.inject({ method: "GET", url: "/changes/b1/bild/vorher",
        headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(404);
    });

    it("meldet einen Ausfall bei ADO als 502, nicht als leeres Bild", async () => {
      const { store, app } = mitBildern(async () => { throw new Error("ADO item 500"); });
      const token = await angemeldet(app);
      bildAenderung(store);
      const res = await app.inject({ method: "GET", url: "/changes/b1/bild/nachher",
        headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(502);
    });

    it("weist eine unbekannte Seite ab", async () => {
      const { store, app } = mitBildern(async () => ({ bytes: PNG, contentType: "image/png" }));
      const token = await angemeldet(app);
      bildAenderung(store);
      const res = await app.inject({ method: "GET", url: "/changes/b1/bild/irgendwas",
        headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(400);
    });

    it("gibt Bilder nicht ohne Anmeldung heraus", async () => {
      const { store, app } = mitBildern(async () => ({ bytes: PNG, contentType: "image/png" }));
      bildAenderung(store);
      const res = await app.inject({ method: "GET", url: "/changes/b1/bild/nachher" });
      expect(res.statusCode).toBe(401);
    });
  });
});
