import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import type { Change } from "@guardian/shared";

function change(over: Partial<Change>): Change {
  return {
    id: "c1", repo: "R", branch: "main", filePath: "docs/decisions/a.md", changeKind: "add",
    commitId: "abc1234", commitShort: "abc1234", authorName: "A", authorEmail: "a@x.de",
    committedAt: "2026-07-20T10:00:00Z", summary: "s", oldMd: null, newMd: "x",
    previousPath: null, baselineCommitId: null, previousNewMd: null, commitCount: 1, cycleId: "cy1", firstSeenAt: "2026-07-20T10:00:00Z", ...over,
  };
}

describe("ChangeService — zyklusfreie Listen", () => {
  let s: Store, svc: ChangeService;
  beforeEach(() => {
    s = new Store(":memory:");
    svc = new ChangeService(s);
    s.insertCycle({ id: "cy1", isoWeek: "2026-W30", startsAt: "t", endsAt: null, closedAt: null, note: null });
    s.insertCycle({ id: "cy2", isoWeek: "2026-W31", startsAt: "t", endsAt: null, closedAt: null, note: null });
    s.insertGuardian({ id: "g1", name: "A", email: "a@x.de", initials: "A", avatarColor: "#fff", createdAt: "t", isFounder: true });
    s.insertGuardian({ id: "g2", name: "B", email: "b@x.de", initials: "B", avatarColor: "#fff", createdAt: "t", isFounder: false });
  });

  const add = (id: string, cycleId: string, path: string) => {
    s.upsertChange(change({ id, cycleId, filePath: path }));
    svc.ensureVotesForChange(id, "t");
  };
  const vote = (changeId: string, guardianId: string, status: "akzeptiert" | "abgelehnt" | "klaerung") =>
    s.upsertVote({ changeId, guardianId, status, comment: status === "akzeptiert" ? null : "weil", updatedAt: "t" });

  it("toRate spans cycles and excludes what I accepted", () => {
    add("c1", "cy1", "docs/decisions/a.md");
    add("c2", "cy2", "docs/decisions/b.md");
    vote("c1", "g1", "akzeptiert");
    expect(svc.toRate("g1").map(c => c.id)).toEqual(["c2"]);
  });

  // Ein Einwand ist eine Bewertung: ein zweites Mal bewerten muss ich nicht.
  it("toRate drops changes I rejected or flagged for discussion", () => {
    add("c1", "cy1", "docs/decisions/a.md");
    add("c2", "cy2", "docs/decisions/b.md");
    vote("c1", "g1", "abgelehnt");
    vote("c2", "g1", "klaerung");
    expect(svc.toRate("g1")).toHaveLength(0);
    expect(svc.ratedByMe("g1").map(c => c.id)).toEqual(["c1", "c2"]);
    // Für die anderen Hüter ist beides weiterhin zu bewerten.
    expect(svc.toRate("g2").map(c => c.id)).toEqual(["c1", "c2"]);
  });

  it("toRate drops changes everyone accepted", () => {
    add("c1", "cy1", "docs/decisions/a.md");
    vote("c1", "g1", "akzeptiert");
    vote("c1", "g2", "akzeptiert");
    expect(svc.toRate("g1")).toHaveLength(0);
    expect(svc.ratedByMe("g1")).toHaveLength(0);
  });

  it("ratedByMe holds what I rated while others are pending", () => {
    add("c1", "cy1", "docs/decisions/a.md");
    vote("c1", "g1", "akzeptiert");
    expect(svc.ratedByMe("g1").map(c => c.id)).toEqual(["c1"]);
    expect(svc.ratedByMe("g2")).toHaveLength(0);
  });

  // Nicht worst-first wie die Arbeitsliste: hier zählt, wann ich Stellung
  // genommen habe. Sonst wirkt die Reihenfolge beliebig, weil das Urteil der
  // anderen und das Commit-Datum sie bestimmen.
  it("ratedByMe sorts by when I rated, newest first", () => {
    add("c1", "cy1", "docs/decisions/a.md");
    add("c2", "cy2", "docs/decisions/b.md");
    add("c3", "cy1", "docs/decisions/c.md");
    // Umgekehrte Reihenfolge zu worst-first: c1 wäre dort wegen "abgelehnt" oben.
    s.upsertVote({ changeId: "c1", guardianId: "g1", status: "abgelehnt", comment: "nein", updatedAt: "2026-07-20T10:00:00Z" });
    s.upsertVote({ changeId: "c2", guardianId: "g1", status: "akzeptiert", comment: null, updatedAt: "2026-07-22T10:00:00Z" });
    s.upsertVote({ changeId: "c3", guardianId: "g1", status: "klaerung", comment: "hm", updatedAt: "2026-07-21T10:00:00Z" });
    expect(svc.ratedByMe("g1").map(c => c.id)).toEqual(["c2", "c3", "c1"]);
  });

  // "Neu bewerten" holt die Änderung zurück in die Arbeitsliste.
  it("toRate takes a change back once I reset my vote to pending", () => {
    add("c1", "cy1", "docs/decisions/a.md");
    vote("c1", "g1", "klaerung");
    s.upsertVote({ changeId: "c1", guardianId: "g1", status: "offen", comment: null, updatedAt: "t" });
    expect(svc.toRate("g1").map(c => c.id)).toEqual(["c1"]);
    expect(svc.ratedByMe("g1")).toHaveLength(0);
  });

  it("openChanges sorts worst-first across cycles", () => {
    add("c1", "cy1", "docs/decisions/a.md");   // offen
    add("c2", "cy2", "docs/decisions/b.md");
    vote("c2", "g1", "abgelehnt");             // abgelehnt → zuerst
    add("c3", "cy1", "docs/decisions/c.md");
    vote("c3", "g1", "klaerung");              // klaerung → zweitens
    expect(svc.openChanges().map(c => c.id)).toEqual(["c2", "c3", "c1"]);
  });

  it("meetingChanges holds only real discussion items, not pending ones", () => {
    add("c1", "cy1", "docs/decisions/a.md");   // nur ausstehend → kein Streitfall
    add("c2", "cy2", "docs/decisions/b.md");
    vote("c2", "g1", "abgelehnt");
    add("c3", "cy1", "docs/decisions/c.md");
    vote("c3", "g1", "klaerung");
    expect(svc.meetingChanges().map(c => c.id)).toEqual(["c2", "c3"]);
    // Der Zähler kennt die Ausstehenden weiterhin — als Hinweis fürs Team.
    expect(svc.meetingCounts()).toEqual({ abgelehnt: 1, klaerung: 1, offen: 1, offenBeiMir: 0, gesamt: 3 });
  });

  // Der teamweite Zähler sah aus wie eine eigene Aufgabe: er bleibt stehen, bis
  // auch die anderen Hüter bestätigt haben, während der Tab „Änderungen“ längst
  // leer ist. offenBeiMir trennt beides.
  it("meetingCounts separates what waits on me from what waits on the others", () => {
    add("c1", "cy1", "docs/decisions/a.md");
    add("c2", "cy2", "docs/decisions/b.md");
    vote("c1", "g1", "akzeptiert");   // ich bin durch, g2 fehlt noch
    expect(svc.toRate("g1").map(c => c.id)).toEqual(["c2"]);
    expect(svc.meetingCounts("g1")).toMatchObject({ offen: 2, offenBeiMir: 1 });
    // Alles von mir bewertet: der Zähler bleibt bei 2, für mich ist nichts zu tun.
    vote("c2", "g1", "akzeptiert");
    expect(svc.toRate("g1")).toHaveLength(0);
    expect(svc.meetingCounts("g1")).toMatchObject({ offen: 2, offenBeiMir: 0 });
    // Für g2 warten beide weiterhin auf ihn selbst.
    expect(svc.meetingCounts("g2")).toMatchObject({ offen: 2, offenBeiMir: 2 });
  });

  // Ein Streitfall wartet im Meeting, nicht auf meine Bewertung — er darf den
  // Hinweis über der Liste nicht mitzählen.
  it("meetingCounts leaves rejected and flagged changes out of offenBeiMir", () => {
    add("c1", "cy1", "docs/decisions/a.md");
    vote("c1", "g2", "abgelehnt");   // ich habe noch nichts gesagt, trotzdem kein Hinweisfall
    expect(svc.meetingCounts("g1")).toMatchObject({ abgelehnt: 1, offen: 0, offenBeiMir: 0 });
  });

  it("badgeCount counts my pending votes across cycles", () => {
    add("c1", "cy1", "docs/decisions/a.md");
    add("c2", "cy2", "docs/decisions/b.md");
    vote("c1", "g1", "akzeptiert");
    expect(svc.badgeCount("g1")).toBe(1);
  });
});

