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

  // Alles, was noch nicht von allen Hütern akzeptiert ist — zyklusfrei,
  // damit Unerledigtes nicht mit dem Wochenwechsel aus dem Blick fällt.
  // Sortierung worst-first: abgelehnt → Klärungsbedarf → ausstehend.
  openChanges(): Change[] {
    return this.store.listAllChanges()
      .filter(c => !this.allAccepted(c.id))
      .sort((a, b) => RANK[this.stripeStatus(b.id)] - RANK[this.stripeStatus(a.id)]);
  }

  private myStatus(changeId: string, guardianId: string) {
    return this.votes(changeId).find(v => v.guardianId === guardianId)?.status;
  }

  // Meine Arbeitsliste: alles Unerledigte, das ich noch nicht akzeptiert habe
  // (auch von mir Abgelehntes — das bleibt offen, bis es geklärt ist).
  toRate(guardianId: string): Change[] {
    return this.openChanges().filter(c => this.myStatus(c.id, guardianId) !== "akzeptiert");
  }
  // Von mir akzeptiert, wartet noch auf andere Hüter.
  acceptedByMe(guardianId: string): Change[] {
    return this.openChanges().filter(c => this.myStatus(c.id, guardianId) === "akzeptiert");
  }

  badgeCount(guardianId: string): number {
    return this.store.listAllChanges()
      .filter(c => !this.allAccepted(c.id) && this.myStatus(c.id, guardianId) === "offen").length;
  }

  // Echte Streitfälle fürs Team: abgelehnt oder mit Klärungsbedarf. Rein
  // ausstehende Bewertungen gehören nicht hierher — sie erscheinen nur als
  // Zähler, sonst ertränken sie die Liste.
  meetingChanges(): Change[] {
    return this.openChanges().filter(c => {
      const s = this.stripeStatus(c.id);
      return s === "abgelehnt" || s === "klaerung";
    });
  }

  // Zähler für die Hüter-Übersicht: wie viele Änderungen je schlechtestem Status.
  meetingCounts() {
    const open = this.openChanges();
    const by = (s: VoteStatus) => open.filter(c => this.stripeStatus(c.id) === s).length;
    return { abgelehnt: by("abgelehnt"), klaerung: by("klaerung"), offen: by("offen"), gesamt: open.length };
  }

  ensureVotesForChange(changeId: string, now: string) {
    const existing = new Set(this.votes(changeId).map(v => v.guardianId));
    for (const g of this.store.listGuardians()) {
      if (!existing.has(g.id)) {
        this.store.upsertVote({ changeId, guardianId: g.id, status: "offen", comment: null, updatedAt: now });
      }
    }
  }
  // Neuer Hüter: bekommt für alles noch Unerledigte eine offene Bewertung.
  backfillVotesForGuardian(guardianId: string, now: string) {
    for (const c of this.store.listAllChanges()) {
      if (this.allAccepted(c.id)) continue;
      const has = this.votes(c.id).some(v => v.guardianId === guardianId);
      if (!has) this.store.upsertVote({ changeId: c.id, guardianId, status: "offen", comment: null, updatedAt: now });
    }
  }
}
