import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import { AdoPoller } from "../src/ado/adoPoller.js";
import { loadConfig } from "../src/config.js";
import type { AdoClient, AdoCommit, AdoFileChange } from "../src/ado/adoClient.js";

const cfg = loadConfig({
  ADO_BASE_URL: "https://ado.x", ADO_COLLECTION: "C", ADO_PROJECT: "P", ADO_REPO: "R",
  ADO_PAT: "s", SCAN_PATHS: "docs/decisions,memory-bank",
} as any);

class FakeAdo {
  commits: AdoCommit[] = [];
  changesByCommit: Record<string, AdoFileChange[]> = {};
  contentByCommit: Record<string, Record<string, string | null>> = {};
  async listCommits() { return this.commits; }
  async listCommitChanges(id: string) { return this.changesByCommit[id] ?? []; }
  async getItemContent(path: string, id: string) { return this.contentByCommit[id]?.[path] ?? null; }
}

let clock = 0; const now = () => `t${clock++}`;

describe("AdoPoller", () => {
  let s: Store, svc: ChangeService, ado: FakeAdo, poller: AdoPoller;
  beforeEach(() => {
    clock = 0;
    s = new Store(":memory:"); svc = new ChangeService(s); ado = new FakeAdo();
    s.insertCycle({ id: "cy1", isoWeek: "2026-W30", startsAt: "t", endsAt: null, closedAt: null, note: null });
    s.insertGuardian({ id: "g1", name: "A", email: "a@x.de", initials: "A", avatarColor: "#fff", createdAt: "t", isFounder: true });
    poller = new AdoPoller(cfg, s, svc, ado as unknown as AdoClient, now);
  });

  it("creates one change per matching file with add semantics and offen votes", async () => {
    ado.commits = [{ commitId: "c1", comment: "Neue Decision\n\nDetails", author: { name: "Anna", email: "a@x.de", date: "2026-07-19T10:00:00Z" } }];
    ado.changesByCommit["c1"] = [
      { path: "docs/decisions/adr-013.md", changeType: "add" },
      { path: "README.md", changeType: "edit" },
    ];
    ado.contentByCommit["c1"] = { "docs/decisions/adr-013.md": "# ADR-013" };
    const ids = await poller.pollOnce();
    expect(ids).toHaveLength(1);
    const changes = s.listChangesByCycle("cy1");
    expect(changes).toHaveLength(1);
    expect(changes[0].filePath).toBe("docs/decisions/adr-013.md");
    expect(changes[0].changeKind).toBe("add");
    expect(changes[0].oldMd).toBeNull();
    expect(changes[0].newMd).toBe("# ADR-013");
    expect(changes[0].summary).toBe("Neue Decision");
    expect(s.listVotesByChange(changes[0].id)[0].status).toBe("offen");
    expect(s.getLastSeenCommit("R", "main")).toBe("c1");
  });

  it("skips commits at or before last seen", async () => {
    s.setLastSeenCommit("R", "main", "c1");
    ado.commits = [{ commitId: "c1", comment: "old", author: { name: "A", email: "a@x.de", date: "t" } }];
    expect(await poller.pollOnce()).toHaveLength(0);
  });

  it("re-review: a second change to the same file resets votes", async () => {
    ado.commits = [{ commitId: "c1", comment: "v1", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [{ path: "memory-bank/a.md", changeType: "add" }];
    ado.contentByCommit["c1"] = { "memory-bank/a.md": "v1" };
    await poller.pollOnce();
    const id = s.listChangesByCycle("cy1")[0].id;
    s.upsertVote({ changeId: id, guardianId: "g1", status: "akzeptiert", comment: null, updatedAt: "t" });

    ado.commits = [
      { commitId: "c2", comment: "v2", author: { name: "A", email: "a@x.de", date: "t" } },
      { commitId: "c1", comment: "v1", author: { name: "A", email: "a@x.de", date: "t" } },
    ];
    ado.changesByCommit["c2"] = [{ path: "memory-bank/a.md", changeType: "edit" }];
    ado.contentByCommit["c2"] = { "memory-bank/a.md": "v2" };
    await poller.pollOnce();
    const after = s.listChangesByCycle("cy1");
    expect(after).toHaveLength(1);
    expect(after[0].newMd).toBe("v2");
    expect(s.listVotesByChange(after[0].id)[0].status).toBe("offen"); // reset
  });

  it("reopens a cycle when the current one was closed and a new matching change arrives", async () => {
    ado.commits = [{ commitId: "c1", comment: "v1", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [{ path: "memory-bank/a.md", changeType: "add" }];
    ado.contentByCommit["c1"] = { "memory-bank/a.md": "v1" };
    await poller.pollOnce();
    expect(s.getOpenCycle()?.id).toBe("cy1");

    s.closeCycle("cy1", "t-close", null);
    expect(s.getOpenCycle()).toBeUndefined();

    ado.commits = [
      { commitId: "c2", comment: "v2", author: { name: "A", email: "a@x.de", date: "t" } },
      { commitId: "c1", comment: "v1", author: { name: "A", email: "a@x.de", date: "t" } },
    ];
    ado.changesByCommit["c2"] = [{ path: "memory-bank/b.md", changeType: "add" }];
    ado.contentByCommit["c2"] = { "memory-bank/b.md": "v2" };
    await poller.pollOnce();

    const reopened = s.getOpenCycle();
    expect(reopened).toBeDefined();
    expect(reopened!.id).not.toBe("cy1");
    const changes = s.listChangesByCycle(reopened!.id);
    expect(changes).toHaveLength(1);
    expect(changes[0].filePath).toBe("memory-bank/b.md");
    expect(s.listVotesByChange(changes[0].id)[0].status).toBe("offen");
  });

  it("does not open a cycle when fresh commits touch no scanned paths, even if closed", async () => {
    s.closeCycle("cy1", "t-close", null);
    ado.commits = [{ commitId: "c1", comment: "irrelevant", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [{ path: "README.md", changeType: "edit" }];
    const ids = await poller.pollOnce();
    expect(ids).toHaveLength(0);
    expect(s.getOpenCycle()).toBeUndefined();
  });

  it("matches scan paths on app level (Memory-Bank-Levels), not only repo root", async () => {
    ado.commits = [{ commitId: "c1", comment: "App-Level Decision", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [{ path: "apps/mira-desktop/docs/decisions/2026-07-23-adr.md", changeType: "add" }];
    ado.contentByCommit["c1"] = { "apps/mira-desktop/docs/decisions/2026-07-23-adr.md": "# ADR" };
    const ids = await poller.pollOnce();
    expect(ids).toHaveLength(1);
    const changes = s.listChangesByCycle("cy1");
    expect(changes.map(c => c.filePath)).toEqual(["apps/mira-desktop/docs/decisions/2026-07-23-adr.md"]);
  });

  it("does not match scan paths outside segment boundaries", async () => {
    ado.commits = [{ commitId: "c1", comment: "kein Match", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [
      { path: "docs/decisions-archive/alt.md", changeType: "add" },
      { path: "apps/x/mydocs/decisions/foo.md", changeType: "add" },
    ];
    expect(await poller.pollOnce()).toHaveLength(0);
  });

  it("re-scanning the same commit is idempotent: no vote reset, no broadcast", async () => {
    const events: Array<{ id: string; isNew: boolean }> = [];
    const p = new AdoPoller(cfg, s, svc, ado as unknown as AdoClient, now,
      (changeId, isNew) => events.push({ id: changeId, isNew }));
    ado.commits = [{ commitId: "c1", comment: "v1", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [{ path: "memory-bank/a.md", changeType: "add" }];
    ado.contentByCommit["c1"] = { "memory-bank/a.md": "v1" };
    await p.pollOnce();
    expect(events).toHaveLength(1);
    const id = s.listChangesByCycle("cy1")[0].id;
    s.upsertVote({ changeId: id, guardianId: "g1", status: "akzeptiert", comment: null, updatedAt: "t" });

    // Cursor-Rewind simulieren: derselbe Commit gilt wieder als "frisch".
    s.setLastSeenCommit("R", "main", "c0");
    const touched = await p.pollOnce();
    expect(touched).toHaveLength(0);
    expect(events).toHaveLength(1); // kein zweiter Broadcast
    expect(s.listVotesByChange(id)[0].status).toBe("akzeptiert"); // kein Reset
    expect(s.getLastSeenCommit("R", "main")).toBe("c1"); // Cursor trotzdem vorgezogen
  });

  it("re-scan over a closed cycle does not reopen it", async () => {
    ado.commits = [{ commitId: "c1", comment: "v1", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [{ path: "memory-bank/a.md", changeType: "add" }];
    ado.contentByCommit["c1"] = { "memory-bank/a.md": "v1" };
    await poller.pollOnce();
    s.closeCycle("cy1", "t-close", null);
    s.setLastSeenCommit("R", "main", "c0"); // Cursor-Rewind über den Zyklus-Schluss
    expect(await poller.pollOnce()).toHaveLength(0);
    expect(s.getOpenCycle()).toBeUndefined(); // kein Reopen durch alte Commits
    expect(s.getLastSeenCommit("R", "main")).toBe("c1");
  });

  it("first poll without cursor backfills only the last BACKFILL_DAYS days", async () => {
    const isoNow = () => "2026-07-21T12:00:00.000Z";
    const p = new AdoPoller(cfg, s, svc, ado as unknown as AdoClient, isoNow);
    ado.commits = [
      { commitId: "young", comment: "frisch", author: { name: "A", email: "a@x.de", date: "2026-07-19T10:00:00Z" } },
      { commitId: "old", comment: "uralt", author: { name: "A", email: "a@x.de", date: "2026-07-01T10:00:00Z" } },
    ];
    ado.changesByCommit["young"] = [{ path: "memory-bank/a.md", changeType: "add" }];
    ado.changesByCommit["old"] = [{ path: "memory-bank/b.md", changeType: "add" }];
    ado.contentByCommit["young"] = { "memory-bank/a.md": "A" };
    ado.contentByCommit["old"] = { "memory-bank/b.md": "B" };

    const ids = await p.pollOnce();
    expect(ids).toHaveLength(1);
    const changes = s.listChangesByCycle(s.getOpenCycle()!.id);
    expect(changes.map(c => c.filePath)).toEqual(["memory-bank/a.md"]);
    expect(s.getLastSeenCommit("R", "main")).toBe("young");
  });
});
