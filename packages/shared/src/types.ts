// "uebersprungen" ist kein Urteil, sondern die festgehaltene Auskunft, dass
// diese Stimme wegen Abwesenheit nicht eingeholt wurde. Bewusst nicht
// "akzeptiert": der Verlauf soll keine Zustimmung behaupten, die es nie gab.
// Nur der Server setzt ihn, über die API ist er nicht wählbar.
export const VOTE_STATUSES = ["offen", "akzeptiert", "klaerung", "abgelehnt", "uebersprungen"] as const;
export type VoteStatus = (typeof VOTE_STATUSES)[number];

/** Über die API wählbare Bewertungen — alles außer dem Server-Status. */
export const VOTE_STATUSES_WAEHLBAR: VoteStatus[] = VOTE_STATUSES.filter(s => s !== "uebersprungen");

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
  /** Abwesenheit als reine Datumsangaben "YYYY-MM-DD", beide Ränder inklusive. */
  absentFrom: string | null;
  absentUntil: string | null;
}

export interface Vote {
  changeId: string;
  guardianId: string;
  status: VoteStatus;
  comment: string | null;
  updatedAt: string;
  /** Gesetzt, wenn ich eine ohne mich entschiedene Änderung nachgelesen habe. */
  seenAt: string | null;
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
