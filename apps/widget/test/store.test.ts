import { describe, it, expect, vi } from "vitest";
import { createGuardianStore } from "../src/renderer/store.js";
import type { ChangeWithVotes } from "@guardian/shared";

function ch(id: string, over: Partial<ChangeWithVotes> = {}): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: `memory-bank/${id}.md`, changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "o", newMd: "n", cycleId: "cy", firstSeenAt: "t",
    votes: [], adoLink: "http://x", ...over };
}

function fakeApi(over: Partial<any> = {}) {
  // Shared mutable state so that a refresh() after a vote() reflects that vote,
  // instead of resetting to the initial fixture (mirrors the server, where
  // /changes and /changes/:id/vote both read/write the same underlying store).
  const changes = new Map<string, ChangeWithVotes>([
    ["c1", ch("c1")],
    ["c2", ch("c2")],
  ]);
  return {
    getChanges: vi.fn(async () => {
      const all = [...changes.values()];
      const active = all.filter(c => !c.votes.some(v => v.status === "akzeptiert"));
      const accepted = all.filter(c => c.votes.some(v => v.status === "akzeptiert"));
      return { cycle: { id: "cy" }, active, accepted, badge: active.length };
    }),
    vote: vi.fn(async (id: string, status: string, comment: string) => {
      const updated = ch(id, { votes: [{ changeId: id, guardianId: "g1", status: status as any, comment: comment || null, updatedAt: "t" }] });
      changes.set(id, updated);
      return updated;
    }),
    ...over,
  } as any;
}

describe("guardian store", () => {
  it("refresh loads changes and picks a default selection", async () => {
    const store = createGuardianStore(fakeApi());
    await store.getState().refresh();
    expect(store.getState().active).toHaveLength(2);
    expect(store.getState().badge).toBe(2);
    expect(store.getState().selectedId).toBe("c1");
  });

  it("castVote updates the change in place", async () => {
    const store = createGuardianStore(fakeApi());
    await store.getState().refresh();
    await store.getState().castVote("c1", "akzeptiert", "");
    // castVote refreshes from the server afterwards, so an accepted change may
    // have moved from active into accepted (and the badge recomputed) — find it
    // in whichever list it now lives in.
    const c1 = [...store.getState().active, ...store.getState().accepted].find(c => c.id === "c1")!;
    expect(c1.votes[0].status).toBe("akzeptiert");
    expect(store.getState().active.find(c => c.id === "c1")).toBeUndefined();
    expect(store.getState().accepted.find(c => c.id === "c1")).toBeDefined();
    expect(store.getState().badge).toBe(1);
  });

  it("onWsEvent triggers a refresh", async () => {
    const api = fakeApi();
    const store = createGuardianStore(api);
    store.getState().onWsEvent({ type: "change:new", changeId: "c9" });
    expect(api.getChanges).toHaveBeenCalled();
  });
});
