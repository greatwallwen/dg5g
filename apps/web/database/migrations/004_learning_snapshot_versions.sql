-- The topic/version table was introduced with the system schema. Backfill one
-- independent optimistic-concurrency topic for every existing student while
-- preserving the monotonic global topic used by cross-surface snapshots.
INSERT INTO snapshot_versions (topic, version, updated_at)
VALUES ('global', 0, CURRENT_TIMESTAMP)
ON CONFLICT(topic) DO NOTHING;

INSERT INTO snapshot_versions (topic, version, updated_at)
SELECT 'learning:' || id, 0, CURRENT_TIMESTAMP
FROM users
WHERE role = 'student'
ON CONFLICT(topic) DO NOTHING;
