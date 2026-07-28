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
