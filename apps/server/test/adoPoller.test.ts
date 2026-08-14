import { describe, it, expect, beforeEach, vi } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import { AdoPoller } from "../src/ado/adoPoller.js";
import { loadConfig } from "../src/config.js";
import type { AdoClient, AdoCommit, AdoFileChange } from "../src/ado/adoClient.js";
import type { Change } from "@guardian/shared";

const cfg = loadConfig({
  ADO_BASE_URL: "https://ado.x", ADO_COLLECTION: "C", ADO_PROJECT: "P", ADO_REPO: "R",
  ADO_PAT: "s", SCAN_PATHS: "docs/decisions,memory-bank",
} as any);

class FakeAdo {
  commits: AdoCommit[] = [];
  changesByCommit: Record<string, AdoFileChange[]> = {};
  contentByCommit: Record<string, Record<string, string | null>> = {};
  contentBeforeCommit: Record<string, Record<string, string | null>> = {};
  async listCommits() { return this.commits; }
  async listCommitChanges(id: string) { return this.changesByCommit[id] ?? []; }
  async getItemContent(path: string, id: string) { return this.contentByCommit[id]?.[path] ?? null; }
  async getItemContentBefore(path: string, id: string) { return this.contentBeforeCommit[id]?.[path] ?? null; }
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

