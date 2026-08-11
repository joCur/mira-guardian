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
    this.migrate();
  }

  // schema.sql legt nur an, was fehlt — bestehende Tabellen lässt es
  // unangetastet. Neue Spalten müssen deshalb hier nachgezogen werden.
  private migrate() {
    const columns = (table: string) =>
      (this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name);
    if (!columns("change_item").includes("previous_path")) {
      this.db.exec("ALTER TABLE change_item ADD COLUMN previous_path TEXT");
    }
    if (!columns("change_item").includes("baseline_commit_id")) {
      this.db.exec("ALTER TABLE change_item ADD COLUMN baseline_commit_id TEXT");
    }
    // Bestandsdaten fassen womöglich schon mehrere Commits zusammen, ihr
    // Zwischenstand ist aber nicht mehr da. Sie starten deshalb als
    // Ein-Commit-Eintrag: kein Umschalter, dafür auch keine falsche Auskunft
    // darüber, was der jüngste Commit gebracht hat.
    if (!columns("change_item").includes("previous_new_md")) {
      this.db.exec("ALTER TABLE change_item ADD COLUMN previous_new_md TEXT");
    }
    if (!columns("change_item").includes("commit_count")) {
      this.db.exec("ALTER TABLE change_item ADD COLUMN commit_count INTEGER NOT NULL DEFAULT 1");
    }
    if (!columns("invite_code").includes("guardian_id")) {
      this.db.exec("ALTER TABLE invite_code ADD COLUMN guardian_id TEXT");
    }
    if (!columns("invite_code").includes("expires_at")) {
      this.db.exec("ALTER TABLE invite_code ADD COLUMN expires_at TEXT");
    }
    // Geräte aus der Zeit ohne Anlagedatum: der letzte Kontakt ist die beste
    // bekannte Untergrenze, sonst stünde in der Geräteliste eine Lücke.
    if (!columns("device").includes("created_at")) {
      this.db.exec("ALTER TABLE device ADD COLUMN created_at TEXT");
      this.db.exec("UPDATE device SET created_at = last_seen_at WHERE created_at IS NULL");
    }
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

  insertInviteCode(c: { code: string; name: string; email: string; createdBy: string; createdAt: string;
    guardianId?: string | null; expiresAt?: string | null }) {
    this.db.prepare(`INSERT INTO invite_code (code,name,email,created_by,created_at,guardian_id,expires_at)
      VALUES (@code,@name,@email,@createdBy,@createdAt,@guardianId,@expiresAt)`)
      .run({ guardianId: null, expiresAt: null, ...c });
  }
  getInviteCode(code: string) {
    return this.db.prepare(`SELECT code,name,email,redeemed_at AS redeemedAt,
      guardian_id AS guardianId, expires_at AS expiresAt FROM invite_code WHERE code = ?`).get(code) as
      { code: string; name: string; email: string; redeemedAt: string | null;
        guardianId: string | null; expiresAt: string | null } | undefined;
  }
  markInviteRedeemed(code: string, guardianId: string, now: string) {
    this.db.prepare("UPDATE invite_code SET redeemed_at = ?, redeemed_by = ? WHERE code = ?").run(now, guardianId, code);
  }
  // Nur echte Einladungen: die warten auf einen neuen Hüter und gehören
  // deshalb in die Übersicht. Codes für ein bestehendes Profil sind ein
  // Vorgang zwischen zwei Geräten und werden einmalig angezeigt.
  listOpenInviteCodes() {
    return this.db.prepare(`SELECT code,name,email FROM invite_code
      WHERE redeemed_at IS NULL AND guardian_id IS NULL ORDER BY created_at`).all() as
      { code: string; name: string; email: string }[];
  }
  deleteOpenRelinkCodes(guardianId: string) {
    this.db.prepare("DELETE FROM invite_code WHERE guardian_id = ? AND redeemed_at IS NULL").run(guardianId);
  }

  insertDevice(d: { id: string; guardianId: string; token: string; label: string; lastSeenAt: string; createdAt: string }) {
    this.db.prepare(`INSERT INTO device (id,guardian_id,token,label,last_seen_at,created_at)
      VALUES (@id,@guardianId,@token,@label,@lastSeenAt,@createdAt)`).run(d);
  }
  getDeviceByToken(token: string) {
    return this.db.prepare(`SELECT id, guardian_id AS guardianId, last_seen_at AS lastSeenAt
      FROM device WHERE token = ?`).get(token) as
      { id: string; guardianId: string; lastSeenAt: string } | undefined;
  }
  listDevices(guardianId: string) {
    return this.db.prepare(`SELECT id, label, created_at AS createdAt, last_seen_at AS lastSeenAt
      FROM device WHERE guardian_id = ? ORDER BY created_at`).all(guardianId) as
      { id: string; label: string; createdAt: string; lastSeenAt: string }[];
  }
  // Die Hüter-Bindung steht in der Bedingung, damit kein fremdes Gerät
  // entzogen werden kann, auch wenn die ID stimmt.
  deleteDevice(id: string, guardianId: string): boolean {
    return this.db.prepare("DELETE FROM device WHERE id = ? AND guardian_id = ?").run(id, guardianId).changes > 0;
  }
  touchDevice(id: string, now: string) {
    this.db.prepare("UPDATE device SET last_seen_at = ? WHERE id = ?").run(now, id);
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
    oldMd: r.old_md, newMd: r.new_md, previousPath: r.previous_path,
    baselineCommitId: r.baseline_commit_id ?? null,
    previousNewMd: r.previous_new_md ?? null, commitCount: r.commit_count ?? 1,
    cycleId: r.cycle_id, firstSeenAt: r.first_seen_at });
  upsertChange(c: Change) {
    // Zwei Wege, weil ein Eintrag über zwei Schlüssel identifiziert wird: über
    // seine id (dann darf er auch den Pfad wechseln — beim Verschieben — und den
    // Zyklus) und über (Zyklus, Pfad), wenn derselbe Pfad erneut eingelesen
    // wird. SQLite kann nur ein Konfliktziel pro Statement behandeln.
    const known = this.db.prepare("SELECT 1 FROM change_item WHERE id = ?").get(c.id);
    if (known) {
      this.db.prepare(`UPDATE change_item SET
        repo=@repo, branch=@branch, file_path=@filePath, change_kind=@changeKind,
        commit_id=@commitId, commit_short=@commitShort, author_name=@authorName,
        author_email=@authorEmail, committed_at=@committedAt, summary=@summary,
        old_md=@oldMd, new_md=@newMd, previous_path=@previousPath,
        baseline_commit_id=@baselineCommitId, cycle_id=@cycleId,
        first_seen_at=@firstSeenAt, previous_new_md=@previousNewMd, commit_count=@commitCount
        WHERE id=@id`).run(c);
      return;
    }
    this.db.prepare(`INSERT INTO change_item
      (id,repo,branch,file_path,change_kind,commit_id,commit_short,author_name,author_email,committed_at,summary,old_md,new_md,previous_path,baseline_commit_id,previous_new_md,commit_count,cycle_id,first_seen_at)
      VALUES (@id,@repo,@branch,@filePath,@changeKind,@commitId,@commitShort,@authorName,@authorEmail,@committedAt,@summary,@oldMd,@newMd,@previousPath,@baselineCommitId,@previousNewMd,@commitCount,@cycleId,@firstSeenAt)
      ON CONFLICT (cycle_id, file_path) DO UPDATE SET
        change_kind=excluded.change_kind, commit_id=excluded.commit_id, commit_short=excluded.commit_short,
        author_name=excluded.author_name, author_email=excluded.author_email, committed_at=excluded.committed_at,
        summary=excluded.summary, new_md=excluded.new_md, previous_path=excluded.previous_path,
        previous_new_md=excluded.previous_new_md, commit_count=excluded.commit_count`).run(c);
  }
  getChange(id: string): Change | undefined {
    const r = this.db.prepare("SELECT * FROM change_item WHERE id = ?").get(id);
    return r ? this.mapChange(r) : undefined;
  }
  // Eine Änderung je Repo/Branch/Dateipfad — ohne Wochen-Zyklus ist der Pfad
  // die Identität. Ein neuer Commit aktualisiert denselben Eintrag.
  getChangeByPath(repo: string, branch: string, filePath: string): Change | undefined {
    const r = this.db.prepare(
      "SELECT * FROM change_item WHERE repo = ? AND branch = ? AND file_path = ?",
    ).get(repo, branch, filePath);
    return r ? this.mapChange(r) : undefined;
  }
  // Samt Bewertungen — es gibt keine Fremdschlüssel, die das erledigen.
  deleteChange(id: string) {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM vote WHERE change_id = ?").run(id);
      this.db.prepare("DELETE FROM change_item WHERE id = ?").run(id);
    })();
  }
  listAllChanges(): Change[] {
    return (this.db.prepare("SELECT * FROM change_item ORDER BY committed_at DESC").all() as any[]).map(this.mapChange);
  }
  // Einträge, denen die Vergleichsbasis fehlt. Neu angelegte Dokumente ("add")
  // und reines Verschieben ("rename") haben naturgemäß keine.
  listChangesWithoutBaseline(): Change[] {
    return (this.db.prepare(
      `SELECT * FROM change_item WHERE old_md IS NULL AND change_kind NOT IN ('add','rename')
       ORDER BY committed_at`).all() as any[]).map(this.mapChange);
  }
  setBaseline(id: string, oldMd: string) {
    this.db.prepare("UPDATE change_item SET old_md = ? WHERE id = ?").run(oldMd, id);
  }
  clearContent(id: string) {
    this.db.prepare("UPDATE change_item SET old_md = NULL, new_md = NULL WHERE id = ?").run(id);
  }
  // Bewertungsverlauf eines Hüters: nur abgegebene Bewertungen, neueste zuerst.
  listVotesByGuardian(guardianId: string): Array<Vote & { change: Change }> {
    const rows = this.db.prepare(`
      SELECT v.*, c.id AS c_id FROM vote v
      JOIN change_item c ON c.id = v.change_id
      WHERE v.guardian_id = ? AND v.status != 'offen'
      ORDER BY v.updated_at DESC
    `).all(guardianId) as any[];
    return rows.map(r => ({ ...this.mapVote(r), change: this.getChange(r.c_id)! }));
  }
  // Zyklusübergreifend: wurde dieser Stand (Datei aus diesem Commit) schon
  // einmal eingelesen? Grundlage für idempotente Re-Scans nach Cursor-Rewind.
  hasIngested(repo: string, branch: string, filePath: string, commitId: string): boolean {
    return !!this.db.prepare(
      "SELECT 1 FROM change_item WHERE repo = ? AND branch = ? AND file_path = ? AND commit_id = ? LIMIT 1",
    ).get(repo, branch, filePath, commitId);
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
