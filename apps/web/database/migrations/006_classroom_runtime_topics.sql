INSERT INTO snapshot_versions (topic, version, updated_at)
SELECT 'classroom:' || session_id, revision, updated_at
FROM classroom_sessions
WHERE 1 = 1
ON CONFLICT(topic) DO UPDATE SET
  version = MAX(snapshot_versions.version, excluded.version),
  updated_at = CASE
    WHEN excluded.version > snapshot_versions.version THEN excluded.updated_at
    ELSE snapshot_versions.updated_at
  END;

CREATE INDEX IF NOT EXISTS classroom_commands_latest_idx
  ON classroom_commands(session_id, revision DESC);

CREATE INDEX IF NOT EXISTS command_acks_command_idx
  ON command_acks(command_id, acknowledged_at, device_id);
