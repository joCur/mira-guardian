# Guardian Server Implementation Plan (Backend + Shared)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `guardian-server` backend and the `shared` types package: a Node/TypeScript service that polls an Azure DevOps Server for Memory-Bank changes, stores them in SQLite, and exposes them plus a per-guardian voting workflow over REST + WebSocket.

**Architecture:** A monorepo (pnpm workspaces). `packages/shared` holds domain types and pure helpers used by both server and widget. `apps/server` is a Fastify HTTP + WebSocket service backed by `better-sqlite3`. An `AdoPoller` periodically reads commits via an `AdoClient`, turns each changed Memory-Bank file into a `Change` record, and the `ChangeService` derives all aggregation (all-accepted, badge counts, meeting grouping). Everything is deterministic — no AI.

**Tech Stack:** Node 22 (ESM), TypeScript 5, pnpm workspaces, Vitest, Fastify 4, @fastify/websocket, better-sqlite3, zod. IDs via `crypto.randomUUID()`. Timestamps are ISO-8601 UTC strings.

## Global Constraints

- Runtime: **Node 22** (`node:22-slim` base image). ESM modules (`"type": "module"`).
- Language: **TypeScript**, `strict: true`. All source in `src/`, compiled to `dist/`.
- Package manager: **pnpm** workspaces. Package names: `@guardian/shared`, `@guardian/server`.
- Naming: code identifiers, packages, services, Docker service → **`guardian`** (English). German UI copy (rendered by the widget, not this backend) → **`Hüter`**. This backend emits data, not UI copy; keep field values raw (e.g. commit subject) and never localize identifiers.
- Vote statuses (verbatim): `offen`, `akzeptiert`, `klaerung`, `abgelehnt`.
- Change kinds (verbatim): `add`, `modify`, `delete`.
- Comment is **required** (min. 5 trimmed characters) for `klaerung` and `abgelehnt`; must be empty/absent for `akzeptiert` and `offen`.
- "Von allen bestätigt" = every guardian's vote on a change is `akzeptiert`.
- The **PAT** and all ADO credentials live only in server config; never returned by any API.
- Access/setup codes are **one-time**. Code format: `MB-XXXX` (invite) and `MB-INIT-XXXX` (setup), alphabet `ACDEFHJKMNPRTWXY37`.
- ADO base URL is configurable (`ADO_BASE_URL`) and used to build deep-links.
- Test runner: **Vitest**. Every task is TDD: failing test first, then minimal implementation.

---

## File Structure

```
mira-guardian/
  pnpm-workspace.yaml
  package.json                      # root scripts, devDeps (vitest, typescript)
  tsconfig.base.json
  packages/
    shared/
      package.json                  # @guardian/shared
      tsconfig.json
      src/
        types.ts                    # domain types + const tuples
        status.ts                   # STATUS_LABELS, fileType() detection
        index.ts                    # re-exports
      test/
        status.test.ts
  apps/
    server/
      package.json                  # @guardian/server
      tsconfig.json
      Dockerfile
      src/
        config.ts                   # zod-validated env, deepLink()
        db/
          schema.sql                # DDL
          store.ts                  # Store class (better-sqlite3)
        domain/
          changeService.ts          # aggregation (pure over Store)
          authService.ts            # codes, guardians, devices
          codes.ts                  # generateCode()
        ado/
          adoClient.ts              # thin ADO REST client
          adoPoller.ts              # orchestration
        api/
          httpApi.ts                # Fastify app factory
          auth.ts                   # bearer/device-token guard
        realtime/
          hub.ts                    # WebSocket broadcast
        main.ts                     # bootstrap
      test/
        config.test.ts
        store.test.ts
        changeService.test.ts
        authService.test.ts
        adoClient.test.ts
        adoPoller.test.ts
        httpApi.test.ts
        hub.test.ts
        fixtures/
          ado-commits.json
          ado-changes.json
          ado-item.json
  docker-compose.yml                # service: guardian-server
```

---

### Task 1: Workspace scaffold + shared types

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types.ts`, `packages/shared/src/status.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/test/status.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `VoteStatus`, `ChangeKind`, `Guardian`, `Vote`, `Change`, `Cycle`, `ChangeWithVotes`, `VOTE_STATUSES`, `CHANGE_KINDS`, `STATUS_LABELS`, `fileType(path, typeMap?)`.

- [ ] **Step 1: Root workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

`package.json`:
```json
{
  "name": "mira-guardian",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^22.0.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 2: shared package manifests**

`packages/shared/package.json`:
```json
{
  "name": "@guardian/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json" }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test**

`packages/shared/test/status.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { VOTE_STATUSES, STATUS_LABELS, fileType } from "../src/index.js";

describe("shared/status", () => {
  it("exposes the four vote statuses in order", () => {
    expect(VOTE_STATUSES).toEqual(["offen", "akzeptiert", "klaerung", "abgelehnt"]);
  });

  it("labels are the German UI strings", () => {
    expect(STATUS_LABELS.akzeptiert).toBe("Akzeptiert");
    expect(STATUS_LABELS.klaerung).toBe("Klärungsbedarf");
    expect(STATUS_LABELS.abgelehnt).toBe("Abgelehnt");
    expect(STATUS_LABELS.offen).toBe("ausstehend");
  });

  it("detects file types by path with defaults", () => {
    expect(fileType("docs/decisions/adr-013.md").label).toBe("Decision");
    expect(fileType("docs/learnings/x.md").label).toBe("Learning");
    expect(fileType("memory-bank/activeContext.md").label).toBe("Kontext");
    expect(fileType(".claude/rules/self-contained.md").label).toBe("Sonstige");
  });

  it("honours a custom type map", () => {
    const map = [{ pattern: "^\\.claude/rules/", label: "Konvention" }];
    expect(fileType(".claude/rules/x.md", map).label).toBe("Konvention");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run packages/shared/test/status.test.ts`
Expected: FAIL — cannot resolve `../src/index.js` / exports undefined.

- [ ] **Step 5: Implement types**

`packages/shared/src/types.ts`:
```ts
export const VOTE_STATUSES = ["offen", "akzeptiert", "klaerung", "abgelehnt"] as const;
export type VoteStatus = (typeof VOTE_STATUSES)[number];

export const CHANGE_KINDS = ["add", "modify", "delete"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export interface Guardian {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarColor: string;
  createdAt: string;
  isFounder: boolean;
}

export interface Vote {
  changeId: string;
  guardianId: string;
  status: VoteStatus;
  comment: string | null;
  updatedAt: string;
}

export interface Change {
  id: string;
  repo: string;
  branch: string;
  filePath: string;
  changeKind: ChangeKind;
  commitId: string;
  commitShort: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
  summary: string;
  oldMd: string | null;
  newMd: string | null;
  cycleId: string;
  firstSeenAt: string;
}

export interface Cycle {
  id: string;
  isoWeek: string;
  startsAt: string;
  endsAt: string | null;
  closedAt: string | null;
  note: string | null;
}

export interface ChangeWithVotes extends Change {
  votes: Vote[];
  adoLink: string;
}

export interface TypeRule {
  pattern: string; // regex source, tested against the file path
  label: string;
}
```

- [ ] **Step 6: Implement status helpers**

`packages/shared/src/status.ts`:
```ts
import type { VoteStatus, TypeRule } from "./types.js";

export const STATUS_LABELS: Record<VoteStatus, string> = {
  offen: "ausstehend",
  akzeptiert: "Akzeptiert",
  klaerung: "Klärungsbedarf",
  abgelehnt: "Abgelehnt",
};

export const DEFAULT_TYPE_RULES: TypeRule[] = [
  { pattern: "^docs/decisions/", label: "Decision" },
  { pattern: "^docs/learnings/", label: "Learning" },
  { pattern: "^memory-bank/", label: "Kontext" },
];

export function fileType(path: string, rules: TypeRule[] = DEFAULT_TYPE_RULES): { label: string } {
  for (const r of rules) {
    if (new RegExp(r.pattern).test(path)) return { label: r.label };
  }
  return { label: "Sonstige" };
}
```

`packages/shared/src/index.ts`:
```ts
export * from "./types.js";
export * from "./status.js";
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm install && pnpm vitest run packages/shared/test/status.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json packages/shared
git commit -m "feat(shared): workspace scaffold and domain types"
```

---

