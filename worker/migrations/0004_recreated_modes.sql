-- Extend the mode constraint without removing any existing runs or participant links.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE runs_extended (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  mode TEXT NOT NULL CHECK(mode IN ('fast','middle','full','butchi','shawn')),
  seed INTEGER NOT NULL,
  rules_version TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  score INTEGER CHECK(score BETWEEN 0 AND 100),
  done INTEGER, total INTEGER, quality INTEGER, elapsed_sec INTEGER,
  passed INTEGER, result_json TEXT, trace_hash TEXT,
  business_score INTEGER NOT NULL DEFAULT 0,
  revenue INTEGER NOT NULL DEFAULT 0,
  participant_id TEXT REFERENCES participants(id)
);
INSERT INTO runs_extended (
  id,player_id,mode,seed,rules_version,started_at,completed_at,score,
  done,total,quality,elapsed_sec,passed,result_json,trace_hash,business_score,revenue,participant_id
) SELECT
  id,player_id,mode,seed,rules_version,started_at,completed_at,score,
  done,total,quality,elapsed_sec,passed,result_json,trace_hash,business_score,revenue,participant_id
FROM runs;
DROP TABLE runs;
ALTER TABLE runs_extended RENAME TO runs;
CREATE INDEX runs_ranking ON runs(mode,rules_version,score DESC,player_id);
CREATE INDEX runs_player ON runs(player_id,completed_at DESC);
CREATE INDEX runs_business_ranking ON runs(mode,rules_version,business_score DESC) WHERE completed_at IS NOT NULL;
CREATE INDEX runs_participant ON runs(participant_id,mode,rules_version,completed_at DESC);
