import { istBilddatei, type Change, type Vote, type VoteStatus } from "@guardian/shared";
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

  // Selbstheilung beim Serverstart. Fehlt einem Hüter die Bewertungszeile, hat
  // er im Widget nichts zum Anklicken — passiert, sobald Änderungen eingelesen
  // wurden, bevor es überhaupt Hüter gab. Gibt zurück, wie viele Zeilen
  // nachgezogen wurden.
  repairMissingVotes(now: string): number {
    const guardians = this.store.listGuardians();
    let added = 0;
    for (const c of this.store.listAllChanges()) {
      const have = new Set(this.votes(c.id).map(v => v.guardianId));
      for (const g of guardians) {
        if (have.has(g.id)) continue;
        this.store.upsertVote({ changeId: c.id, guardianId: g.id, status: "offen", comment: null, updatedAt: now });
        added++;
      }
    }
    return added;
  }

  /**
   * Altlast aufräumen: Bilder, die vor der Bildanzeige erfasst wurden, tragen
   * ihren Binärinhalt als beschädigte Zeichenkette in der Datenbank. Angezeigt
   * wird der nicht mehr — die Volltextsuche liest ihn aber weiter mit und
   * liefert dann Treffer mitten im Bildrauschen. Liefert die Zahl der
   * bereinigten Einträge.
   */
  verwerfeBildtexte(): number {
    let bereinigt = 0;
    for (const c of this.store.listAllChanges()) {
      if (!istBilddatei(c.filePath)) continue;
      if (c.oldMd === null && c.newMd === null) continue;
      this.store.clearContent(c.id);
      bereinigt++;
    }
    return bereinigt;
  }

  // Altlast aufräumen: Bis die Umbenennungs-Flags von ADO ausgewertet wurden,
  // landete die Quellseite jeder Verschiebung als Änderung ohne alten und ohne
  // neuen Inhalt in der Liste. Solche Einträge zeigen nichts an und lassen sich
  // nicht sinnvoll bewerten. Löschungen bleiben (leer ist dort korrekt), und
  // alles, wozu schon jemand Stellung genommen hat, bleibt ebenfalls stehen.
  purgeContentlessChanges(): number {
    let removed = 0;
    for (const c of this.store.listAllChanges()) {
      if (c.changeKind === "delete") continue;
      // Bilder sind hier immer "leer": ihr Inhalt steht nicht in der Datenbank,
      // sondern wird beim Anzeigen geholt. Sie zeigen trotzdem etwas an.
      if (istBilddatei(c.filePath)) continue;
      if ((c.newMd ?? "") !== "" || (c.oldMd ?? "") !== "") continue;
      if (this.votes(c.id).some(v => v.status !== "offen")) continue;
      this.store.deleteChange(c.id);
      removed++;
    }
    return removed;
  }
}
