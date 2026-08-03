import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import { AuthService, AuthError, CODE_TTL_MS } from "../src/domain/authService.js";
import { generateCode } from "../src/domain/codes.js";

// Echte ISO-Zeitstempel aus derselben Uhr wie nowMs: der letzte Kontakt eines
// Geräts wird als Zeitpunkt gelesen, ein Zähler wäre dafür kein Ersatz.
let ms = Date.parse("2026-08-03T10:00:00.000Z");
const nowMs = () => ms;
const now = () => new Date(ms).toISOString();

describe("generateCode", () => {
  it("gruppiert längere Codes in Vierergruppen", () => {
    const code = generateCode("MB", 8, () => 0);
    expect(code).toBe("MB-AAAA-AAAA");
  });
});

describe("Gerät mit bestehendem Profil verknüpfen", () => {
  let s: Store, svc: AuthService, founderId: string, founderToken: string;
  beforeEach(() => {
    ms = Date.parse("2026-08-03T10:00:00.000Z");
    s = new Store(":memory:");
    s.ensureSetupCode("MB-INIT-7743");
    svc = new AuthService(s, new ChangeService(s), now, nowMs);
    const founder = svc.initFounder("MB-INIT-7743", "Anna Roth", "anna@x.de", "MacBook");
    founderId = founder.guardian.id;
    founderToken = founder.deviceToken;
  });

  // Der Kern: derselbe Hüter auf einem zweiten Rechner. Vor dieser Änderung
  // gab es nur die Einladung, und die legte ein zweites Profil an.
  it("legt kein zweites Profil an und behält Rolle und Bewertungen", () => {
    s.upsertChange({ id: "c1", repo: "r", branch: "main", filePath: "memory-bank/a.md",
      changeKind: "modify", commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de",
      committedAt: "t", summary: "s", oldMd: "o", newMd: "n",
      previousPath: null, cycleId: s.getOpenCycle()!.id, firstSeenAt: "t" });
    s.upsertVote({ changeId: "c1", guardianId: founderId, status: "akzeptiert", comment: null, updatedAt: "t" });

    const { code } = svc.relink(founderId, founderId);
    const r = svc.redeem(code, "Neuer Rechner");

    expect(r.guardian.id).toBe(founderId);
    expect(r.guardian.isFounder).toBe(true);
    expect(r.created).toBe(false);
    expect(s.listGuardians()).toHaveLength(1);
    // Die Bewertung bleibt, wie sie war — kein Zurücksetzen auf "offen".
    expect(s.listVotesByChange("c1").find(v => v.guardianId === founderId)?.status).toBe("akzeptiert");
  });

  it("das neue Gerät kann sofort arbeiten, das alte bleibt gültig", () => {
    const { code } = svc.relink(founderId, founderId);
    const zweites = svc.redeem(code, "Neuer Rechner").deviceToken;
    expect(svc.guardianForToken(zweites)?.id).toBe(founderId);
    expect(svc.guardianForToken(founderToken)?.id).toBe(founderId);
    expect(svc.listDevices(founderId, "")).toHaveLength(2);
  });

  it("ein Code gilt nur einmal", () => {
    const { code } = svc.relink(founderId, founderId);
    svc.redeem(code);
    expect(() => svc.redeem(code)).toThrow(AuthError);
  });

  // Sonst sammelt sich mit jedem Versuch ein weiterer gültiger Zugang an.
  it("ein neuer Code entwertet den vorigen für dasselbe Profil", () => {
    const erster = svc.relink(founderId, founderId).code;
    const zweiter = svc.relink(founderId, founderId).code;
    expect(() => svc.redeem(erster)).toThrow(AuthError);
    expect(svc.redeem(zweiter).guardian.id).toBe(founderId);
  });

  it("nach Ablauf der Gültigkeit nicht mehr einlösbar", () => {
    const { code, expiresAt } = svc.relink(founderId, founderId);
    expect(Date.parse(expiresAt)).toBe(ms + CODE_TTL_MS);
    ms += CODE_TTL_MS + 1;
    expect(() => svc.redeem(code)).toThrow(/abgelaufen/);
  });

  it("auch eine Einladung läuft ab", () => {
    const { code } = svc.invite(founderId, "Ben Keller", "ben@x.de");
    ms += CODE_TTL_MS + 1;
    expect(() => svc.redeem(code)).toThrow(/abgelaufen/);
  });

  // Bestandsdaten: Codes von vor dieser Änderung haben kein Ablaufdatum.
  it("Codes ohne Ablaufdatum bleiben gültig", () => {
    s.insertInviteCode({ code: "MB-ALT1", name: "Ben Keller", email: "ben@x.de",
      createdBy: founderId, createdAt: "t" });
    ms += 365 * 24 * 60 * 60 * 1000;
    expect(svc.redeem("MB-ALT1").guardian.name).toBe("Ben Keller");
  });

  it("lehnt einen Code für ein unbekanntes Profil ab", () => {
    expect(() => svc.relink(founderId, "gibt-es-nicht")).toThrow(AuthError);
  });

  it("taucht nicht in der Liste offener Einladungen auf", () => {
    svc.relink(founderId, founderId);
    expect(s.listOpenInviteCodes()).toHaveLength(0);
    svc.invite(founderId, "Ben Keller", "ben@x.de");
    expect(s.listOpenInviteCodes().map(c => c.name)).toEqual(["Ben Keller"]);
  });
});