### Task 2: SQLite Store

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`
- Create: `apps/server/src/db/schema.sql`, `apps/server/src/db/store.ts`
- Test: `apps/server/test/store.test.ts`

**Interfaces:**
- Consumes: `@guardian/shared` types.
- Produces: `class Store` with methods:
  - `constructor(dbPath: string)` (`":memory:"` allowed)
  - `getSetupState(): { setupCode: string; initializedAt: string | null }`
  - `setInitialized(now: string): void`
  - `insertGuardian(g: Guardian): void`
  - `listGuardians(): Guardian[]`
  - `getGuardian(id: string): Guardian | undefined`
  - `insertInviteCode(c: { code: string; name: string; email: string; createdBy: string; createdAt: string }): void`
  - `getInviteCode(code: string): { code: string; name: string; email: string; redeemedAt: string | null } | undefined`
  - `markInviteRedeemed(code: string, guardianId: string, now: string): void`
  - `listOpenInviteCodes(): { code: string; name: string; email: string }[]`
  - `insertDevice(d: { id: string; guardianId: string; token: string; label: string; lastSeenAt: string }): void`
  - `getDeviceByToken(token: string): { id: string; guardianId: string } | undefined`
  - `getOpenCycle(): Cycle | undefined`
  - `insertCycle(c: Cycle): void`
  - `closeCycle(id: string, closedAt: string, note: string | null): void`
  - `listCycles(): Cycle[]`
  - `upsertChange(c: Change): void` (unique on repo+branch+filePath within an open cycle)
  - `getChange(id: string): Change | undefined`
  - `getChangeByPath(cycleId: string, filePath: string): Change | undefined`
  - `listChangesByCycle(cycleId: string): Change[]`
  - `getLastSeenCommit(repo: string, branch: string): string | undefined`
  - `setLastSeenCommit(repo: string, branch: string, commitId: string): void`
  - `upsertVote(v: Vote): void` (unique on changeId+guardianId)
  - `listVotesByChange(changeId: string): Vote[]`
  - `listVotesByCycle(cycleId: string): Vote[]`
  - `resetVotesForChange(changeId: string, now: string): void` (set every vote to `offen`, comment `null`)

- [ ] **Step 1: server manifests**

`apps/server/package.json`:
```json
{
  "name": "@guardian/server",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js"
  },
  "dependencies": {
    "@guardian/shared": "workspace:*",
    "better-sqlite3": "^11.0.0",
    "fastify": "^4.28.0",
    "@fastify/websocket": "^10.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

`apps/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 2: schema DDL**

`apps/server/src/db/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS setup_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_code TEXT NOT NULL,
  initialized_at TEXT
);
CREATE TABLE IF NOT EXISTS guardian (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
  initials TEXT NOT NULL, avatar_color TEXT NOT NULL,
  created_at TEXT NOT NULL, is_founder INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invite_code (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  redeemed_at TEXT, redeemed_by TEXT
);
CREATE TABLE IF NOT EXISTS device (
  id TEXT PRIMARY KEY, guardian_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL, last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cycle (
  id TEXT PRIMARY KEY, iso_week TEXT NOT NULL, starts_at TEXT NOT NULL,
  ends_at TEXT, closed_at TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS change_item (
  id TEXT PRIMARY KEY, repo TEXT NOT NULL, branch TEXT NOT NULL,
  file_path TEXT NOT NULL, change_kind TEXT NOT NULL,
  commit_id TEXT NOT NULL, commit_short TEXT NOT NULL,
  author_name TEXT NOT NULL, author_email TEXT NOT NULL, committed_at TEXT NOT NULL,
  summary TEXT NOT NULL, old_md TEXT, new_md TEXT,
  cycle_id TEXT NOT NULL, first_seen_at TEXT NOT NULL,
  UNIQUE (cycle_id, file_path)
);
CREATE TABLE IF NOT EXISTS vote (
  id TEXT PRIMARY KEY, change_id TEXT NOT NULL, guardian_id TEXT NOT NULL,
  status TEXT NOT NULL, comment TEXT, updated_at TEXT NOT NULL,
  UNIQUE (change_id, guardian_id)
);
CREATE TABLE IF NOT EXISTS last_seen (
  repo TEXT NOT NULL, branch TEXT NOT NULL, commit_id TEXT NOT NULL,
  PRIMARY KEY (repo, branch)
);
```

- [ ] **Step 3: Write the failing test**

`apps/server/test/store.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { Store } from "../src/db/store.js";
import type { Change, Vote } from "@guardian/shared";

function newStore() { return new Store(":memory:"); }

const change: Change = {
  id: "ch1", repo: "r", branch: "main", filePath: "docs/decisions/adr-013.md",
  changeKind: "add", commitId: "abc123", commitShort: "abc123",
  authorName: "Anna", authorEmail: "a@x.de", committedAt: "2026-07-19T10:00:00Z",
  summary: "Neue Decision", oldMd: null, newMd: "# ADR", cycleId: "cy1",
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test/store.test.ts`
Expected: FAIL — `../src/db/store.js` not found.

- [ ] **Step 5: Implement Store**

`apps/server/src/db/store.ts`:
```ts
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Guardian, Change, Vote, Cycle, VoteStatus, ChangeKind } from "@guardian/shared";

const __dir = dirname(fileURLToPath(import.meta.url));

export class Store {
  private db: Database.Database;
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(readFileSync(join(__dir, "schema.sql"), "utf8"));
  }

  getSetupState() {
    let row = this.db.prepare("SELECT setup_code AS setupCode, initialized_at AS initializedAt FROM setup_state WHERE id = 1").get() as
      { setupCode: string; initializedAt: string | null } | undefined;
    return row ?? { setupCode: "", initializedAt: null };
  }
  ensureSetupCode(code: string) {
    this.db.prepare("INSERT OR IGNORE INTO setup_state (id, setup_code) VALUES (1, ?)").run(code);
  }
  setInitialized(now: string) {
    this.db.prepare("UPDATE setup_state SET initialized_at = ? WHERE id = 1").run(now);
  }

  insertGuardian(g: Guardian) {
    this.db.prepare(`INSERT INTO guardian (id,name,email,initials,avatar_color,created_at,is_founder)
      VALUES (@id,@name,@email,@initials,@avatarColor,@createdAt,@isFounder)`)
      .run({ ...g, isFounder: g.isFounder ? 1 : 0 });
  }
  private mapGuardian = (r: any): Guardian => ({ id: r.id, name: r.name, email: r.email,
    initials: r.initials, avatarColor: r.avatar_color, createdAt: r.created_at, isFounder: !!r.is_founder });
  listGuardians(): Guardian[] {
    return (this.db.prepare("SELECT * FROM guardian ORDER BY created_at").all() as any[]).map(this.mapGuardian);
  }
  getGuardian(id: string): Guardian | undefined {
    const r = this.db.prepare("SELECT * FROM guardian WHERE id = ?").get(id);
    return r ? this.mapGuardian(r) : undefined;
  }

  insertInviteCode(c: { code: string; name: string; email: string; createdBy: string; createdAt: string }) {
    this.db.prepare(`INSERT INTO invite_code (code,name,email,created_by,created_at)
      VALUES (@code,@name,@email,@createdBy,@createdAt)`).run(c);
  }
  getInviteCode(code: string) {
    return this.db.prepare("SELECT code,name,email,redeemed_at AS redeemedAt FROM invite_code WHERE code = ?").get(code) as
      { code: string; name: string; email: string; redeemedAt: string | null } | undefined;
  }
  markInviteRedeemed(code: string, guardianId: string, now: string) {
    this.db.prepare("UPDATE invite_code SET redeemed_at = ?, redeemed_by = ? WHERE code = ?").run(now, guardianId, code);
  }
  listOpenInviteCodes() {
    return this.db.prepare("SELECT code,name,email FROM invite_code WHERE redeemed_at IS NULL ORDER BY created_at").all() as
      { code: string; name: string; email: string }[];
  }

  insertDevice(d: { id: string; guardianId: string; token: string; label: string; lastSeenAt: string }) {
    this.db.prepare(`INSERT INTO device (id,guardian_id,token,label,last_seen_at)
      VALUES (@id,@guardianId,@token,@label,@lastSeenAt)`).run(d);
  }
  getDeviceByToken(token: string) {
    return this.db.prepare("SELECT id, guardian_id AS guardianId FROM device WHERE token = ?").get(token) as
      { id: string; guardianId: string } | undefined;
  }

  private mapCycle = (r: any): Cycle => ({ id: r.id, isoWeek: r.iso_week, startsAt: r.starts_at,
    endsAt: r.ends_at, closedAt: r.closed_at, note: r.note });
  getOpenCycle(): Cycle | undefined {
    const r = this.db.prepare("SELECT * FROM cycle WHERE closed_at IS NULL ORDER BY starts_at DESC LIMIT 1").get();
    return r ? this.mapCycle(r) : undefined;
  }
  insertCycle(c: Cycle) {
    this.db.prepare(`INSERT INTO cycle (id,iso_week,starts_at,ends_at,closed_at,note)
      VALUES (@id,@isoWeek,@startsAt,@endsAt,@closedAt,@note)`).run(c);
  }
  closeCycle(id: string, closedAt: string, note: string | null) {
    this.db.prepare("UPDATE cycle SET closed_at = ?, ends_at = ?, note = ? WHERE id = ?").run(closedAt, closedAt, note, id);
  }
  listCycles(): Cycle[] {
    return (this.db.prepare("SELECT * FROM cycle ORDER BY starts_at DESC").all() as any[]).map(this.mapCycle);
  }

  private mapChange = (r: any): Change => ({ id: r.id, repo: r.repo, branch: r.branch, filePath: r.file_path,
    changeKind: r.change_kind as ChangeKind, commitId: r.commit_id, commitShort: r.commit_short,
    authorName: r.author_name, authorEmail: r.author_email, committedAt: r.committed_at, summary: r.summary,
    oldMd: r.old_md, newMd: r.new_md, cycleId: r.cycle_id, firstSeenAt: r.first_seen_at });
  upsertChange(c: Change) {
    this.db.prepare(`INSERT INTO change_item
      (id,repo,branch,file_path,change_kind,commit_id,commit_short,author_name,author_email,committed_at,summary,old_md,new_md,cycle_id,first_seen_at)
      VALUES (@id,@repo,@branch,@filePath,@changeKind,@commitId,@commitShort,@authorName,@authorEmail,@committedAt,@summary,@oldMd,@newMd,@cycleId,@firstSeenAt)
      ON CONFLICT (cycle_id, file_path) DO UPDATE SET
        change_kind=excluded.change_kind, commit_id=excluded.commit_id, commit_short=excluded.commit_short,
        author_name=excluded.author_name, author_email=excluded.author_email, committed_at=excluded.committed_at,
        summary=excluded.summary, new_md=excluded.new_md`).run(c);
  }
  getChange(id: string): Change | undefined {
    const r = this.db.prepare("SELECT * FROM change_item WHERE id = ?").get(id);
    return r ? this.mapChange(r) : undefined;
  }
  getChangeByPath(cycleId: string, filePath: string): Change | undefined {
    const r = this.db.prepare("SELECT * FROM change_item WHERE cycle_id = ? AND file_path = ?").get(cycleId, filePath);
    return r ? this.mapChange(r) : undefined;
  }
  listChangesByCycle(cycleId: string): Change[] {
    return (this.db.prepare("SELECT * FROM change_item WHERE cycle_id = ? ORDER BY committed_at DESC").all(cycleId) as any[]).map(this.mapChange);
  }

  getLastSeenCommit(repo: string, branch: string): string | undefined {
    const r = this.db.prepare("SELECT commit_id AS c FROM last_seen WHERE repo = ? AND branch = ?").get(repo, branch) as { c: string } | undefined;
    return r?.c;
  }
  setLastSeenCommit(repo: string, branch: string, commitId: string) {
    this.db.prepare(`INSERT INTO last_seen (repo,branch,commit_id) VALUES (?,?,?)
      ON CONFLICT (repo,branch) DO UPDATE SET commit_id = excluded.commit_id`).run(repo, branch, commitId);
  }

  private mapVote = (r: any): Vote => ({ changeId: r.change_id, guardianId: r.guardian_id,
    status: r.status as VoteStatus, comment: r.comment, updatedAt: r.updated_at });
  upsertVote(v: Vote) {
    this.db.prepare(`INSERT INTO vote (id,change_id,guardian_id,status,comment,updated_at)
      VALUES (@id,@changeId,@guardianId,@status,@comment,@updatedAt)
      ON CONFLICT (change_id,guardian_id) DO UPDATE SET
        status=excluded.status, comment=excluded.comment, updated_at=excluded.updated_at`)
      .run({ id: randomUUID(), ...v });
  }
  listVotesByChange(changeId: string): Vote[] {
    return (this.db.prepare("SELECT * FROM vote WHERE change_id = ?").all(changeId) as any[]).map(this.mapVote);
  }
  listVotesByCycle(cycleId: string): Vote[] {
    return (this.db.prepare(`SELECT v.* FROM vote v JOIN change_item c ON c.id = v.change_id WHERE c.cycle_id = ?`).all(cycleId) as any[]).map(this.mapVote);
  }
  resetVotesForChange(changeId: string, now: string) {
    this.db.prepare("UPDATE vote SET status = 'offen', comment = NULL, updated_at = ? WHERE change_id = ?").run(now, changeId);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm install && pnpm --filter @guardian/shared build && pnpm vitest run apps/server/test/store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat(server): SQLite store with schema and repositories"
```

---

### Task 3: ChangeService aggregation

**Files:**
- Create: `apps/server/src/domain/changeService.ts`
- Test: `apps/server/test/changeService.test.ts`

**Interfaces:**
- Consumes: `Store` (Task 2), shared types.
- Produces: `class ChangeService`, constructed with `(store: Store)`, methods:
  - `allAccepted(changeId: string): boolean`
  - `activeChanges(cycleId: string): Change[]` — not all-accepted, worst-status first
  - `acceptedChanges(cycleId: string): Change[]` — all-accepted
  - `badgeCount(cycleId: string, guardianId: string): number` — changes where this guardian is `offen`
  - `stripeStatus(changeId: string): VoteStatus` — worst: abgelehnt > klaerung > offen > akzeptiert
  - `meetingGroups(cycleId: string): { rejected: Change[]; klaerung: Change[]; accepted: Change[]; outstanding: number }`
  - `backfillVotesForGuardian(guardianId: string, now: string): void` — add `offen` vote to every open-cycle change lacking one
  - `ensureVotesForChange(changeId: string, now: string): void` — add `offen` vote for every guardian lacking one

- [ ] **Step 1: Write the failing test**

`apps/server/test/changeService.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import type { Change, Guardian } from "@guardian/shared";

function guardian(id: string): Guardian {
  return { id, name: id, email: `${id}@x.de`, initials: id.slice(0,2).toUpperCase(),
    avatarColor: "#fff", createdAt: "t", isFounder: false };
}
function change(id: string, path: string): Change {
  return { id, repo: "r", branch: "main", filePath: path, changeKind: "modify",
    commitId: id, commitShort: id, authorName: "A", authorEmail: "a@x.de",
    committedAt: "2026-07-19T10:00:00Z", summary: "s", oldMd: "old", newMd: "new",
    cycleId: "cy1", firstSeenAt: "t" };
}

describe("ChangeService", () => {
  let s: Store, svc: ChangeService;
  beforeEach(() => {
    s = new Store(":memory:");
    svc = new ChangeService(s);
    s.insertCycle({ id: "cy1", isoWeek: "2026-W30", startsAt: "t", endsAt: null, closedAt: null, note: null });
    ["g1","g2","g3"].forEach(id => s.insertGuardian(guardian(id)));
  });

  function vote(cid: string, gid: string, status: any, comment: string | null = null) {
    s.upsertVote({ changeId: cid, guardianId: gid, status, comment, updatedAt: "t" });
  }

  it("splits active vs accepted by all-accepted", () => {
    s.upsertChange(change("c1", "memory-bank/a.md"));
    s.upsertChange(change("c2", "memory-bank/b.md"));
    ["g1","g2","g3"].forEach(g => vote("c1", g, "akzeptiert"));
    vote("c2", "g1", "akzeptiert"); vote("c2", "g2", "offen"); vote("c2", "g3", "akzeptiert");
    expect(svc.allAccepted("c1")).toBe(true);
    expect(svc.acceptedChanges("cy1").map(c => c.id)).toEqual(["c1"]);
    expect(svc.activeChanges("cy1").map(c => c.id)).toEqual(["c2"]);
  });

  it("counts a guardian's pending badge", () => {
    s.upsertChange(change("c1", "memory-bank/a.md"));
    s.upsertChange(change("c2", "memory-bank/b.md"));
    vote("c1","g1","offen"); vote("c2","g1","akzeptiert");
    expect(svc.badgeCount("cy1", "g1")).toBe(1);
  });

  it("computes worst stripe status", () => {
    s.upsertChange(change("c1", "memory-bank/a.md"));
    vote("c1","g1","akzeptiert"); vote("c1","g2","klaerung","x"); vote("c1","g3","abgelehnt","y");
    expect(svc.stripeStatus("c1")).toBe("abgelehnt");
  });

  it("groups the meeting: rejected before klaerung, accepted separate", () => {
    s.upsertChange(change("c1", "memory-bank/a.md"));
    s.upsertChange(change("c2", "memory-bank/b.md"));
    s.upsertChange(change("c3", "memory-bank/c.md"));
    vote("c1","g1","abgelehnt","no"); vote("c1","g2","akzeptiert"); vote("c1","g3","offen");
    vote("c2","g1","klaerung","q"); vote("c2","g2","akzeptiert"); vote("c2","g3","akzeptiert");
    ["g1","g2","g3"].forEach(g => vote("c3", g, "akzeptiert"));
    const m = svc.meetingGroups("cy1");
    expect(m.rejected.map(c=>c.id)).toEqual(["c1"]);
    expect(m.klaerung.map(c=>c.id)).toEqual(["c2"]);
    expect(m.accepted.map(c=>c.id)).toEqual(["c3"]);
    expect(m.outstanding).toBe(1); // c1/g3 offen
  });

  it("backfills offen votes for a new guardian", () => {
    s.upsertChange(change("c1", "memory-bank/a.md"));
    vote("c1","g1","akzeptiert");
    s.insertGuardian(guardian("g4"));
    svc.backfillVotesForGuardian("g4", "t");
    const statuses = s.listVotesByChange("c1").find(v => v.guardianId === "g4");
    expect(statuses?.status).toBe("offen");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test/changeService.test.ts`
Expected: FAIL — `../src/domain/changeService.js` not found.

- [ ] **Step 3: Implement ChangeService**

`apps/server/src/domain/changeService.ts`:
```ts
import { randomUUID } from "node:crypto";
import type { Change, Vote, VoteStatus } from "@guardian/shared";
import type { Store } from "../db/store.js";

const RANK: Record<VoteStatus, number> = { abgelehnt: 3, klaerung: 2, offen: 1, akzeptiert: 0 };

export class ChangeService {
  constructor(private store: Store) {}

  private votes(changeId: string): Vote[] { return this.store.listVotesByChange(changeId); }

  allAccepted(changeId: string): boolean {
    const guardians = this.store.listGuardians();
    if (guardians.length === 0) return false;
    const votes = this.votes(changeId);
    return guardians.every(g => votes.find(v => v.guardianId === g.id)?.status === "akzeptiert");
  }

  stripeStatus(changeId: string): VoteStatus {
    const votes = this.votes(changeId);
    if (votes.some(v => v.status === "abgelehnt")) return "abgelehnt";
    if (votes.some(v => v.status === "klaerung")) return "klaerung";
    if (votes.some(v => v.status === "offen")) return "offen";
    return "akzeptiert";
  }

  activeChanges(cycleId: string): Change[] {
    return this.store.listChangesByCycle(cycleId)
      .filter(c => !this.allAccepted(c.id))
      .sort((a, b) => RANK[this.stripeStatus(b.id)] - RANK[this.stripeStatus(a.id)]);
  }
  acceptedChanges(cycleId: string): Change[] {
    return this.store.listChangesByCycle(cycleId).filter(c => this.allAccepted(c.id));
  }

  badgeCount(cycleId: string, guardianId: string): number {
    return this.store.listChangesByCycle(cycleId)
      .filter(c => this.votes(c.id).find(v => v.guardianId === guardianId)?.status === "offen").length;
  }

  meetingGroups(cycleId: string) {
    const active = this.activeChanges(cycleId);
    const rejected = active.filter(c => this.votes(c.id).some(v => v.status === "abgelehnt"));
    const klaerung = active.filter(c => !rejected.includes(c) && this.votes(c.id).some(v => v.status === "klaerung"));
    const accepted = this.acceptedChanges(cycleId);
    const outstanding = active.reduce((n, c) => n + this.votes(c.id).filter(v => v.status === "offen").length, 0);
    return { rejected, klaerung, accepted, outstanding };
  }

  ensureVotesForChange(changeId: string, now: string) {
    const existing = new Set(this.votes(changeId).map(v => v.guardianId));
    for (const g of this.store.listGuardians()) {
      if (!existing.has(g.id)) {
        this.store.upsertVote({ changeId, guardianId: g.id, status: "offen", comment: null, updatedAt: now });
      }
    }
  }
  backfillVotesForGuardian(guardianId: string, now: string) {
    const cycle = this.store.getOpenCycle();
    if (!cycle) return;
    for (const c of this.store.listChangesByCycle(cycle.id)) {
      const has = this.votes(c.id).some(v => v.guardianId === guardianId);
      if (!has) this.store.upsertVote({ changeId: c.id, guardianId, status: "offen", comment: null, updatedAt: now });
    }
  }
}
```
_(`randomUUID` import kept for symmetry with other services; remove if the linter flags it unused.)_

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/server/test/changeService.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/domain/changeService.ts apps/server/test/changeService.test.ts
git commit -m "feat(server): change aggregation service"
```

---

### Task 4: Codes + AuthService

**Files:**
- Create: `apps/server/src/domain/codes.ts`, `apps/server/src/domain/authService.ts`
- Test: `apps/server/test/authService.test.ts`

**Interfaces:**
- Consumes: `Store`, `ChangeService`, shared types.
- Produces:
  - `generateCode(prefix: string, rng?: () => number): string` — `PREFIX-XXXX`, alphabet `ACDEFHJKMNPRTWXY37`.
  - `initialsOf(name: string): string`, `avatarFor(index: number): string`.
  - `class AuthService` constructed `(store, changeService, now: () => string)`:
    - `initFounder(setupCode: string, name: string, email: string): { deviceToken: string; guardian: Guardian }` — throws `AuthError` on wrong/used code or bad email.
    - `invite(createdBy: string, name: string, email: string): { code: string }`
    - `redeem(code: string): { deviceToken: string; guardian: Guardian }` — links a pending invite to a new guardian, backfills votes; throws `AuthError` if unknown/used.
    - `guardianForToken(token: string): Guardian | undefined`

- [ ] **Step 1: Write the failing test**

`apps/server/test/authService.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import { AuthService, AuthError } from "../src/domain/authService.js";
import { generateCode } from "../src/domain/codes.js";

let clock = 0;
const now = () => `t${clock++}`;

describe("generateCode", () => {
  it("uses prefix and 4 chars from the safe alphabet", () => {
    const seq = [0, 0, 0, 0];
    let i = 0;
    const code = generateCode("MB", () => seq[i++] / 18);
    expect(code).toBe("MB-AAAA");
  });
});

describe("AuthService", () => {
  let s: Store, svc: AuthService;
  beforeEach(() => {
    clock = 0;
    s = new Store(":memory:");
    s.ensureSetupCode("MB-INIT-7743");
    svc = new AuthService(s, new ChangeService(s), now);
  });

  it("founds the first guardian with the setup code", () => {
    const r = svc.initFounder("MB-INIT-7743", "Anna Roth", "anna@x.de");
    expect(r.guardian.isFounder).toBe(true);
    expect(r.guardian.initials).toBe("AR");
    expect(r.deviceToken).toBeTruthy();
    expect(s.getSetupState().initializedAt).not.toBeNull();
    expect(svc.guardianForToken(r.deviceToken)?.id).toBe(r.guardian.id);
  });

  it("rejects a wrong setup code", () => {
    expect(() => svc.initFounder("MB-INIT-0000", "X", "x@x.de")).toThrow(AuthError);
  });

  it("invites then redeems a new guardian and backfills votes", () => {
    const founder = svc.initFounder("MB-INIT-7743", "Anna Roth", "anna@x.de");
    // an existing open change so backfill has something to do
    s.upsertChange({ id: "c1", repo: "r", branch: "main", filePath: "memory-bank/a.md",
      changeKind: "modify", commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de",
      committedAt: "t", summary: "s", oldMd: "o", newMd: "n",
      cycleId: s.getOpenCycle()!.id, firstSeenAt: "t" });
    const { code } = svc.invite(founder.guardian.id, "Ben Keller", "ben@x.de");
    const r = svc.redeem(code);
    expect(r.guardian.name).toBe("Ben Keller");
    expect(s.listVotesByChange("c1").find(v => v.guardianId === r.guardian.id)?.status).toBe("offen");
    expect(() => svc.redeem(code)).toThrow(AuthError); // one-time
  });
});
```
_Note: this test assumes an open cycle exists after `initFounder`. `initFounder` must create the first cycle (see implementation)._

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test/authService.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement codes**

`apps/server/src/domain/codes.ts`:
```ts
const ALPHABET = "ACDEFHJKMNPRTWXY37";

export function generateCode(prefix: string, rng: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return `${prefix}-${s}`;
}

export function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

const AVATARS = ["#7aa2f7", "#e0af68", "#bb9af7", "#7dcfff", "#9ece6a", "#ff9e64"];
export function avatarFor(index: number): string {
  return AVATARS[index % AVATARS.length];
}
```

- [ ] **Step 4: Implement AuthService**

`apps/server/src/domain/authService.ts`:
```ts
import { randomUUID } from "node:crypto";
import type { Guardian } from "@guardian/shared";
import type { Store } from "../db/store.js";
import type { ChangeService } from "./changeService.js";
import { generateCode, initialsOf, avatarFor } from "./codes.js";

export class AuthError extends Error {}

function isoWeek(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export class AuthService {
  constructor(private store: Store, private changes: ChangeService, private now: () => string) {}

  private newGuardian(name: string, email: string, isFounder: boolean): Guardian {
    const idx = this.store.listGuardians().length;
    return { id: randomUUID(), name: name.trim(), email: email.trim(),
      initials: initialsOf(name), avatarColor: avatarFor(idx), createdAt: this.now(), isFounder };
  }
  private issueDevice(guardianId: string): string {
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    this.store.insertDevice({ id: randomUUID(), guardianId, token, label: "device", lastSeenAt: this.now() });
    return token;
  }
  private ensureOpenCycle(): void {
    if (this.store.getOpenCycle()) return;
    const now = this.now();
    this.store.insertCycle({ id: randomUUID(), isoWeek: isoWeek(now === "" ? new Date().toISOString() : now),
      startsAt: now, endsAt: null, closedAt: null, note: null });
  }

  initFounder(setupCode: string, name: string, email: string) {
    const state = this.store.getSetupState();
    if (state.initializedAt) throw new AuthError("Instanz ist bereits initialisiert.");
    if (setupCode.trim().toUpperCase() !== state.setupCode) throw new AuthError("Setup-Code stimmt nicht.");
    if (!email.includes("@")) throw new AuthError("E-Mail ungültig.");
    const guardian = this.newGuardian(name, email, true);
    this.store.insertGuardian(guardian);
    this.store.setInitialized(this.now());
    this.ensureOpenCycle();
    return { deviceToken: this.issueDevice(guardian.id), guardian };
  }

  invite(createdBy: string, name: string, email: string) {
    if (!name.trim() || !email.includes("@")) throw new AuthError("Name/E-Mail ungültig.");
    let code = generateCode("MB");
    while (this.store.getInviteCode(code)) code = generateCode("MB");
    this.store.insertInviteCode({ code, name: name.trim(), email: email.trim(), createdBy, createdAt: this.now() });
    return { code };
  }

  redeem(code: string) {
    const invite = this.store.getInviteCode(code.trim().toUpperCase());
    if (!invite || invite.redeemedAt) throw new AuthError("Code unbekannt oder bereits eingelöst.");
    const guardian = this.newGuardian(invite.name, invite.email, false);
    this.store.insertGuardian(guardian);
    this.store.markInviteRedeemed(invite.code, guardian.id, this.now());
    this.changes.backfillVotesForGuardian(guardian.id, this.now());
    return { deviceToken: this.issueDevice(guardian.id), guardian };
  }

  guardianForToken(token: string): Guardian | undefined {
    const d = this.store.getDeviceByToken(token);
    return d ? this.store.getGuardian(d.guardianId) : undefined;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run apps/server/test/authService.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/domain/codes.ts apps/server/src/domain/authService.ts apps/server/test/authService.test.ts
git commit -m "feat(server): one-time codes and auth/onboarding service"
```

---

### Task 5: Config loader + deep-link

**Files:**
- Create: `apps/server/src/config.ts`
- Test: `apps/server/test/config.test.ts`

**Interfaces:**
- Consumes: shared `TypeRule`.
- Produces:
  - `interface Config` (adoBaseUrl, adoCollection, adoProject, adoRepo, adoBranch, adoPat, pollIntervalSeconds, scanPaths, typeRules, dbPath, httpPort).
  - `loadConfig(env: NodeJS.ProcessEnv): Config` — zod-validated; throws on missing required.
  - `deepLink(cfg: Config, commitId: string, filePath: string): string`

- [ ] **Step 1: Write the failing test**

`apps/server/test/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { loadConfig, deepLink } from "../src/config.js";

const base = {
  ADO_BASE_URL: "https://ado.example.com",
  ADO_COLLECTION: "DefaultCollection",
  ADO_PROJECT: "mira",
  ADO_REPO: "mira",
  ADO_PAT: "secret",
};

describe("config", () => {
  it("applies defaults and parses scan paths", () => {
    const cfg = loadConfig({ ...base, SCAN_PATHS: "docs/decisions,docs/learnings,memory-bank" } as any);
    expect(cfg.adoBranch).toBe("main");
    expect(cfg.pollIntervalSeconds).toBe(60);
    expect(cfg.scanPaths).toEqual(["docs/decisions", "docs/learnings", "memory-bank"]);
  });

  it("throws when a required var is missing", () => {
    expect(() => loadConfig({ ADO_BASE_URL: "x" } as any)).toThrow();
  });

  it("builds a commit deep-link", () => {
    const cfg = loadConfig(base as any);
    expect(deepLink(cfg, "abc123", "docs/decisions/adr.md")).toBe(
      "https://ado.example.com/DefaultCollection/mira/_git/mira/commit/abc123?path=/docs/decisions/adr.md"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test/config.test.ts`
Expected: FAIL — `../src/config.js` not found.

- [ ] **Step 3: Implement config**

`apps/server/src/config.ts`:
```ts
import { z } from "zod";
import type { TypeRule } from "@guardian/shared";

const schema = z.object({
  ADO_BASE_URL: z.string().url(),
  ADO_COLLECTION: z.string().min(1),
  ADO_PROJECT: z.string().min(1),
  ADO_REPO: z.string().min(1),
  ADO_BRANCH: z.string().default("main"),
  ADO_PAT: z.string().min(1),
  POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  SCAN_PATHS: z.string().default("docs/decisions,docs/learnings,memory-bank"),
  TYPE_MAP: z.string().optional(),
  DB_PATH: z.string().default("guardian.sqlite"),
  HTTP_PORT: z.coerce.number().int().positive().default(4000),
});

export interface Config {
  adoBaseUrl: string; adoCollection: string; adoProject: string; adoRepo: string;
  adoBranch: string; adoPat: string; pollIntervalSeconds: number;
  scanPaths: string[]; typeRules: TypeRule[] | undefined; dbPath: string; httpPort: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const e = schema.parse(env);
  return {
    adoBaseUrl: e.ADO_BASE_URL.replace(/\/+$/, ""),
    adoCollection: e.ADO_COLLECTION, adoProject: e.ADO_PROJECT, adoRepo: e.ADO_REPO,
    adoBranch: e.ADO_BRANCH, adoPat: e.ADO_PAT, pollIntervalSeconds: e.POLL_INTERVAL_SECONDS,
    scanPaths: e.SCAN_PATHS.split(",").map(s => s.trim()).filter(Boolean),
    typeRules: e.TYPE_MAP ? (JSON.parse(e.TYPE_MAP) as TypeRule[]) : undefined,
    dbPath: e.DB_PATH, httpPort: e.HTTP_PORT,
  };
}

export function deepLink(cfg: Config, commitId: string, filePath: string): string {
  return `${cfg.adoBaseUrl}/${cfg.adoCollection}/${cfg.adoProject}/_git/${cfg.adoRepo}/commit/${commitId}?path=/${filePath}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/server/test/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/config.ts apps/server/test/config.test.ts
git commit -m "feat(server): zod config loader and ADO deep-link builder"
```

---

### Task 6: AdoClient

**Files:**
- Create: `apps/server/src/ado/adoClient.ts`
- Test: `apps/server/test/adoClient.test.ts`, `apps/server/test/fixtures/*.json`

**Interfaces:**
- Consumes: `Config`.
- Produces: `class AdoClient` constructed `(cfg: Config, fetchFn?: typeof fetch)`:
  - `listCommits(branch: string, top?: number): Promise<AdoCommit[]>` — newest first. `AdoCommit = { commitId: string; comment: string; author: { name: string; email: string; date: string } }`.
  - `listCommitChanges(commitId: string): Promise<AdoFileChange[]>` — `AdoFileChange = { path: string; changeType: "add" | "edit" | "delete" }`.
  - `getItemContent(path: string, commitId: string): Promise<string | null>` — returns file text at commit, or `null` if not found (404).

- [ ] **Step 1: Add fixtures**

`apps/server/test/fixtures/ado-commits.json`:
```json
{ "count": 2, "value": [
  { "commitId": "def456", "comment": "Neue Decision: Versionierung", "author": { "name": "Anna Roth", "email": "anna@x.de", "date": "2026-07-19T10:00:00Z" } },
  { "commitId": "abc123", "comment": "Node 22 als Basis-Image", "author": { "name": "Anna Roth", "email": "anna@x.de", "date": "2026-07-15T09:00:00Z" } }
]}
```

`apps/server/test/fixtures/ado-changes.json`:
```json
{ "changes": [
  { "item": { "path": "/docs/decisions/adr-013.md", "isFolder": false }, "changeType": "add" },
  { "item": { "path": "/README.md", "isFolder": false }, "changeType": "edit" }
]}
```

`apps/server/test/fixtures/ado-item.json`:
```json
{ "content": "# ADR-013\n\nInhalt." }
```

- [ ] **Step 2: Write the failing test**

`apps/server/test/adoClient.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AdoClient } from "../src/ado/adoClient.js";
import { loadConfig } from "../src/config.js";

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => JSON.parse(readFileSync(join(dir, "fixtures", n), "utf8"));

const cfg = loadConfig({
  ADO_BASE_URL: "https://ado.example.com", ADO_COLLECTION: "DefaultCollection",
  ADO_PROJECT: "mira", ADO_REPO: "mira", ADO_PAT: "secret",
} as any);

function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    for (const key of Object.keys(routes)) {
      if (url.includes(key)) return { ok: true, status: 200, json: async () => routes[key] } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

describe("AdoClient", () => {
  it("lists commits newest first", async () => {
    const c = new AdoClient(cfg, fakeFetch({ "/commits": fx("ado-commits.json") }));
    const commits = await c.listCommits("main");
    expect(commits[0].commitId).toBe("def456");
    expect(commits[0].author.name).toBe("Anna Roth");
  });

  it("lists commit file changes with normalized paths", async () => {
    const c = new AdoClient(cfg, fakeFetch({ "/changes": fx("ado-changes.json") }));
    const changes = await c.listCommitChanges("def456");
    expect(changes).toContainEqual({ path: "docs/decisions/adr-013.md", changeType: "add" });
  });

  it("returns item content, or null on 404", async () => {
    const ok = new AdoClient(cfg, fakeFetch({ "/items": fx("ado-item.json") }));
    expect(await ok.getItemContent("docs/decisions/adr-013.md", "def456")).toBe("# ADR-013\n\nInhalt.");
    const missing = new AdoClient(cfg, fakeFetch({}));
    expect(await missing.getItemContent("x.md", "def456")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test/adoClient.test.ts`
Expected: FAIL — `../src/ado/adoClient.js` not found.

- [ ] **Step 4: Implement AdoClient**

`apps/server/src/ado/adoClient.ts`:
```ts
import type { Config } from "../config.js";

export interface AdoCommit { commitId: string; comment: string; author: { name: string; email: string; date: string } }
export interface AdoFileChange { path: string; changeType: "add" | "edit" | "delete" }

const API = "api-version=7.1";

export class AdoClient {
  constructor(private cfg: Config, private fetchFn: typeof fetch = fetch) {}

  private get base() {
    const c = this.cfg;
    return `${c.adoBaseUrl}/${c.adoCollection}/${c.adoProject}/_apis/git/repositories/${c.adoRepo}`;
  }
  private headers() {
    const token = Buffer.from(`:${this.cfg.adoPat}`).toString("base64");
    return { Authorization: `Basic ${token}`, Accept: "application/json" };
  }

  async listCommits(branch: string, top = 100): Promise<AdoCommit[]> {
    const url = `${this.base}/commits?searchCriteria.itemVersion.version=${encodeURIComponent(branch)}` +
      `&searchCriteria.$top=${top}&${API}`;
    const res = await this.fetchFn(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`ADO commits ${res.status}`);
    const body = await res.json() as { value: AdoCommit[] };
    return body.value;
  }

  async listCommitChanges(commitId: string): Promise<AdoFileChange[]> {
    const url = `${this.base}/commits/${commitId}/changes?${API}`;
    const res = await this.fetchFn(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`ADO changes ${res.status}`);
    const body = await res.json() as { changes: { item: { path: string; isFolder?: boolean }; changeType: string }[] };
    return body.changes
      .filter(c => !c.item.isFolder)
      .map(c => ({ path: c.item.path.replace(/^\//, ""), changeType: c.changeType as AdoFileChange["changeType"] }));
  }

  async getItemContent(path: string, commitId: string): Promise<string | null> {
    const url = `${this.base}/items?path=/${encodeURIComponent(path)}` +
      `&versionDescriptor.version=${commitId}&versionDescriptor.versionType=commit&includeContent=true&${API}`;
    const res = await this.fetchFn(url, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`ADO item ${res.status}`);
    const body = await res.json() as { content?: string };
    return body.content ?? null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run apps/server/test/adoClient.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ado/adoClient.ts apps/server/test/adoClient.test.ts apps/server/test/fixtures
git commit -m "feat(server): thin Azure DevOps REST client"
```

---

### Task 7: AdoPoller

**Files:**
- Create: `apps/server/src/ado/adoPoller.ts`
- Test: `apps/server/test/adoPoller.test.ts`

**Interfaces:**
- Consumes: `Store`, `ChangeService`, `Config`, `AdoClient`, shared types.
- Produces: `class AdoPoller` constructed `(cfg, store, changeService, adoClient, now: () => string, onChange?: (changeId: string, isNew: boolean) => void)`:
  - `pollOnce(): Promise<string[]>` — returns ids of changes created/updated this run. Behaviour:
    1. Fetch commits newest-first; take those strictly newer than `getLastSeenCommit` (stop at last seen).
    2. Process oldest→newest. For each commit, `listCommitChanges`, keep files whose path starts with any `scanPaths` entry.
    3. For each matching file, build a `Change`: `changeKind` from ADO (`add`→add, `edit`→modify, `delete`→delete); `newMd` = content at this commit (null for delete); `oldMd` = content at the parent commit for the first sighting in the cycle (null for add / no parent); `summary` = commit comment's first line; `cycleId` = open cycle.
    4. `upsertChange`. If the change already existed in the cycle, call `resetVotesForChange` (re-review). Then `ensureVotesForChange`.
    5. Advance `setLastSeenCommit` to the newest processed commit.

- [ ] **Step 1: Write the failing test**

`apps/server/test/adoPoller.test.ts`:
```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test/adoPoller.test.ts`
Expected: FAIL — `../src/ado/adoPoller.js` not found.

- [ ] **Step 3: Implement AdoPoller**

`apps/server/src/ado/adoPoller.ts`:
```ts
import { randomUUID } from "node:crypto";
import type { Change, ChangeKind } from "@guardian/shared";
import type { Config } from "../config.js";
import type { Store } from "../db/store.js";
import type { ChangeService } from "../domain/changeService.js";
import type { AdoClient, AdoCommit } from "./adoClient.js";

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
    return this.cfg.scanPaths.some(p => path === p || path.startsWith(p.endsWith("/") ? p : p + "/"));
  }

  async pollOnce(): Promise<string[]> {
    const { adoRepo: repo, adoBranch: branch } = this.cfg;
    const lastSeen = this.store.getLastSeenCommit(repo, branch);
    const all = await this.ado.listCommits(branch); // newest first
    const fresh: AdoCommit[] = [];
    for (const c of all) { if (c.commitId === lastSeen) break; fresh.push(c); }
    if (fresh.length === 0) return [];

    const cycle = this.store.getOpenCycle();
    if (!cycle) return [];

    const touched: string[] = [];
    // oldest -> newest so newest content wins on repeated files
    for (const commit of [...fresh].reverse()) {
      const fileChanges = await this.ado.listCommitChanges(commit.commitId);
      for (const fc of fileChanges) {
        if (!this.matches(fc.path)) continue;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/server/test/adoPoller.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ado/adoPoller.ts apps/server/test/adoPoller.test.ts
git commit -m "feat(server): ADO poller turning commits into review changes"
```

---

### Task 8: RealtimeHub

**Files:**
- Create: `apps/server/src/realtime/hub.ts`
- Test: `apps/server/test/hub.test.ts`

**Interfaces:**
- Consumes: nothing (transport-agnostic sink interface).
- Produces:
  - `interface Sink { send(data: string): void }`
  - `type HubEvent = { type: "change:new" | "change:updated" | "vote:updated" | "guardian:added"; changeId?: string }`
  - `class RealtimeHub`: `add(sink: Sink): void`, `remove(sink: Sink): void`, `broadcast(ev: HubEvent): void` (JSON-serializes; drops sinks whose `send` throws).

- [ ] **Step 1: Write the failing test**

`apps/server/test/hub.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { RealtimeHub } from "../src/realtime/hub.js";

describe("RealtimeHub", () => {
  it("broadcasts JSON to all sinks", () => {
    const hub = new RealtimeHub();
    const got: string[] = [];
    hub.add({ send: d => got.push(d) });
    hub.broadcast({ type: "change:new", changeId: "c1" });
    expect(JSON.parse(got[0])).toEqual({ type: "change:new", changeId: "c1" });
  });

  it("drops a sink that throws and keeps others", () => {
    const hub = new RealtimeHub();
    const good: string[] = [];
    hub.add({ send: () => { throw new Error("dead"); } });
    hub.add({ send: d => good.push(d) });
    hub.broadcast({ type: "vote:updated", changeId: "c1" });
    hub.broadcast({ type: "vote:updated", changeId: "c2" });
    expect(good).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test/hub.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement RealtimeHub**

`apps/server/src/realtime/hub.ts`:
```ts
export interface Sink { send(data: string): void }
export type HubEvent = {
  type: "change:new" | "change:updated" | "vote:updated" | "guardian:added";
  changeId?: string;
};

export class RealtimeHub {
  private sinks = new Set<Sink>();
  add(sink: Sink) { this.sinks.add(sink); }
  remove(sink: Sink) { this.sinks.delete(sink); }
  broadcast(ev: HubEvent) {
    const data = JSON.stringify(ev);
    for (const sink of [...this.sinks]) {
      try { sink.send(data); } catch { this.sinks.delete(sink); }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/server/test/hub.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/realtime/hub.ts apps/server/test/hub.test.ts
git commit -m "feat(server): realtime broadcast hub"
```

---

### Task 9: HTTP API (Fastify)

**Files:**
- Create: `apps/server/src/api/auth.ts`, `apps/server/src/api/httpApi.ts`
- Test: `apps/server/test/httpApi.test.ts`

**Interfaces:**
- Consumes: `Store`, `ChangeService`, `AuthService`, `RealtimeHub`, `Config`, shared types.
- Produces: `buildApp(deps: { store, changeService, authService, hub, config, now }): FastifyInstance`.
  Routes (all JSON; auth via `Authorization: Bearer <deviceToken>` except `/auth/*` and `/health`):
  - `GET /health` → `{ ok: true }`
  - `POST /auth/init` `{ setupCode, name, email }` → `{ deviceToken, guardian }`
  - `POST /auth/redeem` `{ code }` → `{ deviceToken, guardian }`
  - `GET /me` → `{ guardian }`
  - `GET /changes` → `{ cycle, active: ChangeWithVotes[], accepted: ChangeWithVotes[], badge }`
  - `GET /changes/:id` → `ChangeWithVotes`
  - `POST /changes/:id/vote` `{ status, comment }` → `ChangeWithVotes` (validates comment rule; broadcasts `vote:updated`)
  - `GET /guardians` → `{ guardians, pending }`
  - `POST /guardians/invite` `{ name, email }` → `{ code }`
  - `GET /meeting` → `{ cycle, rejected, klaerung, accepted, outstanding }`
  - `POST /cycles/:id/close` `{ note }` → `{ ok: true }`
  - `GET /history` → `{ cycles }`

- [ ] **Step 1: Write the failing test**

`apps/server/test/httpApi.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";
import { ChangeService } from "../src/domain/changeService.js";
import { AuthService } from "../src/domain/authService.js";
import { RealtimeHub } from "../src/realtime/hub.js";
import { buildApp } from "../src/api/httpApi.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({
  ADO_BASE_URL: "https://ado.x", ADO_COLLECTION: "C", ADO_PROJECT: "P", ADO_REPO: "R", ADO_PAT: "s",
} as any);

let clock = 0; const now = () => `t${clock++}`;

function setup() {
  clock = 0;
  const store = new Store(":memory:");
  store.ensureSetupCode("MB-INIT-7743");
  const changeService = new ChangeService(store);
  const authService = new AuthService(store, changeService, now);
  const hub = new RealtimeHub();
  const app = buildApp({ store, changeService, authService, hub, config, now });
  return { store, changeService, authService, app };
}

describe("HTTP API", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(); });

  async function initFounder() {
    const res = await ctx.app.inject({ method: "POST", url: "/auth/init",
      payload: { setupCode: "MB-INIT-7743", name: "Anna Roth", email: "anna@x.de" } });
    return JSON.parse(res.body).deviceToken as string;
  }

  it("health needs no auth", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("rejects unauthenticated /changes", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/changes" });
    expect(res.statusCode).toBe(401);
  });

  it("init then list changes (empty active) with badge 0", async () => {
    const token = await initFounder();
    const res = await ctx.app.inject({ method: "GET", url: "/changes", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.active).toEqual([]);
    expect(body.badge).toBe(0);
  });

  it("enforces the comment rule on votes", async () => {
    const token = await initFounder();
    const cycle = ctx.store.getOpenCycle()!;
    ctx.store.upsertChange({ id: "c1", repo: "R", branch: "main", filePath: "memory-bank/a.md",
      changeKind: "modify", commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de",
      committedAt: "t", summary: "s", oldMd: "o", newMd: "n", cycleId: cycle.id, firstSeenAt: "t" });
    ctx.changeService.ensureVotesForChange("c1", now());

    const bad = await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
      headers: { authorization: `Bearer ${token}` }, payload: { status: "abgelehnt", comment: "no" } });
    expect(bad.statusCode).toBe(400);

    const ok = await ctx.app.inject({ method: "POST", url: "/changes/c1/vote",
      headers: { authorization: `Bearer ${token}` }, payload: { status: "abgelehnt", comment: "Bitte zuerst Specs migrieren." } });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).votes[0].status).toBe("abgelehnt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test/httpApi.test.ts`
Expected: FAIL — `../src/api/httpApi.js` not found.

- [ ] **Step 3: Implement auth guard**

`apps/server/src/api/auth.ts`:
```ts
import type { FastifyRequest, FastifyReply } from "fastify";
import type { Guardian } from "@guardian/shared";
import type { AuthService } from "../domain/authService.js";

declare module "fastify" {
  interface FastifyRequest { guardian?: Guardian }
}

export function makeAuthHook(authService: AuthService) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const guardian = token ? authService.guardianForToken(token) : undefined;
    if (!guardian) { reply.code(401).send({ error: "nicht angemeldet" }); return; }
    req.guardian = guardian;
  };
}
```

- [ ] **Step 4: Implement the app factory**

`apps/server/src/api/httpApi.ts`:
```ts
import Fastify, { type FastifyInstance } from "fastify";
import type { ChangeWithVotes, VoteStatus } from "@guardian/shared";
import type { Store } from "../db/store.js";
import type { ChangeService } from "../domain/changeService.js";
import { AuthService, AuthError } from "../domain/authService.js";
import type { RealtimeHub } from "../realtime/hub.js";
import { type Config, deepLink } from "../config.js";
import { makeAuthHook } from "./auth.js";

export interface ApiDeps {
  store: Store; changeService: ChangeService; authService: AuthService;
  hub: RealtimeHub; config: Config; now: () => string;
}

const COMMENT_REQUIRED: VoteStatus[] = ["klaerung", "abgelehnt"];

export function buildApp(deps: ApiDeps): FastifyInstance {
  const { store, changeService, authService, hub, config, now } = deps;
  const app = Fastify({ logger: false });
  const authHook = makeAuthHook(authService);

  const withVotes = (id: string): ChangeWithVotes | undefined => {
    const c = store.getChange(id);
    if (!c) return undefined;
    return { ...c, votes: store.listVotesByChange(id), adoLink: deepLink(config, c.commitId, c.filePath) };
  };

  app.get("/health", async () => ({ ok: true }));

  app.post("/auth/init", async (req, reply) => {
    const { setupCode, name, email } = req.body as any;
    try { return authService.initFounder(setupCode, name, email); }
    catch (e) { if (e instanceof AuthError) return reply.code(400).send({ error: e.message }); throw e; }
  });
  app.post("/auth/redeem", async (req, reply) => {
    const { code } = req.body as any;
    try { const r = authService.redeem(code); hub.broadcast({ type: "guardian:added" }); return r; }
    catch (e) { if (e instanceof AuthError) return reply.code(400).send({ error: e.message }); throw e; }
  });

  app.register(async (secured) => {
    secured.addHook("preHandler", authHook);

    secured.get("/me", async (req) => ({ guardian: req.guardian }));

    secured.get("/changes", async (req) => {
      const cycle = store.getOpenCycle();
      if (!cycle) return { cycle: null, active: [], accepted: [], badge: 0 };
      return {
        cycle,
        active: changeService.activeChanges(cycle.id).map(c => withVotes(c.id)!),
        accepted: changeService.acceptedChanges(cycle.id).map(c => withVotes(c.id)!),
        badge: changeService.badgeCount(cycle.id, req.guardian!.id),
      };
    });

    secured.get("/changes/:id", async (req, reply) => {
      const c = withVotes((req.params as any).id);
      return c ?? reply.code(404).send({ error: "unbekannt" });
    });

    secured.post("/changes/:id/vote", async (req, reply) => {
      const id = (req.params as any).id;
      const { status, comment } = req.body as { status: VoteStatus; comment?: string };
      if (!store.getChange(id)) return reply.code(404).send({ error: "unbekannt" });
      const trimmed = (comment ?? "").trim();
      if (COMMENT_REQUIRED.includes(status) && trimmed.length < 5)
        return reply.code(400).send({ error: "Kommentar erforderlich (min. 5 Zeichen)." });
      store.upsertVote({ changeId: id, guardianId: req.guardian!.id, status,
        comment: COMMENT_REQUIRED.includes(status) ? trimmed : null, updatedAt: now() });
      hub.broadcast({ type: "vote:updated", changeId: id });
      return withVotes(id)!;
    });

    secured.get("/guardians", async () => ({
      guardians: store.listGuardians(), pending: store.listOpenInviteCodes(),
    }));
    secured.post("/guardians/invite", async (req, reply) => {
      const { name, email } = req.body as any;
      try { return authService.invite(req.guardian!.id, name, email); }
      catch (e) { if (e instanceof AuthError) return reply.code(400).send({ error: e.message }); throw e; }
    });

    secured.get("/meeting", async () => {
      const cycle = store.getOpenCycle();
      if (!cycle) return { cycle: null, rejected: [], klaerung: [], accepted: [], outstanding: 0 };
      const g = changeService.meetingGroups(cycle.id);
      return {
        cycle,
        rejected: g.rejected.map(c => withVotes(c.id)!),
        klaerung: g.klaerung.map(c => withVotes(c.id)!),
        accepted: g.accepted.map(c => withVotes(c.id)!),
        outstanding: g.outstanding,
      };
    });

    secured.post("/cycles/:id/close", async (req) => {
      const { note } = (req.body as any) ?? {};
      store.closeCycle((req.params as any).id, now(), note ?? null);
      return { ok: true };
    });

    secured.get("/history", async () => ({ cycles: store.listCycles().filter(c => c.closedAt) }));
  });

  return app;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run apps/server/test/httpApi.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/api apps/server/test/httpApi.test.ts
git commit -m "feat(server): REST API with device-token auth and vote validation"
```

---

### Task 10: Bootstrap + WebSocket + Docker

**Files:**
- Create: `apps/server/src/main.ts`, `apps/server/Dockerfile`, `docker-compose.yml`
- Modify: `apps/server/package.json` (add `@fastify/websocket` already present)

**Interfaces:**
- Consumes: everything above.
- Produces: a runnable server. On first start (no guardians) it ensures a setup code and logs it. Registers `/ws` (guarded by `?token=`), a poll loop every `pollIntervalSeconds`, wiring poller `onChange` → `hub.broadcast`.

- [ ] **Step 1: Implement main.ts**

`apps/server/src/main.ts`:
```ts
import websocket from "@fastify/websocket";
import { loadConfig } from "./config.js";
import { Store } from "./db/store.js";
import { ChangeService } from "./domain/changeService.js";
import { AuthService } from "./domain/authService.js";
import { RealtimeHub, type Sink } from "./realtime/hub.js";
import { AdoClient } from "./ado/adoClient.js";
import { AdoPoller } from "./ado/adoPoller.js";
import { buildApp } from "./api/httpApi.js";
import { generateCode } from "./domain/codes.js";

const now = () => new Date().toISOString();

async function bootstrap() {
  const config = loadConfig(process.env);
  const store = new Store(config.dbPath);

  // Ensure a setup code exists; log it while the instance is uninitialized.
  const state = store.getSetupState();
  if (!state.setupCode) store.ensureSetupCode(generateCode("MB-INIT"));
  const fresh = store.getSetupState();
  if (!fresh.initializedAt) {
    console.log(`▸ Keine Hüter gefunden — Erst-Setup aktiv`);
    console.log(`▸ Setup-Code: ${fresh.setupCode} (einmalig gültig)`);
  }

  const changeService = new ChangeService(store);
  const authService = new AuthService(store, changeService, now);
  const hub = new RealtimeHub();
  const ado = new AdoClient(config);
  const poller = new AdoPoller(config, store, changeService, ado, now,
    (changeId, isNew) => hub.broadcast({ type: isNew ? "change:new" : "change:updated", changeId }));

  const app = buildApp({ store, changeService, authService, hub, config, now });
  await app.register(websocket);
  app.get("/ws", { websocket: true }, (socket, req) => {
    const token = new URL(req.url ?? "", "http://x").searchParams.get("token") ?? "";
    if (!authService.guardianForToken(token)) { socket.close(); return; }
    const sink: Sink = { send: (d) => socket.send(d) };
    hub.add(sink);
    socket.on("close", () => hub.remove(sink));
  });

  const tick = async () => {
    try { await poller.pollOnce(); }
    catch (e) { console.error("Poll fehlgeschlagen:", (e as Error).message); }
  };
  setInterval(tick, config.pollIntervalSeconds * 1000);
  void tick();

  await app.listen({ port: config.httpPort, host: "0.0.0.0" });
  console.log(`guardian-server hört auf :${config.httpPort}`);
}

bootstrap().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dockerfile**

`apps/server/Dockerfile`:
```dockerfile
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @guardian/shared build && pnpm --filter @guardian/server build

FROM node:22-slim
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/server
EXPOSE 4000
CMD ["node", "dist/main.js"]
```

- [ ] **Step 3: docker-compose.yml**

`docker-compose.yml`:
```yaml
services:
  guardian-server:
    build: { context: ., dockerfile: apps/server/Dockerfile }
    ports: ["4000:4000"]
    environment:
      ADO_BASE_URL: ${ADO_BASE_URL}
      ADO_COLLECTION: ${ADO_COLLECTION}
      ADO_PROJECT: ${ADO_PROJECT}
      ADO_REPO: ${ADO_REPO}
      ADO_BRANCH: ${ADO_BRANCH:-main}
      ADO_PAT: ${ADO_PAT}
      POLL_INTERVAL_SECONDS: ${POLL_INTERVAL_SECONDS:-60}
      SCAN_PATHS: ${SCAN_PATHS:-docs/decisions,docs/learnings,memory-bank}
      DB_PATH: /data/guardian.sqlite
      HTTP_PORT: "4000"
    volumes: ["guardian-data:/data"]
volumes:
  guardian-data:
```

- [ ] **Step 4: Verify build + full test suite**

Run: `pnpm install && pnpm -r build && pnpm vitest run`
Expected: build succeeds; all tests from Tasks 1–9 PASS.

- [ ] **Step 5: Smoke-test the setup-code log (no ADO needed)**

Run:
```bash
cd apps/server && ADO_BASE_URL=https://ado.x ADO_COLLECTION=C ADO_PROJECT=P ADO_REPO=R ADO_PAT=x \
  DB_PATH=./smoke.sqlite node dist/main.js
```
Expected: logs `▸ Setup-Code: MB-INIT-XXXX (einmalig gültig)` and `guardian-server hört auf :4000`. Stop with Ctrl-C; delete `smoke.sqlite`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/main.ts apps/server/Dockerfile docker-compose.yml
git commit -m "feat(server): bootstrap, WebSocket endpoint, and Docker packaging"
```

---

## Self-Review

**Spec coverage:**

- §4 architecture (server, poller, store, change service, auth, api, hub) → Tasks 2–10. ✓
- §5 data model (all tables) → Task 2 schema. ✓
- §6 ADO commit polling, old/new content, add/mod/delete, per-file-per-cycle, vote-reset on re-change, deep-link, PAT server-only → Tasks 5–7. ✓ (Parent-content baseline for a modify's first sighting is a documented v1 limitation — `oldMd=null`; see note below.)
- §7 mechanical diff → **belongs to the widget plan** (diff is rendered client-side per spec §7); server stores `oldMd`/`newMd` only. Noted, not a gap.
- §8 onboarding (setup code, invite, redeem, device token, vote-backfill) → Task 4. ✓
- §9 statuses, comment rule, all-accepted, cycle close → Tasks 3, 9. ✓
- §11 API + WS events → Tasks 8–10. ✓
- §12 config → Task 5. ✓
- §13 error handling (ADO down → poll try/catch keeps state; bad code → 400; unique vote) → Tasks 7, 9, 2. ✓
- §15 test strategy → every task is TDD. ✓

**Placeholder scan:** No TBD/TODO. The one deliberate limitation (modify/delete first-sighting baseline `oldMd=null`) is explicit and matches spec §6's "Rename/Move = delete+add" pragmatism. If richer baselines are wanted later, add a parent-commit lookup in `AdoPoller` (fetch `getItemContent(path, parentCommitId)`), which requires reading `commit.parents` — out of scope for v1.

**Type consistency:** `VoteStatus`/`ChangeKind` come from `@guardian/shared` everywhere. `Store` method names match their callers in `ChangeService`, `AuthService`, `AdoPoller`, `httpApi`. `ChangeWithVotes` (shared) is the single API change shape (adds `votes` + `adoLink`). `HubEvent.type` values match those broadcast in `httpApi` and `main`. `now: () => string` injected consistently for deterministic tests.

**Known follow-ups for the widget plan (Plan 2):** client-side markdown diff engine (§7), Catppuccin theming + all screens (§10), WebSocket client + device-token storage, toast/badge, the four main-window tabs.
