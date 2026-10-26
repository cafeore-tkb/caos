PRAGMA foreign_keys = ON;
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  mode TEXT NOT NULL CHECK(mode IN ('fast','middle','full')),
  seed INTEGER NOT NULL,
  rules_version TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  score INTEGER CHECK(score BETWEEN 0 AND 100),
  done INTEGER, total INTEGER, quality INTEGER, elapsed_sec INTEGER,
  passed INTEGER, result_json TEXT, trace_hash TEXT
);
CREATE INDEX runs_ranking ON runs(mode, rules_version, score DESC, player_id);
CREATE INDEX runs_player ON runs(player_id, completed_at DESC);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
