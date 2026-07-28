import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import type { Change, Guardian } from "@guardian/shared";

function guardian(id: string): Guardian {
  return { id, name: id, email: `${id}@x.de`, initials: id.slice(0,2).toUpperCase(),
    avatarColor: "#fff", createdAt: "t", isFounder: false };
}
function change(id: string, path: string): Change {
  return { id, repo: "r", branch: "main", filePath: path, changeKind: "modify",
    commitId: id, commitShort: id, authorName: "A", authorEmail: "a@x.de",
    committedAt: "2026-07-19T10:00:00Z", summary: "s", oldMd: "old", newMd: "new",
    cycleId: "cy1", firstSeenAt: "t" };
}

describe("ChangeService", () => {
  let s: Store, svc: ChangeService;
  beforeEach(() => {
    s = new Store(":memory:");
    svc = new ChangeService(s);
    s.insertCycle({ id: "cy1", isoWeek: "2026-W30", startsAt: "t", endsAt: null, closedAt: null, note: null });
    ["g1","g2","g3"].forEach(id => s.insertGuardian(guardian(id)));
  });

  function vote(cid: string, gid: string, status: any, comment: string | null = null) {
    s.upsertVote({ changeId: cid, guardianId: gid, status, comment, updatedAt: "t" });
  }

  it("splits active vs accepted by all-accepted", () => {
    s.upsertChange(change("c1", "memory-bank/a.md"));
    s.upsertChange(change("c2", "memory-bank/b.md"));
    ["g1","g2","g3"].forEach(g => vote("c1", g, "akzeptiert"));
    vote("c2", "g1", "akzeptiert"); vote("c2", "g2", "offen"); vote("c2", "g3", "akzeptiert");
    expect(svc.allAccepted("c1")).toBe(true);
    // Von allen akzeptiert → aus allen Arbeitslisten verschwunden.
    expect(svc.openChanges().map(c => c.id)).toEqual(["c2"]);
    expect(svc.acceptedByMe("g1").map(c => c.id)).toEqual(["c2"]);
    expect(svc.toRate("g2").map(c => c.id)).toEqual(["c2"]);
  });

  it("counts a guardian's pending badge", () => {
    s.upsertChange(change("c1", "memory-bank/a.md"));
    s.upsertChange(change("c2", "memory-bank/b.md"));
    vote("c1","g1","offen"); vote("c2","g1","akzeptiert");
    expect(svc.badgeCount("g1")).toBe(1);
  });

  it("computes worst stripe status", () => {
    s.upsertChange(change("c1", "memory-bank/a.md"));
    vote("c1","g1","akzeptiert"); vote("c1","g2","klaerung","x"); vote("c1","g3","abgelehnt","y");
    expect(svc.stripeStatus("c1")).toBe("abgelehnt");
  });

  it("meeting list: rejected before klaerung, fully accepted omitted", () => {
    s.upsertChange(change("c1", "memory-bank/a.md"));
    s.upsertChange(change("c2", "memory-bank/b.md"));
    s.upsertChange(change("c3", "memory-bank/c.md"));
    vote("c1","g1","abgelehnt","no"); vote("c1","g2","akzeptiert"); vote("c1","g3","offen");
    vote("c2","g1","klaerung","q"); vote("c2","g2","akzeptiert"); vote("c2","g3","akzeptiert");
    ["g1","g2","g3"].forEach(g => vote("c3", g, "akzeptiert"));
    // Hüter-Übersicht: alles Unerledigte worst-first, Akzeptiertes fehlt.
    expect(svc.openChanges().map(c=>c.id)).toEqual(["c1","c2"]);
    expect(svc.meetingCounts()).toEqual({ abgelehnt: 1, klaerung: 1, offen: 0, gesamt: 2 });
  });

  it("backfills offen votes for a new guardian", () => {
    s.upsertChange(change("c1", "memory-bank/a.md"));
    vote("c1","g1","akzeptiert");
    s.insertGuardian(guardian("g4"));
    svc.backfillVotesForGuardian("g4", "t");
    const statuses = s.listVotesByChange("c1").find(v => v.guardianId === "g4");
    expect(statuses?.status).toBe("offen");
  });
});
