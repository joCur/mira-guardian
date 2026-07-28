import { randomUUID } from "node:crypto";
import type { Change, ChangeKind } from "@guardian/shared";
import type { Config } from "../config.js";
import type { Store } from "../db/store.js";
import type { ChangeService } from "../domain/changeService.js";
import { ensureOpenCycle } from "../domain/cycles.js";
import type { AdoClient, AdoCommit, AdoFileChange } from "./adoClient.js";

const KIND: Record<string, ChangeKind> = { add: "add", edit: "modify", delete: "delete" };

export class AdoPoller {
  constructor(
    private cfg: Config,
    private store: Store,
    private changes: ChangeService,
    private ado: AdoClient,
    private now: () => string,
    private onChange: (changeId: string, isNew: boolean) => void = () => {},
  ) {}

  private matches(path: string): boolean {
    // Memory-Bank-Levels: Scan-Pfade gelten auf jeder Ebene (Repo-Root und
    // z. B. apps/<app>/…), aber nur auf Segmentgrenzen.
    return this.cfg.scanPaths.some(p => {
      const dir = p.replace(/\/+$/, "");
      return path === dir || path.startsWith(dir + "/") || path.includes("/" + dir + "/");
    });
  }

  async pollOnce(): Promise<string[]> {
    const { adoRepo: repo, adoBranch: branch } = this.cfg;
    const lastSeen = this.store.getLastSeenCommit(repo, branch);
    const all = await this.ado.listCommits(branch); // newest first
    const fresh: AdoCommit[] = [];
    if (lastSeen) {
      for (const c of all) { if (c.commitId === lastSeen) break; fresh.push(c); }
    } else {
      // Erststart ohne Cursor: nur die letzten backfillDays Tage übernehmen,
      // damit eine frische Instanz Kontext hat, aber nicht die gesamte
      // Repo-Historie als "neue" Änderungen einliest.
      const cutoffMs = Date.parse(this.now()) - this.cfg.backfillDays * 86_400_000;
      for (const c of all) {
        if (Number.isFinite(cutoffMs) && Date.parse(c.author.date) < cutoffMs) break;
        fresh.push(c);
      }
    }
    if (fresh.length === 0) return [];

    // oldest -> newest so newest content wins on repeated files
    const ordered = [...fresh].reverse();
    const matchedByCommit = new Map<string, AdoFileChange[]>();
    let hasMatch = false;
    for (const commit of ordered) {
      const fileChanges = await this.ado.listCommitChanges(commit.commitId);
      // Idempotenz bei Re-Scans (Cursor-Rewind, Backfill): bereits eingelesene
      // Stände (gleiche Datei aus gleichem Commit) zählen nicht als Match —
      // sonst würde ein Re-Scan Votes resetten, Toasts auslösen oder einen
      // manuell geschlossenen Zyklus wiedereröffnen.
      const matched = fileChanges.filter(fc =>
        this.matches(fc.path) && !this.store.hasIngested(repo, branch, fc.path, commit.commitId));
      if (matched.length > 0) hasMatch = true;
      matchedByCommit.set(commit.commitId, matched);
    }

    if (!hasMatch) {
      // Nothing relevant landed; advance the cursor but don't touch the cycle
      // (a closed cycle stays closed until an actual matching change arrives).
      this.store.setLastSeenCommit(repo, branch, fresh[0].commitId);
      return [];
    }

    // A relevant change is about to be recorded: (re)open a cycle for it. This
    // is what lets a new week's cycle start on the first new change after a
    // manual close (spec §9) instead of leaving getOpenCycle() null forever.
    const cycle = ensureOpenCycle(this.store, this.now);

    const touched: string[] = [];
    for (const commit of ordered) {
      const fileChanges = matchedByCommit.get(commit.commitId) ?? [];
      for (const fc of fileChanges) {
        const kind = KIND[fc.changeType] ?? "modify";
        const existing = this.store.getChangeByPath(cycle.id, fc.path);
        const newMd = kind === "delete" ? null : await this.ado.getItemContent(fc.path, commit.commitId);
        let oldMd: string | null = existing ? existing.oldMd : null;
        if (!existing && kind !== "add") {
          // first sighting of a modify/delete: try parent content as the "before" baseline
          oldMd = null; // parent lookup omitted in v1; baseline is empty (documented limitation)
        }
        const change: Change = {
          id: existing?.id ?? randomUUID(),
          repo, branch, filePath: fc.path, changeKind: kind,
          commitId: commit.commitId, commitShort: commit.commitId.slice(0, 7),
          authorName: commit.author.name, authorEmail: commit.author.email, committedAt: commit.author.date,
          summary: (commit.comment || "").split("\n")[0].trim(),
          oldMd, newMd, cycleId: cycle.id, firstSeenAt: existing?.firstSeenAt ?? this.now(),
        };
        this.store.upsertChange(change);
        if (existing) this.store.resetVotesForChange(change.id, this.now());
        this.changes.ensureVotesForChange(change.id, this.now());
        if (!touched.includes(change.id)) touched.push(change.id);
        this.onChange(change.id, !existing);
      }
    }
    this.store.setLastSeenCommit(repo, branch, fresh[0].commitId); // newest
    return touched;
  }
}
