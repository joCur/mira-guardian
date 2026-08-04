import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import type { Change, VoteStatus } from "@guardian/shared";

const HEUTE = "2026-08-15T09:00:00.000Z";
const URLAUB = { from: "2026-08-10", until: "2026-08-20" };

function change(id: string, path: string): Change {
  return {
    id, repo: "R", branch: "main", filePath: path, changeKind: "modify",
    commitId: "abc1234", commitShort: "abc1234", authorName: "A", authorEmail: "a@x.de",
    committedAt: HEUTE, summary: "s", oldMd: "alt", newMd: "neu",
    previousPath: null, baselineCommitId: null, cycleId: "cy1", firstSeenAt: HEUTE,
  };
}

describe("Abwesenheit — Quorum der Anwesenden", () => {
  let s: Store, svc: ChangeService;

  beforeEach(() => {
    s = new Store(":memory:");
    svc = new ChangeService(s, () => HEUTE);
    s.insertCycle({ id: "cy1", isoWeek: "2026-W33", startsAt: "t", endsAt: null, closedAt: null, note: null });
    for (const id of ["g1", "g2", "g3"]) {
      s.insertGuardian({ id, name: id, email: `${id}@x.de`, initials: id, avatarColor: "#fff",
        createdAt: "t", isFounder: id === "g1" });
    }
  });

  const add = (id: string, path = `docs/decisions/${id}.md`) => {
    s.upsertChange(change(id, path));
    svc.ensureVotesForChange(id, "t");
  };
  const vote = (changeId: string, guardianId: string, status: VoteStatus) =>
    s.upsertVote({ changeId, guardianId, status,
      comment: status === "klaerung" || status === "abgelehnt" ? "weil" : null, updatedAt: "t" });
  const statusOf = (changeId: string, guardianId: string) =>
    s.listVotesByChange(changeId).find(v => v.guardianId === guardianId)?.status;

  it("die Anwesenden schließen ab, die offene Stimme wird übersprungen", () => {
    add("c1");
    s.setAbsence("g3", URLAUB.from, URLAUB.until);
    vote("c1", "g1", "akzeptiert");
    vote("c1", "g2", "akzeptiert");

    expect(svc.settle("c1", HEUTE)).toBe(true);
    expect(statusOf("c1", "g3")).toBe("uebersprungen");
    expect(svc.isSettled("c1")).toBe(true);
    expect(svc.openChanges().map(c => c.id)).toEqual([]);
  });

  it("solange ein Anwesender nicht akzeptiert hat, passiert nichts", () => {
    add("c1");
    s.setAbsence("g3", URLAUB.from, URLAUB.until);
    vote("c1", "g1", "akzeptiert");

    expect(svc.settle("c1", HEUTE)).toBe(false);
    expect(statusOf("c1", "g3")).toBe("offen");
    expect(svc.isSettled("c1")).toBe(false);
  });

  // Der Kern der Regel: nur offene Stimmen werden übersprungen. Sonst ließe
  // sich ein Einspruch durch Urlaub wegräumen.
  it("ein Einspruch des Abwesenden überlebt den Urlaub", () => {
    for (const [id, status] of [["c1", "abgelehnt"], ["c2", "klaerung"]] as const) {
      add(id);
      vote(id, "g3", status);
      vote(id, "g1", "akzeptiert");
      vote(id, "g2", "akzeptiert");
    }
    s.setAbsence("g3", URLAUB.from, URLAUB.until);

    expect(svc.settle("c1", HEUTE)).toBe(false);
    expect(svc.settle("c2", HEUTE)).toBe(false);
    expect(statusOf("c1", "g3")).toBe("abgelehnt");
    expect(statusOf("c2", "g3")).toBe("klaerung");
    expect(svc.openChanges().map(c => c.id).sort()).toEqual(["c1", "c2"]);
  });

  it("greift die Untergrenze, bleibt es bei der Bestätigung aller", () => {
    add("c1");
    s.setAbsence("g2", URLAUB.from, URLAUB.until);
    s.setAbsence("g3", URLAUB.from, URLAUB.until);
    vote("c1", "g1", "akzeptiert");

    expect(svc.settle("c1", HEUTE)).toBe(false);
    expect(svc.isSettled("c1")).toBe(false);
  });

  it("ohne Abwesenheit ändert settle nichts", () => {
    add("c1");
    vote("c1", "g1", "akzeptiert");
    vote("c1", "g2", "akzeptiert");
    expect(svc.settle("c1", HEUTE)).toBe(false);
    expect(statusOf("c1", "g3")).toBe("offen");
  });

  /**
   * Der Regressionstest zur Kernentscheidung: der Abschluss ist am Vote
   * festgeschrieben, nicht am Kalender abgelesen. Sonst fiele der ganze
   * Bestand mit dem Ende der Abwesenheit in die Arbeitslisten zurück.
   */
  it("nach der Rückkehr bleibt Abgeschlossenes abgeschlossen", () => {
    add("c1");
    s.setAbsence("g3", URLAUB.from, URLAUB.until);
    vote("c1", "g1", "akzeptiert");
    vote("c1", "g2", "akzeptiert");
    svc.settle("c1", HEUTE);

    // Zeitsprung hinter das Urlaubsende — die Abwesenheit gilt nicht mehr.
    const nachher = new ChangeService(s, () => "2026-09-01T09:00:00.000Z");
    expect(nachher.istAbwesend("g3")).toBe(false);
    expect(nachher.isSettled("c1")).toBe(true);
    expect(nachher.openChanges().map(c => c.id)).toEqual([]);
    expect(nachher.toRate("g3").map(c => c.id)).toEqual([]);
    expect(nachher.badgeCount("g3")).toBe(0);
  });

  it("settleAll schließt den ganzen Bestand ab, wenn eine Abwesenheit dazukommt", () => {
    add("c1"); add("c2"); add("c3");
    for (const id of ["c1", "c2"]) { vote(id, "g1", "akzeptiert"); vote(id, "g2", "akzeptiert"); }
    vote("c3", "g1", "akzeptiert"); // c3 fehlt noch g2

    s.setAbsence("g3", URLAUB.from, URLAUB.until);
    expect(svc.settleAll(HEUTE)).toBe(2);
    expect(svc.openChanges().map(c => c.id)).toEqual(["c3"]);
  });

  it("ein zweiter Durchlauf ändert nichts mehr", () => {
    add("c1");
    s.setAbsence("g3", URLAUB.from, URLAUB.until);
    vote("c1", "g1", "akzeptiert");
    vote("c1", "g2", "akzeptiert");
    expect(svc.settleAll(HEUTE)).toBe(1);
    expect(svc.settleAll(HEUTE)).toBe(0);
  });

  it("wer abwesend ist, bekommt keine Zahl aufs Symbol", () => {
    add("c1"); add("c2");
    s.setAbsence("g3", URLAUB.from, URLAUB.until);
    expect(svc.badgeCount("g1")).toBe(2);
    expect(svc.badgeCount("g3")).toBe(0);
  });

  // Übersprungen ist kein Einwand: die Änderung ist durch, nicht "ausstehend".
  it("uebersprungen zählt wie akzeptiert, blockiert also nichts", () => {
    add("c1");
    s.setAbsence("g3", URLAUB.from, URLAUB.until);
    vote("c1", "g1", "akzeptiert");
    vote("c1", "g2", "akzeptiert");
    svc.settle("c1", HEUTE);
    expect(svc.stripeStatus("c1")).toBe("akzeptiert");
    expect(svc.meetingChanges().map(c => c.id)).toEqual([]);
    expect(svc.meetingCounts()).toEqual({ abgelehnt: 0, klaerung: 0, offen: 0, gesamt: 0 });
  });
});

