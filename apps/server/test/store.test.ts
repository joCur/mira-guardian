import { describe, it, expect } from "vitest";
import { Store } from "../src/db/store.js";
import type { Change, Vote } from "@guardian/shared";

function newStore() { return new Store(":memory:"); }

const change: Change = {
  id: "ch1", repo: "r", branch: "main", filePath: "docs/decisions/adr-013.md",
  changeKind: "add", commitId: "abc123", commitShort: "abc123",
  authorName: "Anna", authorEmail: "a@x.de", committedAt: "2026-07-19T10:00:00Z",
  summary: "Neue Decision", oldMd: null, newMd: "# ADR", cycleId: "cy1",
  firstSeenAt: "2026-07-19T10:00:00Z",
};

describe("Store", () => {
  it("round-trips a guardian", () => {
    const s = newStore();
    s.insertGuardian({ id: "g1", name: "Anna Roth", email: "a@x.de", initials: "AR",
      avatarColor: "#7aa2f7", createdAt: "2026-07-01T00:00:00Z", isFounder: true });
    expect(s.getGuardian("g1")?.name).toBe("Anna Roth");
    expect(s.listGuardians()).toHaveLength(1);
  });

  it("upserts a change unique by cycle+path", () => {
    const s = newStore();
    s.insertCycle({ id: "cy1", isoWeek: "2026-W30", startsAt: "x", endsAt: null, closedAt: null, note: null });
    s.upsertChange(change);
    s.upsertChange({ ...change, id: "ch1b", newMd: "# ADR v2", commitId: "def456" });
    const rows = s.listChangesByCycle("cy1");
    expect(rows).toHaveLength(1);
    expect(rows[0].newMd).toBe("# ADR v2");
    expect(rows[0].commitId).toBe("def456");
  });

  it("enforces one vote per (change, guardian) and resets votes", () => {
    const s = newStore();
    s.insertCycle({ id: "cy1", isoWeek: "2026-W30", startsAt: "x", endsAt: null, closedAt: null, note: null });
    s.upsertChange(change);
    const v: Vote = { changeId: "ch1", guardianId: "g1", status: "akzeptiert", comment: null, updatedAt: "t1" };
    s.upsertVote(v);
    s.upsertVote({ ...v, status: "abgelehnt", comment: "nein", updatedAt: "t2" });
    expect(s.listVotesByChange("ch1")).toHaveLength(1);
    expect(s.listVotesByChange("ch1")[0].status).toBe("abgelehnt");
    s.resetVotesForChange("ch1", "t3");
    expect(s.listVotesByChange("ch1")[0].status).toBe("offen");
    expect(s.listVotesByChange("ch1")[0].comment).toBeNull();
  });

  it("tracks last seen commit per repo/branch", () => {
    const s = newStore();
    expect(s.getLastSeenCommit("r", "main")).toBeUndefined();
    s.setLastSeenCommit("r", "main", "c1");
    s.setLastSeenCommit("r", "main", "c2");
    expect(s.getLastSeenCommit("r", "main")).toBe("c2");
  });
});
