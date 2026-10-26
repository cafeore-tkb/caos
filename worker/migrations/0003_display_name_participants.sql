-- Keep legacy accounts and scores; new shared identities need only a display name.
CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
INSERT INTO participants(id,display_name,created_at)
SELECT MIN(id),TRIM(display_name),MIN(created_at) FROM players
WHERE TRIM(display_name)<>'' GROUP BY TRIM(display_name);
ALTER TABLE runs ADD COLUMN participant_id TEXT REFERENCES participants(id);
UPDATE runs SET participant_id=(
  SELECT participants.id FROM participants JOIN players ON participants.display_name=TRIM(players.display_name)
  WHERE players.id=runs.player_id
) WHERE completed_at IS NOT NULL;
CREATE INDEX runs_participant ON runs(participant_id,mode,rules_version,completed_at DESC);
