import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import { AuthService, AuthError } from "../src/domain/authService.js";
import { generateCode } from "../src/domain/codes.js";

let clock = 0;
const now = () => `t${clock++}`;

describe("generateCode", () => {
  it("uses prefix and 4 chars from the safe alphabet", () => {
    const seq = [0, 0, 0, 0];
    let i = 0;
    const code = generateCode("MB", () => seq[i++] / 18);
    expect(code).toBe("MB-AAAA");
  });
});

describe("AuthService", () => {
  let s: Store, svc: AuthService;
  beforeEach(() => {
    clock = 0;
    s = new Store(":memory:");
    s.ensureSetupCode("MB-INIT-7743");
    svc = new AuthService(s, new ChangeService(s), now);
  });

  it("founds the first guardian with the setup code", () => {
    const r = svc.initFounder("MB-INIT-7743", "Anna Roth", "anna@x.de");
    expect(r.guardian.isFounder).toBe(true);
    expect(r.guardian.initials).toBe("AR");
    expect(r.deviceToken).toBeTruthy();
    expect(s.getSetupState().initializedAt).not.toBeNull();
    expect(svc.guardianForToken(r.deviceToken)?.id).toBe(r.guardian.id);
  });

  it("rejects a wrong setup code", () => {
    expect(() => svc.initFounder("MB-INIT-0000", "X", "x@x.de")).toThrow(AuthError);
  });

  it("invites then redeems a new guardian and backfills votes", () => {
    const founder = svc.initFounder("MB-INIT-7743", "Anna Roth", "anna@x.de");
    // an existing open change so backfill has something to do
    s.upsertChange({ id: "c1", repo: "r", branch: "main", filePath: "memory-bank/a.md",
      changeKind: "modify", commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de",
      committedAt: "t", summary: "s", oldMd: "o", newMd: "n",
      cycleId: s.getOpenCycle()!.id, firstSeenAt: "t" });
    const { code } = svc.invite(founder.guardian.id, "Ben Keller", "ben@x.de");
    const r = svc.redeem(code);
    expect(r.guardian.name).toBe("Ben Keller");
    expect(s.listVotesByChange("c1").find(v => v.guardianId === r.guardian.id)?.status).toBe("offen");
    expect(() => svc.redeem(code)).toThrow(AuthError); // one-time
  });
});
