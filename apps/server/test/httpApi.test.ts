import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import { AuthService } from "../src/domain/authService.js";
import { RealtimeHub } from "../src/realtime/hub.js";
import { buildApp } from "../src/api/httpApi.js";
import { loadConfig } from "../src/config.js";

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
    expect(body.acceptedByMe).toEqual([]);
    expect(body.badge).toBe(0);
  });

  it("enforces the comment rule on votes", async () => {
    const token = await initFounder();
    const cycle = ctx.store.getOpenCycle()!;
    ctx.store.upsertChange({ id: "c1", repo: "R", branch: "main", filePath: "memory-bank/a.md",
      changeKind: "modify", commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de",
      committedAt: "t", summary: "s", oldMd: "o", newMd: "n", previousPath: null, cycleId: cycle.id, firstSeenAt: "t" });
    ctx.changeService.ensureVotesForChange("c1", now());

    const bad = await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
      headers: { authorization: `Bearer ${token}` }, payload: { status: "abgelehnt", comment: "no" } });
    expect(bad.statusCode).toBe(400);

    const ok = await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
      headers: { authorization: `Bearer ${token}` }, payload: { status: "abgelehnt", comment: "Bitte zuerst Specs migrieren." } });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).votes[0].status).toBe("abgelehnt");
  });
});
