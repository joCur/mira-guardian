import { describe, it, expect, vi } from "vitest";
import { createGuardianStore } from "../src/renderer/store.js";
import type { ChangeWithVotes } from "@guardian/shared";

function ch(id: string, over: Partial<ChangeWithVotes> = {}): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: `memory-bank/${id}.md`, changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "o", newMd: "n", cycleId: "cy", firstSeenAt: "t",
    votes: [], adoLink: "http://x", ...over };
}

function fakeApi(ids = ["c1", "c2", "c3"], over: Partial<any> = {}) {
  // Gemeinsamer Zustand, damit ein refresh() nach vote() die Bewertung sieht —
  // wie beim Server, wo beide Endpunkte auf denselben Store gehen.
  const changes = new Map<string, ChangeWithVotes>(ids.map(id => [id, ch(id)]));
  const mine = (c: ChangeWithVotes) => c.votes.find(v => v.guardianId === "g1")?.status;
  return {
    getChanges: vi.fn(async () => {
      const all = [...changes.values()];
      const toRate = all.filter(c => mine(c) !== "akzeptiert");
      const acceptedByMe = all.filter(c => mine(c) === "akzeptiert");
      return { toRate, acceptedByMe, badge: toRate.filter(c => !mine(c)).length };
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
  it("refresh loads both lists and picks a default selection", async () => {
    const store = createGuardianStore(fakeApi());
    await store.getState().refresh();
    expect(store.getState().toRate).toHaveLength(3);
    expect(store.getState().acceptedByMe).toHaveLength(0);
    expect(store.getState().badge).toBe(3);
    expect(store.getState().selectedId).toBe("c1");
  });

  it("accepting moves the change into acceptedByMe and advances the selection", async () => {
    const store = createGuardianStore(fakeApi());
    await store.getState().refresh();
    store.getState().select("c2");
    await store.getState().castVote("c2", "akzeptiert", "");

    expect(store.getState().toRate.map(c => c.id)).toEqual(["c1", "c3"]);
    expect(store.getState().acceptedByMe.map(c => c.id)).toEqual(["c2"]);
    // c2 verlässt die Liste — c3 rückt auf dessen Position nach.
    expect(store.getState().selectedId).toBe("c3");
  });

  it("rejecting keeps the change in the list but still advances", async () => {
    const store = createGuardianStore(fakeApi());
    await store.getState().refresh();
    store.getState().select("c1");
    await store.getState().castVote("c1", "abgelehnt", "weil");

    expect(store.getState().toRate.map(c => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(store.getState().selectedId).toBe("c2");
  });

  it("selects the remaining accepted entry when nothing is left to rate", async () => {
    const store = createGuardianStore(fakeApi(["c1"]));
    await store.getState().refresh();
    await store.getState().castVote("c1", "akzeptiert", "");
    expect(store.getState().toRate).toHaveLength(0);
    expect(store.getState().selectedId).toBe("c1");
  });

  it("onWsEvent triggers a refresh", async () => {
    const api = fakeApi();
    const store = createGuardianStore(api);
    store.getState().onWsEvent({ type: "change:new", changeId: "c9" });
    expect(api.getChanges).toHaveBeenCalled();
  });
});
