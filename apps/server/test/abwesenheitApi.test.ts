import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import { AuthService } from "../src/domain/authService.js";
import { RealtimeHub } from "../src/realtime/hub.js";
import { buildApp } from "../src/api/httpApi.js";
import { loadConfig } from "../src/config.js";
import type { Change } from "@guardian/shared";

const config = loadConfig({
  ADO_BASE_URL: "https://ado.x", ADO_COLLECTION: "C", ADO_PROJECT: "P", ADO_REPO: "R", ADO_PAT: "s",
} as any);

const HEUTE = "2026-08-15T09:00:00.000Z";
const URLAUB = { from: "2026-08-10", until: "2026-08-20" };

function change(id: string): Change {
  return {
    id, repo: "R", branch: "main", filePath: `docs/decisions/${id}.md`, changeKind: "modify",
    commitId: "abc1234", commitShort: "abc1234", authorName: "A", authorEmail: "a@x.de",
    committedAt: HEUTE, summary: "s", oldMd: "alt", newMd: "neu",
    previousPath: null, baselineCommitId: null, cycleId: "cy1", firstSeenAt: HEUTE,
  };
}

function setup() {
  const store = new Store(":memory:");
  store.ensureSetupCode("MB-INIT-7743");
  const now = () => HEUTE;
  const changeService = new ChangeService(store, now);
  const authService = new AuthService(store, changeService, now);
  const hub = new RealtimeHub();
  const app = buildApp({ store, changeService, authService, hub, config, now });
  store.insertCycle({ id: "cy1", isoWeek: "2026-W33", startsAt: "t", endsAt: null, closedAt: null, note: null });
  return { store, changeService, app };
}

