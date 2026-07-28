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
