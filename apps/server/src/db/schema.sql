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
  summary TEXT NOT NULL, old_md TEXT, new_md TEXT, previous_path TEXT,
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