describe("Store — Änderung je Repo/Branch/Pfad", () => {
  let s: Store;
  beforeEach(() => {
    s = new Store(":memory:");
    s.insertCycle({ id: "cy1", isoWeek: "2026-W30", startsAt: "t", endsAt: null, closedAt: null, note: null });
    s.insertGuardian({ id: "g1", name: "A", email: "a@x.de", initials: "A", avatarColor: "#fff", createdAt: "t", isFounder: true });
  });

  it("finds a change by repo, branch and path regardless of cycle", () => {
    s.upsertChange(change({ id: "c1", cycleId: "cy1", filePath: "docs/decisions/a.md" }));
    expect(s.getChangeByPath("R", "main", "docs/decisions/a.md")?.id).toBe("c1");
    expect(s.getChangeByPath("R", "other", "docs/decisions/a.md")).toBeUndefined();
    expect(s.getChangeByPath("R", "main", "docs/decisions/zzz.md")).toBeUndefined();
  });

  it("lists my votes newest first with the change attached", () => {
    s.upsertChange(change({ id: "c1", filePath: "docs/decisions/a.md" }));
    s.upsertChange(change({ id: "c2", filePath: "docs/decisions/b.md" }));
    s.upsertVote({ changeId: "c1", guardianId: "g1", status: "akzeptiert", comment: null, updatedAt: "2026-07-20T10:00:00Z" });
    s.upsertVote({ changeId: "c2", guardianId: "g1", status: "abgelehnt", comment: "nein", updatedAt: "2026-07-21T10:00:00Z" });
    s.upsertVote({ changeId: "c1", guardianId: "g1", status: "akzeptiert", comment: null, updatedAt: "2026-07-20T10:00:00Z" });

    const h = s.listVotesByGuardian("g1");
    expect(h.map(e => e.change.filePath)).toEqual(["docs/decisions/b.md", "docs/decisions/a.md"]);
    expect(h[0].status).toBe("abgelehnt");
    expect(h[0].comment).toBe("nein");
  });

  it("omits pending votes from my history", () => {
    s.upsertChange(change({ id: "c1" }));
    s.upsertVote({ changeId: "c1", guardianId: "g1", status: "offen", comment: null, updatedAt: "t" });
    expect(s.listVotesByGuardian("g1")).toHaveLength(0);
  });
});