describe("Abwesenheits-API", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(); });

  /** Gründer plus zwei weitere Hüter; liefert die Gerätetoken je Hüter. */
  async function trio() {
    const init = await ctx.app.inject({ method: "POST", url: "/auth/init",
      payload: { setupCode: "MB-INIT-7743", name: "Anna Roth", email: "anna@x.de" } });
    const g1 = JSON.parse(init.body);
    const tokens: Record<string, string> = { [g1.guardian.id]: g1.deviceToken };
    for (const [name, mail] of [["Bert Blau", "bert@x.de"], ["Cara Cyan", "cara@x.de"]]) {
      const inv = await ctx.app.inject({ method: "POST", url: "/guardians/invite",
        headers: { authorization: `Bearer ${g1.deviceToken}` }, payload: { name, email: mail } });
      const red = await ctx.app.inject({ method: "POST", url: "/auth/redeem",
        payload: { code: JSON.parse(inv.body).code } });
      const g = JSON.parse(red.body);
      tokens[g.guardian.id] = g.deviceToken;
    }
    const ids = ctx.store.listGuardians().map(g => g.id);
    return { ids, tokens };
  }
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const changes = async (token: string) =>
    JSON.parse((await ctx.app.inject({ method: "GET", url: "/changes", headers: auth(token) })).body);

  it("Abwesenheit eintragen und wieder löschen", async () => {
    const { ids, tokens } = await trio();
    const [g1, , g3] = ids;

    const res = await ctx.app.inject({ method: "POST", url: `/guardians/${g3}/absence`,
      headers: auth(tokens[g1!]!), payload: URLAUB });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).guardian).toMatchObject({ absentFrom: URLAUB.from, absentUntil: URLAUB.until });

    const weg = await ctx.app.inject({ method: "POST", url: `/guardians/${g3}/absence`,
      headers: auth(tokens[g1!]!), payload: {} });
    expect(weg.statusCode).toBe(200);
    expect(JSON.parse(weg.body).guardian).toMatchObject({ absentFrom: null, absentUntil: null });
  });

  // Wer krank ist, trägt sich nicht selbst ein — deshalb darf jeder für jeden.
  it("jeder Hüter darf die Abwesenheit jedes Hüters setzen", async () => {
    const { ids, tokens } = await trio();
    const [g1, , g3] = ids;
    const res = await ctx.app.inject({ method: "POST", url: `/guardians/${g1}/absence`,
      headers: auth(tokens[g3!]!), payload: URLAUB });
    expect(res.statusCode).toBe(200);
  });

  it("weist unbekannte Hüter, kaputte Daten und ein Ende vor dem Beginn ab", async () => {
    const { ids, tokens } = await trio();
    const t = auth(tokens[ids[0]!]!);

    expect((await ctx.app.inject({ method: "POST", url: "/guardians/gibtsnicht/absence",
      headers: t, payload: URLAUB })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: "POST", url: `/guardians/${ids[2]}/absence`,
      headers: t, payload: { from: "10.08.2026", until: "20.08.2026" } })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: "POST", url: `/guardians/${ids[2]}/absence`,
      headers: t, payload: { from: "2026-08-20", until: "2026-08-10" } })).statusCode).toBe(400);
  });

  // Eine neu eingetragene Abwesenheit kann Änderungen abschlussreif machen,
  // ohne dass jemand bewertet.
  it("das Eintragen schließt bereits bestätigte Änderungen ab", async () => {
    const { ids, tokens } = await trio();
    const [g1, g2, g3] = ids;
    ctx.store.upsertChange(change("c1"));
    ctx.changeService.ensureVotesForChange("c1", HEUTE);
    for (const g of [g1!, g2!]) {
      await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
        headers: auth(tokens[g]!), payload: { status: "akzeptiert" } });
    }
    expect((await changes(tokens[g3!]!)).toRate).toHaveLength(1);

    await ctx.app.inject({ method: "POST", url: `/guardians/${g3}/absence`,
      headers: auth(tokens[g1!]!), payload: URLAUB });

    const nach = await changes(tokens[g3!]!);
    expect(nach.toRate).toEqual([]);
    expect(nach.decidedWithoutMe.map((c: Change) => c.id)).toEqual(["c1"]);
    expect(nach.badge).toBe(0);
  });

  it("die letzte Bestätigung der Anwesenden schließt ab", async () => {
    const { ids, tokens } = await trio();
    const [g1, g2, g3] = ids;
    ctx.store.upsertChange(change("c1"));
    ctx.changeService.ensureVotesForChange("c1", HEUTE);
    await ctx.app.inject({ method: "POST", url: `/guardians/${g3}/absence`,
      headers: auth(tokens[g1!]!), payload: URLAUB });

    for (const g of [g1!, g2!]) {
      await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
        headers: auth(tokens[g]!), payload: { status: "akzeptiert" } });
    }
    expect((await changes(tokens[g1!]!)).toRate).toEqual([]);
    expect((await changes(tokens[g3!]!)).decidedWithoutMe).toHaveLength(1);
  });

  it("uebersprungen ist über die API nicht setzbar, unbekannte Status ebenso", async () => {
    const { ids, tokens } = await trio();
    ctx.store.upsertChange(change("c1"));
    ctx.changeService.ensureVotesForChange("c1", HEUTE);
    const t = auth(tokens[ids[0]!]!);

    for (const status of ["uebersprungen", "vielleicht", ""]) {
      const res = await ctx.app.inject({ method: "POST", url: "/changes/c1/vote", headers: t, payload: { status } });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe("Unbekannte Bewertung.");
    }
  });

  it("nachlesen hakt ab; eine Änderung steht nie in beiden Listen", async () => {
    const { ids, tokens } = await trio();
    const [g1, g2, g3] = ids;
    ctx.store.upsertChange(change("c1"));
    ctx.changeService.ensureVotesForChange("c1", HEUTE);
    await ctx.app.inject({ method: "POST", url: `/guardians/${g3}/absence`,
      headers: auth(tokens[g1!]!), payload: URLAUB });
    for (const g of [g1!, g2!]) {
      await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
        headers: auth(tokens[g]!), payload: { status: "akzeptiert" } });
    }

    const vorher = await changes(tokens[g3!]!);
    expect(vorher.decidedWithoutMe).toHaveLength(1);
    expect(vorher.toRate).toEqual([]);

    const seen = await ctx.app.inject({ method: "POST", url: "/me/seen",
      headers: auth(tokens[g3!]!), payload: { changeIds: ["c1"] } });
    expect(seen.statusCode).toBe(200);
    expect((await changes(tokens[g3!]!)).decidedWithoutMe).toEqual([]);
  });

  it("/me/seen verlangt eine Liste von Ids", async () => {
    const { ids, tokens } = await trio();
    const t = auth(tokens[ids[0]!]!);
    expect((await ctx.app.inject({ method: "POST", url: "/me/seen", headers: t, payload: {} })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: "POST", url: "/me/seen", headers: t,
      payload: { changeIds: [1, 2] } })).statusCode).toBe(400);
  });

  it("Einspruch macht die Änderung wieder zum Streitfall", async () => {
    const { ids, tokens } = await trio();
    const [g1, g2, g3] = ids;
    ctx.store.upsertChange(change("c1"));
    ctx.changeService.ensureVotesForChange("c1", HEUTE);
    await ctx.app.inject({ method: "POST", url: `/guardians/${g3}/absence`,
      headers: auth(tokens[g1!]!), payload: URLAUB });
    for (const g of [g1!, g2!]) {
      await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
        headers: auth(tokens[g]!), payload: { status: "akzeptiert" } });
    }

    const res = await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
      headers: auth(tokens[g3!]!), payload: { status: "klaerung", comment: "so nicht" } });
    expect(res.statusCode).toBe(200);

    const nach = await changes(tokens[g3!]!);
    expect(nach.decidedWithoutMe).toEqual([]);
    expect(nach.toRate.map((c: Change) => c.id)).toEqual(["c1"]);
    const meeting = JSON.parse((await ctx.app.inject({ method: "GET", url: "/meeting",
      headers: auth(tokens[g1!]!) })).body);
    expect(meeting.changes.map((c: Change) => c.id)).toEqual(["c1"]);
  });

  it("/guardians liefert die Abwesenheit mit", async () => {
    const { ids, tokens } = await trio();
    await ctx.app.inject({ method: "POST", url: `/guardians/${ids[2]}/absence`,
      headers: auth(tokens[ids[0]!]!), payload: URLAUB });
    const res = await ctx.app.inject({ method: "GET", url: "/guardians", headers: auth(tokens[ids[0]!]!) });
    const g3 = JSON.parse(res.body).guardians.find((g: any) => g.id === ids[2]);
    expect(g3).toMatchObject({ absentFrom: URLAUB.from, absentUntil: URLAUB.until });
  });
});