describe("Geräteliste", () => {
  let s: Store, svc: AuthService, founderId: string, founderToken: string;
  beforeEach(() => {
    ms = Date.parse("2026-08-03T10:00:00.000Z");
    s = new Store(":memory:");
    s.ensureSetupCode("MB-INIT-7743");
    svc = new AuthService(s, new ChangeService(s), now, nowMs);
    const founder = svc.initFounder("MB-INIT-7743", "Anna Roth", "anna@x.de", "MacBook von Anna");
    founderId = founder.guardian.id;
    founderToken = founder.deviceToken;
  });

  it("nennt das Gerät beim Namen und markiert das eigene", () => {
    const session = svc.sessionForToken(founderToken)!;
    const devices = svc.listDevices(founderId, session.deviceId);
    expect(devices).toHaveLength(1);
    expect(devices[0].label).toBe("MacBook von Anna");
    expect(devices[0].current).toBe(true);
  });

  it("nimmt einen leeren Namen nicht als Lücke hin", () => {
    const { code } = svc.relink(founderId, founderId);
    svc.redeem(code, "   ");
    expect(svc.listDevices(founderId, "").map(d => d.label)).toContain("Unbenanntes Gerät");
  });

  it("entzogenes Gerät kommt nicht mehr durch", () => {
    const { code } = svc.relink(founderId, founderId);
    const zweites = svc.redeem(code, "Alter Rechner").deviceToken;
    const id = svc.sessionForToken(zweites)!.deviceId;

    svc.revokeDevice(founderId, id);

    expect(svc.guardianForToken(zweites)).toBeUndefined();
    expect(svc.listDevices(founderId, "")).toHaveLength(1);
  });

  // Sonst könnte ein Hüter den Zugang eines anderen kappen.
  it("fremde Geräte lassen sich nicht entziehen", () => {
    const { code } = svc.invite(founderId, "Ben Keller", "ben@x.de");
    const ben = svc.redeem(code, "Bens Rechner");
    const benDevice = svc.sessionForToken(ben.deviceToken)!.deviceId;

    expect(() => svc.revokeDevice(founderId, benDevice)).toThrow(AuthError);
    expect(svc.guardianForToken(ben.deviceToken)?.id).toBe(ben.guardian.id);
  });

  it("hält den letzten Kontakt nach, aber nicht bei jeder Abfrage", () => {
    const first = svc.listDevices(founderId, "")[0].lastSeenAt;
    svc.sessionForToken(founderToken);
    expect(svc.listDevices(founderId, "")[0].lastSeenAt).toBe(first);

    ms += 61 * 1000;
    svc.sessionForToken(founderToken);
    expect(svc.listDevices(founderId, "")[0].lastSeenAt).not.toBe(first);
  });
});
