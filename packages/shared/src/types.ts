export const VOTE_STATUSES = ["offen", "akzeptiert", "klaerung", "abgelehnt"] as const;
export type VoteStatus = (typeof VOTE_STATUSES)[number];

// "rename" = umbenannt oder verschoben, ohne dass sich der Inhalt geändert hat.
// Wurde zusätzlich am Inhalt gearbeitet, bleibt es "modify" — in beiden Fällen
// trägt die Änderung den alten Pfad in previousPath.
export const CHANGE_KINDS = ["add", "modify", "delete", "rename"] as const;
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
  /** Pfad vor dem Commit, wenn die Datei umbenannt oder verschoben wurde. */
  previousPath: string | null;
  /**
   * Der Commit, gegen dessen Vorgängerstand verglichen wird — der erste, mit
   * dem diese Änderung erfasst wurde. Bei Dokumenten steckt die Basis schon in
   * oldMd; bei Bildern wird sie erst beim Anzeigen geholt und braucht deshalb
   * den festgehaltenen Bezugspunkt. Null bei Einträgen aus der Zeit davor.
   */
  baselineCommitId: string | null;
  /**
   * Der Stand vor dem jüngsten Commit — also newMd, wie es vor der letzten
   * Fortschreibung aussah. Fasst ein Eintrag mehrere Commits zusammen, lässt
   * sich damit der jüngste für sich allein zeigen, ohne die gemeinsame
   * Vergleichsbasis anzutasten. Null, solange nur ein Commit erfasst ist.
   */
  previousNewMd: string | null;
  /** Wie viele Commits dieser Eintrag zusammenfasst; mindestens 1. */
  commitCount: number;
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

/** Ein verknüpftes Gerät eines Hüters. Der Token selbst verlässt den Server nie. */
export interface Device {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string;
  /** Das Gerät, von dem die Abfrage kommt — es lässt sich nur abmelden, nicht entziehen. */
  current: boolean;
}

/** Zugangscode, der ein weiteres Gerät mit einem bestehenden Profil verknüpft. */
export interface RelinkCode {
  code: string;
  expiresAt: string;
  guardianName: string;
}
