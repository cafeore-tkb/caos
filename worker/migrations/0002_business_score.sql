ALTER TABLE runs ADD COLUMN business_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN revenue INTEGER NOT NULL DEFAULT 0;
CREATE INDEX runs_business_ranking ON runs(mode,rules_version,business_score DESC) WHERE completed_at IS NOT NULL;