  it("nimmt den Stand vor dem Commit als Vergleichsbasis einer Änderung", async () => {
    ado.commits = [{ commitId: "c1", comment: "Auf Englisch übersetzt", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [{ path: "memory-bank/a.md", changeType: "edit" }];
    ado.contentByCommit["c1"] = { "memory-bank/a.md": "English text" };
    ado.contentBeforeCommit["c1"] = { "memory-bank/a.md": "Deutscher Text" };
    await poller.pollOnce();
    const c = s.listChangesByCycle("cy1")[0];
    expect(c.oldMd).toBe("Deutscher Text");
    expect(c.newMd).toBe("English text");
  });

  it("holt für eine Löschung den letzten Stand als Vergleichsbasis", async () => {
    ado.commits = [{ commitId: "c1", comment: "Entfernt", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [{ path: "memory-bank/a.md", changeType: "delete" }];
    ado.contentBeforeCommit["c1"] = { "memory-bank/a.md": "Der gelöschte Inhalt" };
    await poller.pollOnce();
    const c = s.listChangesByCycle("cy1")[0];
    expect(c.changeKind).toBe("delete");
    expect(c.oldMd).toBe("Der gelöschte Inhalt");
    expect(c.newMd).toBeNull();
  });

  it("fragt für eine neu angelegte Datei keinen Vorgängerstand ab", async () => {
    const calls: string[] = [];
    ado.getItemContentBefore = async (path: string) => { calls.push(path); return null; };
    ado.commits = [{ commitId: "c1", comment: "Neu", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [{ path: "memory-bank/a.md", changeType: "add" }];
    ado.contentByCommit["c1"] = { "memory-bank/a.md": "# Neu" };
    await poller.pollOnce();
    expect(calls).toEqual([]);
    expect(s.listChangesByCycle("cy1")[0].oldMd).toBeNull();
  });

  it("behält bei einer Folgeänderung im Review die ursprüngliche Vergleichsbasis", async () => {
    ado.commits = [{ commitId: "c1", comment: "v1", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [{ path: "memory-bank/a.md", changeType: "edit" }];
    ado.contentByCommit["c1"] = { "memory-bank/a.md": "v1" };
    ado.contentBeforeCommit["c1"] = { "memory-bank/a.md": "v0" };
    await poller.pollOnce();

    ado.commits = [
      { commitId: "c2", comment: "v2", author: { name: "A", email: "a@x.de", date: "t" } },
      { commitId: "c1", comment: "v1", author: { name: "A", email: "a@x.de", date: "t" } },
    ];
    ado.changesByCommit["c2"] = [{ path: "memory-bank/a.md", changeType: "edit" }];
    ado.contentByCommit["c2"] = { "memory-bank/a.md": "v2" };
    ado.contentBeforeCommit["c2"] = { "memory-bank/a.md": "v1" };
    await poller.pollOnce();

    const c = s.listChangesByCycle("cy1")[0];
    expect(c.oldMd).toBe("v0"); // kumulativ: Basis bleibt der Stand beim ersten Sichten
    expect(c.newMd).toBe("v2");
  });

  // Gegenstück: Ohne diesen Schnitt wüchse der Diff für immer weiter und jede
  // Folgeänderung zeigte erneut alles seit dem allerersten Sync — dann ist
  // nicht mehr zu erkennen, was sich tatsächlich geändert hat.
  describe("nach vollständiger Annahme", () => {
    const zweiCommits = async (annehmen: () => void) => {
      ado.commits = [{ commitId: "c1", comment: "Übersetzt", author: { name: "A", email: "a@x.de", date: "t" } }];
      ado.changesByCommit["c1"] = [{ path: "memory-bank/a.md", changeType: "edit" }];
      ado.contentByCommit["c1"] = { "memory-bank/a.md": "v1" };
      ado.contentBeforeCommit["c1"] = { "memory-bank/a.md": "v0" };
      await poller.pollOnce();
      annehmen();

      ado.commits = [
        { commitId: "c2", comment: "Kleine Anpassung", author: { name: "A", email: "a@x.de", date: "t" } },
        { commitId: "c1", comment: "Übersetzt", author: { name: "A", email: "a@x.de", date: "t" } },
      ];
      ado.changesByCommit["c2"] = [{ path: "memory-bank/a.md", changeType: "edit" }];
      ado.contentByCommit["c2"] = { "memory-bank/a.md": "v2" };
      ado.contentBeforeCommit["c2"] = { "memory-bank/a.md": "v1" };
      await poller.pollOnce();
    };
    const akzeptiere = (guardianId: string) => () => {
      const c = s.listChangesByCycle("cy1")[0];
      s.upsertVote({ changeId: c.id, guardianId, status: "akzeptiert", comment: null, updatedAt: "t" });
    };

    it("zeigt die Folgeänderung gegen den akzeptierten Stand", async () => {
      await zweiCommits(akzeptiere("g1"));
      const nachher = s.listChangesByCycle("cy1");
      expect(nachher).toHaveLength(1); // derselbe Eintrag, kein zweiter daneben
      expect(nachher[0].oldMd).toBe("v1"); // nicht "v0": die Übersetzung ist durch
      expect(nachher[0].newMd).toBe("v2");
      expect(nachher[0].baselineCommitId).toBe("c2");
      expect(s.listVotesByChange(nachher[0].id)[0].status).toBe("offen");
    });

    it("stellt die Änderung als frisch aufgelaufen zu", async () => {
      let vorher = "";
      await zweiCommits(() => { vorher = s.listChangesByCycle("cy1")[0].firstSeenAt; akzeptiere("g1")(); });
      // Sonst bliebe sie hinter der Wasserlinie des Catch-ups verborgen. Der
      // Tick der Test-Uhr ("t7", "t10") sortiert nicht als Text — anders als
      // die ISO-Zeitstempel im Betrieb, mit denen das Catch-up vergleicht.
      const tick = (s: string) => Number(s.slice(1));
      expect(tick(s.listChangesByCycle("cy1")[0].firstSeenAt)).toBeGreaterThan(tick(vorher));
    });

    it("sammelt weiter, solange ein Hüter noch nicht bewertet hat", async () => {
      s.insertGuardian({ id: "g2", name: "B", email: "b@x.de", initials: "B", avatarColor: "#000", createdAt: "t", isFounder: false });
      await zweiCommits(akzeptiere("g1"));
      expect(s.listChangesByCycle("cy1")[0].oldMd).toBe("v0");
    });

    it("fängt wieder bei einem Commit an", async () => {
      await zweiCommits(akzeptiere("g1"));
      const c = s.listChangesByCycle("cy1")[0];
      expect(c.commitCount).toBe(1);
      expect(c.previousNewMd).toBeNull(); // nichts zusammengefasst, nichts umzuschalten
    });

    // Der Zwischenstand ist das Einzige, womit sich der jüngste Commit für sich
    // allein zeigen lässt — ohne die gemeinsame Basis anzutasten.
    it("hält bei einer Folgeänderung im Review den Stand davor fest", async () => {
      s.insertGuardian({ id: "g2", name: "B", email: "b@x.de", initials: "B", avatarColor: "#000", createdAt: "t", isFounder: false });
      await zweiCommits(akzeptiere("g1"));
      const c = s.listChangesByCycle("cy1")[0];
      expect(c.commitCount).toBe(2);
      expect(c.previousNewMd).toBe("v1");
      expect(c.oldMd).toBe("v0"); // die gemeinsame Basis bleibt, wo sie war
    });
  });

  // Gegenstück zum Test darüber: stehen bleibt nur eine Basis, die es gibt.
  // Fehlt sie, schleppte der Folgecommit sie früher als "fehlt" weiter — der
  // Eintrag zeigte dauerhaft das ganze Dokument statt des Unterschieds, weil
  // upsertChange old_md nur beim Anlegen schreibt.
  it("holt bei einer Folgeänderung die fehlende Vergleichsbasis nach", async () => {
    s.upsertChange({
      id: "ch1", repo: "R", branch: "main", filePath: "memory-bank/a.md", changeKind: "modify",
      commitId: "c1", commitShort: "c1", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
      summary: "v1", oldMd: null, newMd: "v1", previousPath: null,
      baselineCommitId: null, previousNewMd: null, commitCount: 1, cycleId: "cy1", firstSeenAt: "t",
    });
    ado.commits = [{ commitId: "c2", comment: "v2", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c2"] = [{ path: "memory-bank/a.md", changeType: "edit" }];
    ado.contentByCommit["c2"] = { "memory-bank/a.md": "v2" };
    ado.contentBeforeCommit["c2"] = { "memory-bank/a.md": "v1" };
    await poller.pollOnce();

    const c = s.getChange("ch1")!;
    expect(c.oldMd).toBe("v1");
    expect(c.newMd).toBe("v2");
  });

  // Zum Verschiebe-Commit selbst kennt ADO unter dem alten Pfad keinen Stand
  // mehr — die Basis muss deshalb aus dem Eintrag kommen, den wir schon haben.
  it("nimmt nach einem reinen Verschieben den Stand aus dem Verschiebe-Commit als Basis", async () => {
    ado.commits = [{ commitId: "c1", comment: "Verschoben", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [
      { path: "memory-bank/neu.md", changeType: "edit", previousPath: "memory-bank/alt.md", contentUnchanged: true },
    ];
    ado.contentByCommit["c1"] = { "memory-bank/neu.md": "unveränderter Inhalt" };
    await poller.pollOnce();
    expect(s.listChangesByCycle("cy1")[0].changeKind).toBe("rename");

    ado.commits = [
      { commitId: "c2", comment: "Jetzt auch inhaltlich", author: { name: "A", email: "a@x.de", date: "t" } },
      { commitId: "c1", comment: "Verschoben", author: { name: "A", email: "a@x.de", date: "t" } },
    ];
    ado.changesByCommit["c2"] = [{ path: "memory-bank/neu.md", changeType: "edit" }];
    ado.contentByCommit["c2"] = { "memory-bank/neu.md": "jetzt geändert" };
    await poller.pollOnce();

    const c = s.listChangesByCycle("cy1")[0];
    expect(c.changeKind).toBe("modify");
    expect(c.oldMd).toBe("unveränderter Inhalt");
    expect(c.newMd).toBe("jetzt geändert");
  });

  // Bestandsdaten: Einträge, die vor dem Nachziehen der Vergleichsbasis
  // erfasst wurden, haben oldMd = null und sähen für immer aus wie neue
  // Dokumente — upsertChange lässt old_md bei Folgecommits absichtlich stehen.
  describe("ergaenzeFehlendeVergleichsbasen", () => {
    function bestand(over: Partial<Change> = {}): Change {
      return {
        id: "ch1", repo: "R", branch: "main", filePath: "memory-bank/a.md", changeKind: "modify",
        commitId: "c9", commitShort: "c9", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
        summary: "Übersetzt", oldMd: null, newMd: "English text", previousPath: null,
        baselineCommitId: null, previousNewMd: null, commitCount: 1, cycleId: "cy1", firstSeenAt: "t", ...over,
      };
    }

    it("holt die Basis für eine Änderung ohne Vergleichsbasis nach", async () => {
      s.upsertChange(bestand());
      ado.contentBeforeCommit["c9"] = { "memory-bank/a.md": "Deutscher Text" };
      expect(await poller.ergaenzeFehlendeVergleichsbasen()).toBe(1);
      expect(s.getChange("ch1")!.oldMd).toBe("Deutscher Text");
    });

    it("lässt neu angelegte Dokumente unberührt", async () => {
      const abgefragt: string[] = [];
      ado.getItemContentBefore = async (p: string) => { abgefragt.push(p); return "egal"; };
      s.upsertChange(bestand({ changeKind: "add" }));
      expect(await poller.ergaenzeFehlendeVergleichsbasen()).toBe(0);
      expect(abgefragt).toEqual([]);
      expect(s.getChange("ch1")!.oldMd).toBeNull();
    });

    it("lässt eine vorhandene Vergleichsbasis unangetastet", async () => {
      s.upsertChange(bestand({ oldMd: "schon da" }));
      ado.contentBeforeCommit["c9"] = { "memory-bank/a.md": "würde überschreiben" };
      expect(await poller.ergaenzeFehlendeVergleichsbasen()).toBe(0);
      expect(s.getChange("ch1")!.oldMd).toBe("schon da");
    });

    it("überspringt Einträge, für die ADO keinen Vorgängerstand kennt", async () => {
      s.upsertChange(bestand());
      expect(await poller.ergaenzeFehlendeVergleichsbasen()).toBe(0);
      expect(s.getChange("ch1")!.oldMd).toBeNull();
    });

    // Der Backfill läuft beim Start. Ein einzelner Ausfall darf nicht dazu
    // führen, dass alle folgenden Einträge ohne Basis bleiben.
    it("macht nach einem Fehler mit den übrigen Einträgen weiter", async () => {
      s.upsertChange(bestand({ id: "ch1", filePath: "memory-bank/a.md", committedAt: "t1" }));
      s.upsertChange(bestand({ id: "ch2", filePath: "memory-bank/b.md", committedAt: "t2" }));
      ado.getItemContentBefore = async (p: string) => {
        if (p === "memory-bank/a.md") throw new Error("ADO item 500");
        return "Basis für b";
      };
      const stumm = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await poller.ergaenzeFehlendeVergleichsbasen()).toBe(1);
      expect(stumm).toHaveBeenCalledOnce();
      stumm.mockRestore();
      expect(s.getChange("ch1")!.oldMd).toBeNull();
      expect(s.getChange("ch2")!.oldMd).toBe("Basis für b");
    });

    it("fragt den festgehaltenen Bezugspunkt ab, nicht den jüngsten Commit", async () => {
      s.upsertChange(bestand({ commitId: "c12", baselineCommitId: "c9" }));
      ado.contentBeforeCommit["c9"] = { "memory-bank/a.md": "Stand beim ersten Sichten" };
      ado.contentBeforeCommit["c12"] = { "memory-bank/a.md": "verkürzter Vergleich" };
      expect(await poller.ergaenzeFehlendeVergleichsbasen()).toBe(1);
      expect(s.getChange("ch1")!.oldMd).toBe("Stand beim ersten Sichten");
    });

    it("nutzt beim Verschieben den Pfad vor dem Commit", async () => {
      s.upsertChange(bestand({ filePath: "memory-bank/neu.md", previousPath: "memory-bank/alt.md" }));
      ado.contentBeforeCommit["c9"] = { "memory-bank/alt.md": "Stand unter altem Pfad" };
      expect(await poller.ergaenzeFehlendeVergleichsbasen()).toBe(1);
      expect(s.getChange("ch1")!.oldMd).toBe("Stand unter altem Pfad");
    });
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

  // Umbenennen/Verschieben: ADO listet beide Seiten. Die Quellseite darf keinen
  // eigenen Eintrag erzeugen — zu ihrem Pfad gibt es im Commit keinen Inhalt
  // mehr, sie landete bisher als vollständig leere Änderung in der Liste.
  it("records a move as one change with previousPath, not as an empty ghost", async () => {
    ado.commits = [{ commitId: "c1", comment: "ADRs auf Erstelldatum", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [
      { path: "docs/decisions/0001-alt.md", changeType: "delete", renameSource: true },
      { path: "docs/decisions/2026-06-15-neu.md", changeType: "edit",
        previousPath: "docs/decisions/0001-alt.md", contentUnchanged: true },
    ];
    ado.contentByCommit["c1"] = { "docs/decisions/2026-06-15-neu.md": "# ADR" };

    const ids = await poller.pollOnce();
    expect(ids).toHaveLength(1);
    const changes = s.listChangesByCycle("cy1");
    expect(changes).toHaveLength(1);
    expect(changes[0].filePath).toBe("docs/decisions/2026-06-15-neu.md");
    expect(changes[0].previousPath).toBe("docs/decisions/0001-alt.md");
    expect(changes[0].changeKind).toBe("rename"); // Inhalt unverändert
    expect(changes[0].newMd).toBe("# ADR");
    expect(s.listVotesByChange(changes[0].id)[0].status).toBe("offen");
  });

  it("keeps changeKind modify when a move also changed the content", async () => {
    ado.commits = [{ commitId: "c1", comment: "verschoben und ergänzt", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [
      { path: "docs/decisions/alt.md", changeType: "delete", renameSource: true },
      { path: "memory-bank/neu.md", changeType: "edit",
        previousPath: "docs/decisions/alt.md", contentUnchanged: false },
    ];
    ado.contentByCommit["c1"] = { "memory-bank/neu.md": "# Neu" };

    await poller.pollOnce();
    const c = s.listChangesByCycle("cy1")[0];
    expect(c.changeKind).toBe("modify");
    expect(c.previousPath).toBe("docs/decisions/alt.md");
  });

  // Der bestehende Eintrag wandert mit: gleiche Identität, neuer Pfad. Sonst
  // stünde dieselbe Datei doppelt in der Liste — einmal alt, einmal neu.
  it("moves an existing change to the new path instead of duplicating it", async () => {
    ado.commits = [{ commitId: "c1", comment: "v1", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [{ path: "docs/decisions/alt.md", changeType: "add" }];
    ado.contentByCommit["c1"] = { "docs/decisions/alt.md": "# Stand 1" };
    await poller.pollOnce();
    const before = s.listChangesByCycle("cy1")[0];

    ado.commits = [
      { commitId: "c2", comment: "auf App-Ebene verschoben", author: { name: "A", email: "a@x.de", date: "t" } },
      { commitId: "c1", comment: "v1", author: { name: "A", email: "a@x.de", date: "t" } },
    ];
    ado.changesByCommit["c2"] = [
      { path: "docs/decisions/alt.md", changeType: "delete", renameSource: true },
      { path: "apps/mira-desktop/docs/decisions/alt.md", changeType: "edit",
        previousPath: "docs/decisions/alt.md", contentUnchanged: true },
    ];
    ado.contentByCommit["c2"] = { "apps/mira-desktop/docs/decisions/alt.md": "# Stand 1" };
    await poller.pollOnce();

    const after = s.listChangesByCycle("cy1");
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id); // gleiche Identität, Historie bleibt
    expect(after[0].filePath).toBe("apps/mira-desktop/docs/decisions/alt.md");
    expect(after[0].previousPath).toBe("docs/decisions/alt.md");
  });

  // Sonderfall: Das Ziel liegt außerhalb der Scan-Pfade. Für die Memory-Bank
  // ist das Dokument dann wirklich weg — die Quellseite bleibt ein Löschen.
  it("treats a move out of the scanned paths as a delete", async () => {
    ado.commits = [{ commitId: "c1", comment: "raus aus der Memory-Bank", author: { name: "A", email: "a@x.de", date: "t" } }];
    ado.changesByCommit["c1"] = [
      { path: "docs/decisions/alt.md", changeType: "delete", renameSource: true },
      { path: "archiv/alt.md", changeType: "edit", previousPath: "docs/decisions/alt.md", contentUnchanged: true },
    ];
    await poller.pollOnce();
    const changes = s.listChangesByCycle("cy1");
    expect(changes).toHaveLength(1);
    expect(changes[0].filePath).toBe("docs/decisions/alt.md");
    expect(changes[0].changeKind).toBe("delete");
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

  // Bilder gehören zur Memory Bank wie Dokumente, ihr Inhalt aber nicht in die
  // Datenbank: über includeContent kommen Binärdaten beschädigt an, und als
  // Text gerendert stand im Widget bisher Bildmüll statt eines Vergleichs.
  describe("Bilddateien", () => {
    beforeEach(() => {
      ado.commits = [{ commitId: "c1", comment: "Diagramm überarbeitet", author: { name: "A", email: "a@x.de", date: "t" } }];
      ado.changesByCommit["c1"] = [{ path: "docs/decisions/diagrams/flow.png", changeType: "edit" }];
      ado.contentByCommit["c1"] = { "docs/decisions/diagrams/flow.png": "�PNG-Müll" };
      ado.contentBeforeCommit["c1"] = { "docs/decisions/diagrams/flow.png": "�alter PNG-Müll" };
    });

    it("erfasst ein geändertes Bild, ohne seinen Inhalt als Text einzulesen", async () => {
      await poller.pollOnce();
      const [bild] = s.listChangesByCycle("cy1");
      expect(bild.filePath).toBe("docs/decisions/diagrams/flow.png");
      expect(bild.newMd).toBeNull();
      expect(bild.oldMd).toBeNull();
      expect(bild.baselineCommitId).toBe("c1");
    });

    it("hält den Bezugscommit fest, wenn später weitere Commits folgen", async () => {
      await poller.pollOnce();
      ado.commits = [
        { commitId: "c2", comment: "nochmal", author: { name: "A", email: "a@x.de", date: "t" } },
        ...ado.commits,
      ];
      ado.changesByCommit["c2"] = [{ path: "docs/decisions/diagrams/flow.png", changeType: "edit" }];
      await poller.pollOnce();

      const [bild] = s.listChangesByCycle("cy1");
      expect(bild.commitId).toBe("c2");
      expect(bild.baselineCommitId).toBe("c1");
    });

    it("versucht nicht, für Bilder eine Textbasis nachzuziehen", async () => {
      await poller.pollOnce();
      const spion = vi.spyOn(ado, "getItemContentBefore");
      expect(await poller.ergaenzeFehlendeVergleichsbasen()).toBe(0);
      expect(spion).not.toHaveBeenCalled();
    });
  });
});
