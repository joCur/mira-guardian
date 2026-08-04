import { describe, it, expect, vi } from "vitest";
import { createGuardianStore } from "../src/renderer/store.js";
import type { ChangeWithVotes } from "@guardian/shared";

function ch(id: string, over: Partial<ChangeWithVotes> = {}): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: `memory-bank/${id}.md`, changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "o", newMd: "n", previousPath: null, baselineCommitId: null, cycleId: "cy", firstSeenAt: "t",
    votes: [], adoLink: "http://x", ...over };
}

function fakeApi(ids = ["c1", "c2", "c3"], over: Partial<any> = {}, alleAkzeptiert: string[] = []) {
  // Gemeinsamer Zustand, damit ein refresh() nach vote() die Bewertung sieht —
  // wie beim Server, wo beide Endpunkte auf denselben Store gehen.
  const changes = new Map<string, ChangeWithVotes>(ids.map(id => [id, ch(id)]));
  const fertig = new Set(alleAkzeptiert);
  for (const id of fertig) {
    changes.set(id, ch(id, { votes: [{ changeId: id, guardianId: "g1", status: "akzeptiert", comment: null, updatedAt: "t", seenAt: null }] }));
  }
  const mine = (c: ChangeWithVotes) => c.votes.find(v => v.guardianId === "g1")?.status;
  return {
    getChanges: vi.fn(async () => {
      // Wie der Server: was alle Hüter akzeptiert haben, verlässt beide Listen.
      const all = [...changes.values()].filter(c => !fertig.has(c.id));
      const toRate = all.filter(c => mine(c) !== "akzeptiert");
      const acceptedByMe = all.filter(c => mine(c) === "akzeptiert");
      return { toRate, acceptedByMe, badge: toRate.filter(c => !mine(c)).length };
    }),
    getChange: vi.fn(async (id: string) => {
      const c = changes.get(id);
      if (!c) throw new Error("unbekannt");
      return c;
    }),
    vote: vi.fn(async (id: string, status: string, comment: string) => {
      // Eine eigene Bewertung öffnet die Änderung wieder für das Team.
      fertig.delete(id);
      const updated = ch(id, { votes: [{ changeId: id, guardianId: "g1", status: status as any, comment: comment || null, updatedAt: "t", seenAt: null }] });
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

describe("guardian store — ohne mich Entschiedenes", () => {
  const nachzulesen = ch("n1", {
    votes: [{ changeId: "n1", guardianId: "g1", status: "uebersprungen", comment: null, updatedAt: "t", seenAt: null }],
  });

  /** Ein Server, der eine Leseliste liefert und Abgehaktes daraus entfernt. */
  function apiMitLeseliste() {
    let leseliste = [nachzulesen];
    return {
      getChanges: vi.fn(async () => ({
        toRate: [ch("c1")], acceptedByMe: [], decidedWithoutMe: leseliste, badge: 1,
      })),
      getChange: vi.fn(async (id: string) => ch(id)),
      markSeen: vi.fn(async (ids: string[]) => {
        leseliste = leseliste.filter(c => !ids.includes(c.id));
        return { ok: true as const };
      }),
      vote: vi.fn(async (id: string) => {
        // Ein Einspruch macht die Änderung wieder zur Aufgabe.
        leseliste = leseliste.filter(c => c.id !== id);
        return ch(id);
      }),
    } as any;
  }

  it("lädt die Leseliste, wählt aber weiter die Arbeitsliste vor", async () => {
    const store = createGuardianStore(apiMitLeseliste());
    await store.getState().refresh();
    expect(store.getState().decidedWithoutMe.map(c => c.id)).toEqual(["n1"]);
    expect(store.getState().selectedId).toBe("c1");
  });

  it("ein älterer Server ohne das Feld führt zu einer leeren Liste", async () => {
    const store = createGuardianStore(fakeApi());
    await store.getState().refresh();
    expect(store.getState().decidedWithoutMe).toEqual([]);
  });

  it("abhaken nimmt den Eintrag aus der Liste", async () => {
    const api = apiMitLeseliste();
    const store = createGuardianStore(api);
    await store.getState().refresh();
    await store.getState().markSeen(["n1"]);
    expect(api.markSeen).toHaveBeenCalledWith(["n1"]);
    expect(store.getState().decidedWithoutMe).toEqual([]);
  });

  it("abhaken ohne Ids spart den Aufruf", async () => {
    const api = apiMitLeseliste();
    const store = createGuardianStore(api);
    await store.getState().markSeen([]);
    expect(api.markSeen).not.toHaveBeenCalled();
  });

  // Wie beim Verlauf: man ist wegen dieser einen Änderung hier, nicht zum
  // Abarbeiten der Liste — die Auswahl darf nicht wegspringen.
  it("nach einem Einspruch bleibt die Auswahl stehen", async () => {
    const store = createGuardianStore(apiMitLeseliste());
    await store.getState().refresh();
    await store.getState().select("n1");
    await store.getState().castVote("n1", "klaerung", "so nicht");
    expect(store.getState().selectedId).toBe("n1");
  });
});