describe("Abwesenheit — Leseliste nach der Rückkehr", () => {
  let s: Store, svc: ChangeService;

  beforeEach(() => {
    s = new Store(":memory:");
    svc = new ChangeService(s, () => HEUTE);
    s.insertCycle({ id: "cy1", isoWeek: "2026-W33", startsAt: "t", endsAt: null, closedAt: null, note: null });
    for (const id of ["g1", "g2", "g3"]) {
      s.insertGuardian({ id, name: id, email: `${id}@x.de`, initials: id, avatarColor: "#fff",
        createdAt: "t", isFounder: id === "g1" });
    }
    s.setAbsence("g3", URLAUB.from, URLAUB.until);
  });

  const uebersprungen = (id: string) => {
    s.upsertChange(change(id, `docs/decisions/${id}.md`));
    svc.ensureVotesForChange(id, "t");
    s.upsertVote({ changeId: id, guardianId: "g1", status: "akzeptiert", comment: null, updatedAt: "t" });
    s.upsertVote({ changeId: id, guardianId: "g2", status: "akzeptiert", comment: null, updatedAt: "t" });
    svc.settle(id, HEUTE);
  };

  it("zeigt, was ohne mich entschieden wurde — und nur mir", () => {
    uebersprungen("c1");
    expect(svc.decidedWithoutMe("g3").map(c => c.id)).toEqual(["c1"]);
    expect(svc.decidedWithoutMe("g1")).toEqual([]);
  });

  it("nachgelesen verlässt die Liste", () => {
    uebersprungen("c1");
    s.markSeen("g3", ["c1"], HEUTE);
    expect(svc.decidedWithoutMe("g3")).toEqual([]);
  });

  it("markSeen fasst nur eigene und nur übersprungene Stimmen an", () => {
    uebersprungen("c1");
    s.markSeen("g1", ["c1"], HEUTE); // g1 hat akzeptiert, nicht übersprungen
    expect(s.listVotesByChange("c1").find(v => v.guardianId === "g1")!.seenAt).toBeNull();
    expect(svc.decidedWithoutMe("g3").map(c => c.id)).toEqual(["c1"]);
  });

  // Wird die Änderung wieder strittig, ist sie eine echte Aufgabe — dann steht
  // sie in der Arbeitsliste und nicht zusätzlich in der Leseliste.
  it("eine wieder strittige Änderung verlässt die Leseliste", () => {
    uebersprungen("c1");
    s.upsertVote({ changeId: "c1", guardianId: "g1", status: "klaerung", comment: "doch nicht", updatedAt: "t" });

    expect(svc.isSettled("c1")).toBe(false);
    expect(svc.decidedWithoutMe("g3")).toEqual([]);
    expect(svc.toRate("g3").map(c => c.id)).toEqual(["c1"]);
  });

  it("ein neuer Commit macht die Änderung wieder offen und ungelesen", () => {
    uebersprungen("c1");
    s.markSeen("g3", ["c1"], HEUTE);

    s.resetVotesForChange("c1", HEUTE);
    const votes = s.listVotesByChange("c1");
    expect(votes.every(v => v.status === "offen")).toBe(true);
    expect(votes.every(v => v.seenAt === null)).toBe(true);
    expect(svc.isSettled("c1")).toBe(false);
  });

  it("eine eigene Stimme löscht den Nachlese-Vermerk", () => {
    uebersprungen("c1");
    s.markSeen("g3", ["c1"], HEUTE);
    s.clearSeen("c1", "g3");
    expect(s.listVotesByChange("c1").find(v => v.guardianId === "g3")!.seenAt).toBeNull();
  });
});

describe("Store-Migration", () => {
  it("zieht die neuen Spalten auf einer Datenbank ohne sie nach", () => {
    // Der Konstruktor legt an und migriert; ein zweiter Lauf auf derselben
    // Datei darf nicht scheitern.
    const s = new Store(":memory:");
    s.insertGuardian({ id: "g1", name: "A", email: "a@x.de", initials: "A", avatarColor: "#fff",
      createdAt: "t", isFounder: true });
    const g = s.getGuardian("g1")!;
    expect(g.absentFrom).toBeNull();
    expect(g.absentUntil).toBeNull();

    s.setAbsence("g1", "2026-08-10", "2026-08-20");
    expect(s.getGuardian("g1")!.absentFrom).toBe("2026-08-10");
    s.setAbsence("g1", null, null);
    expect(s.getGuardian("g1")!.absentUntil).toBeNull();
  });
});
