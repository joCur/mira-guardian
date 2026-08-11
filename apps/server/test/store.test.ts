import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Store } from "../src/db/store.js";
import type { Change, Vote } from "@guardian/shared";

function newStore() { return new Store(":memory:"); }

const change: Change = {
  id: "ch1", repo: "r", branch: "main", filePath: "docs/decisions/adr-013.md",
  changeKind: "add", commitId: "abc123", commitShort: "abc123",
  authorName: "Anna", authorEmail: "a@x.de", committedAt: "2026-07-19T10:00:00Z",
  summary: "Neue Decision", oldMd: null, newMd: "# ADR", previousPath: null, baselineCommitId: null, previousNewMd: null, commitCount: 1, cycleId: "cy1",
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

  // Beim Verschieben behält der Eintrag seine Identität und wechselt den Pfad.
  it("updates an existing change by id, including its path", () => {
    const s = newStore();
    s.insertCycle({ id: "cy1", isoWeek: "2026-W30", startsAt: "x", endsAt: null, closedAt: null, note: null });
    s.upsertChange(change);
    s.upsertChange({ ...change, filePath: "apps/mira-desktop/docs/decisions/adr-013.md",
      previousPath: "docs/decisions/adr-013.md", changeKind: "rename" });
    const rows = s.listChangesByCycle("cy1");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("ch1");
    expect(rows[0].filePath).toBe("apps/mira-desktop/docs/decisions/adr-013.md");
    expect(rows[0].previousPath).toBe("docs/decisions/adr-013.md");
    expect(rows[0].changeKind).toBe("rename");
    expect(s.getChangeByPath("r", "main", "docs/decisions/adr-013.md")).toBeUndefined();
  });

  // Ohne Wochen-Zyklus ist der Pfad die Identität: derselbe Eintrag darf in
  // einem neuen Zyklus fortgeschrieben werden, ohne am Primärschlüssel zu
  // scheitern.
  it("keeps writing the same change when the cycle changed", () => {
    const s = newStore();
    s.insertCycle({ id: "cy1", isoWeek: "2026-W30", startsAt: "x", endsAt: null, closedAt: null, note: null });
    s.insertCycle({ id: "cy2", isoWeek: "2026-W31", startsAt: "y", endsAt: null, closedAt: null, note: null });
    s.upsertChange(change);
    expect(() => s.upsertChange({ ...change, cycleId: "cy2", newMd: "# ADR v2" })).not.toThrow();
    expect(s.getChange("ch1")?.newMd).toBe("# ADR v2");
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

// Der Weg, den jede bereits laufende Instanz beim nächsten Start nimmt:
// schema.sql legt nur an, was fehlt, also muss die neue Spalte nachgezogen
// werden — sonst scheitert jeder Schreibzugriff auf change_item.
describe("Store-Migration auf eine bestehende Datenbank", () => {
  it("adds previous_path to a change_item table that predates it", () => {
    const file = join(mkdtempSync(join(tmpdir(), "guardian-store-")), "alt.sqlite");
    const alt = new Database(file);
    alt.exec(`CREATE TABLE change_item (
      id TEXT PRIMARY KEY, repo TEXT NOT NULL, branch TEXT NOT NULL,
      file_path TEXT NOT NULL, change_kind TEXT NOT NULL,
      commit_id TEXT NOT NULL, commit_short TEXT NOT NULL,
      author_name TEXT NOT NULL, author_email TEXT NOT NULL, committed_at TEXT NOT NULL,
      summary TEXT NOT NULL, old_md TEXT, new_md TEXT,
      cycle_id TEXT NOT NULL, first_seen_at TEXT NOT NULL,
      UNIQUE (cycle_id, file_path)
    )`);
    alt.prepare(`INSERT INTO change_item VALUES
      ('alt1','r','main','memory-bank/a.md','modify','abc','abc','A','a@x.de','t','s',NULL,'# alt','cy1','t')`).run();
    alt.close();

    const s = new Store(file);
    expect(s.getChange("alt1")?.previousPath).toBeNull();
    expect(() => s.upsertChange({ ...change, id: "alt1", filePath: "apps/x/docs/decisions/a.md",
      previousPath: "memory-bank/a.md", changeKind: "rename" })).not.toThrow();
    expect(s.getChange("alt1")?.previousPath).toBe("memory-bank/a.md");
    // Zweiter Start darf nicht an der schon vorhandenen Spalte scheitern.
    expect(() => new Store(file)).not.toThrow();
    rmSync(dirname(file), { recursive: true, force: true });
  });

  // Bestandsdaten fassen womöglich schon mehrere Commits zusammen, ihr
  // Zwischenstand ist aber nicht mehr da. Sie starten deshalb als
  // Ein-Commit-Eintrag statt mit einer Zahl, die keiner Anzeige entspricht.
  it("zählt Einträge ohne Commit-Zähler als einen Commit", () => {
    const file = join(mkdtempSync(join(tmpdir(), "guardian-store-")), "alt.sqlite");
    const alt = new Database(file);
    alt.exec(`CREATE TABLE change_item (
      id TEXT PRIMARY KEY, repo TEXT NOT NULL, branch TEXT NOT NULL,
      file_path TEXT NOT NULL, change_kind TEXT NOT NULL,
      commit_id TEXT NOT NULL, commit_short TEXT NOT NULL,
      author_name TEXT NOT NULL, author_email TEXT NOT NULL, committed_at TEXT NOT NULL,
      summary TEXT NOT NULL, old_md TEXT, new_md TEXT,
      cycle_id TEXT NOT NULL, first_seen_at TEXT NOT NULL,
      UNIQUE (cycle_id, file_path)
    )`);
    alt.prepare(`INSERT INTO change_item VALUES
      ('alt1','r','main','memory-bank/a.md','modify','abc','abc','A','a@x.de','t','s','# alt','# neu','cy1','t')`).run();
    alt.close();

    const s = new Store(file);
    expect(s.getChange("alt1")?.commitCount).toBe(1);
    expect(s.getChange("alt1")?.previousNewMd).toBeNull();
    expect(() => s.upsertChange({ ...change, id: "alt1", previousNewMd: "# alt", commitCount: 2 })).not.toThrow();
    expect(s.getChange("alt1")?.commitCount).toBe(2);
    expect(s.getChange("alt1")?.previousNewMd).toBe("# alt");
    expect(() => new Store(file)).not.toThrow();
    rmSync(dirname(file), { recursive: true, force: true });
  });
});
