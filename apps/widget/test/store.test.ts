import { describe, it, expect, vi } from "vitest";
import { createGuardianStore } from "../src/renderer/store.js";
import type { ChangeWithVotes } from "@guardian/shared";

function ch(id: string, over: Partial<ChangeWithVotes> = {}): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: `memory-bank/${id}.md`, changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "o", newMd: "n", previousPath: null, baselineCommitId: null, previousNewMd: null, commitCount: 1, cycleId: "cy", firstSeenAt: "t",
    votes: [], adoLink: "http://x", ...over };
}

function fakeApi(ids = ["c1", "c2", "c3"], over: Partial<any> = {}, alleAkzeptiert: string[] = []) {
  // Gemeinsamer Zustand, damit ein refresh() nach vote() die Bewertung sieht —
  // wie beim Server, wo beide Endpunkte auf denselben Store gehen.
  const changes = new Map<string, ChangeWithVotes>(ids.map(id => [id, ch(id)]));
  const fertig = new Set(alleAkzeptiert);
  for (const id of fertig) {
    changes.set(id, ch(id, { votes: [{ changeId: id, guardianId: "g1", status: "akzeptiert", comment: null, updatedAt: "t" }] }));
  }
  const mine = (c: ChangeWithVotes) => c.votes.find(v => v.guardianId === "g1")?.status;
  return {
    getChanges: vi.fn(async () => {
      // Wie der Server: was alle Hüter akzeptiert haben, verlässt beide Listen,
      // und was ich bewertet habe, ist nicht mehr zu bewerten.
      const all = [...changes.values()].filter(c => !fertig.has(c.id));
      const offen = (c: ChangeWithVotes) => (mine(c) ?? "offen") === "offen";
      const toRate = all.filter(offen);
      const ratedByMe = all.filter(c => !offen(c));
      return { toRate, ratedByMe, badge: toRate.length };
    }),
    getChange: vi.fn(async (id: string) => {
      const c = changes.get(id);
      if (!c) throw new Error("unbekannt");
      return c;
    }),
    vote: vi.fn(async (id: string, status: string, comment: string) => {
      // Eine eigene Bewertung öffnet die Änderung wieder für das Team.
      fertig.delete(id);
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
    expect(store.getState().ratedByMe).toHaveLength(0);
    expect(store.getState().badge).toBe(3);
    expect(store.getState().selectedId).toBe("c1");
  });

  it("accepting moves the change into ratedByMe and advances the selection", async () => {
    const store = createGuardianStore(fakeApi());
    await store.getState().refresh();
    store.getState().select("c2");
    await store.getState().castVote("c2", "akzeptiert", "");

    expect(store.getState().toRate.map(c => c.id)).toEqual(["c1", "c3"]);
    expect(store.getState().ratedByMe.map(c => c.id)).toEqual(["c2"]);
    // c2 verlässt die Liste — c3 rückt auf dessen Position nach.
    expect(store.getState().selectedId).toBe("c3");
  });

  // Auch ein Einwand ist bewertet: er verlässt die Arbeitsliste, damit man ihn
  // nicht ein zweites Mal vorgelegt bekommt.
  it("rejecting moves the change out of the list as well", async () => {
    const store = createGuardianStore(fakeApi());
    await store.getState().refresh();
    store.getState().select("c1");
    await store.getState().castVote("c1", "abgelehnt", "weil");

    expect(store.getState().toRate.map(c => c.id)).toEqual(["c2", "c3"]);
    expect(store.getState().ratedByMe.map(c => c.id)).toEqual(["c1"]);
    // c1 ist weg — c2 steht jetzt auf dessen Platz und ist dran.
    expect(store.getState().selectedId).toBe("c2");
  });

  // Ein Server vor der Aufteilung sendet nur acceptedByMe.
  it("falls back to acceptedByMe from an older server", async () => {
    const store = createGuardianStore(fakeApi(["c1"], {
      getChanges: vi.fn(async () => ({ toRate: [], acceptedByMe: [ch("c1")], badge: 0 })),
    }));
    await store.getState().refresh();
    expect(store.getState().ratedByMe.map(c => c.id)).toEqual(["c1"]);
    expect(store.getState().selectedId).toBe("c1");
  });

  it("selects the remaining rated entry when nothing is left to rate", async () => {
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

// Der Verlauf zeigt auch Änderungen, die alle Hüter akzeptiert haben. Die stehen
// in keiner der beiden Arbeitslisten mehr und müssen einzeln nachgeladen werden —
// sonst blieb die Auswahl auf der ersten offenen Änderung hängen.
describe("aus dem Verlauf geöffnete Änderung", () => {
  it("loads a change that is in neither list", async () => {
    const api = fakeApi(["c1", "c2", "c3"], {}, ["c3"]);
    const store = createGuardianStore(api);
    await store.getState().refresh();
    expect(store.getState().toRate.map(c => c.id)).toEqual(["c1", "c2"]);

    await store.getState().select("c3");
    expect(api.getChange).toHaveBeenCalledWith("c3");
    expect(store.getState().selectedId).toBe("c3");
    expect(store.getState().fromHistory?.id).toBe("c3");
  });

  it("keeps that selection across a refresh", async () => {
    const api = fakeApi(["c1", "c2", "c3"], {}, ["c3"]);
    const store = createGuardianStore(api);
    await store.getState().refresh();
    await store.getState().select("c3");
    await store.getState().refresh();
    expect(store.getState().selectedId).toBe("c3");
    expect(store.getState().fromHistory?.id).toBe("c3");
  });

  it("does not load again when the change is in a list", async () => {
    const api = fakeApi(["c1", "c2"]);
    const store = createGuardianStore(api);
    await store.getState().refresh();
    await store.getState().select("c2");
    expect(api.getChange).not.toHaveBeenCalled();
    expect(store.getState().fromHistory).toBeNull();
  });

  it("drops it again once a normal list entry is selected", async () => {
    const api = fakeApi(["c1", "c2", "c3"], {}, ["c3"]);
    const store = createGuardianStore(api);
    await store.getState().refresh();
    await store.getState().select("c3");
    await store.getState().select("c1");
    expect(store.getState().selectedId).toBe("c1");
    expect(store.getState().fromHistory).toBeNull();
  });

  // "Neu bewerten" holt die Änderung zurück ins Team. Danach steht sie in der
  // Liste — die Auswahl bleibt aber auf ihr, denn ihretwegen ist man hier.
  it("keeps the selection when it is re-opened by a vote", async () => {
    const api = fakeApi(["c1", "c2", "c3"], {}, ["c3"]);
    const store = createGuardianStore(api);
    await store.getState().refresh();
    await store.getState().select("c3");
    await store.getState().castVote("c3", "offen", "");
    expect(store.getState().toRate.map(c => c.id)).toContain("c3");
    expect(store.getState().selectedId).toBe("c3");
    expect(store.getState().fromHistory).toBeNull();
  });

  // Lieber nichts tun als eine fremde Änderung zeigen, die aussieht wie die
  // angeklickte.
  it("leaves the selection alone when the change cannot be loaded", async () => {
    const api = fakeApi(["c1", "c2"], { getChange: vi.fn(async () => { throw new Error("weg"); }) });
    const store = createGuardianStore(api);
    await store.getState().refresh();
    await store.getState().select("c9");
    expect(store.getState().selectedId).toBe("c1");
    expect(store.getState().fromHistory).toBeNull();
  });
});
