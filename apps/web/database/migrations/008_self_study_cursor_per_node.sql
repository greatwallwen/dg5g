CREATE TABLE self_study_cursors_v8 (
  student_id TEXT NOT NULL,
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  unit_id TEXT,
  action_id TEXT,
  action_index INTEGER NOT NULL DEFAULT 0 CHECK (action_index >= 0),
  position_ms INTEGER NOT NULL DEFAULT 0 CHECK (position_ms >= 0),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, node_id),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

INSERT INTO self_study_cursors_v8 (
  student_id, node_id, unit_id, action_id, action_index, position_ms, is_active, updated_at
)
SELECT student_id, node_id, unit_id, action_id, action_index, position_ms, 1, updated_at
FROM self_study_cursors
WHERE context_id = 'self-study';

DROP TABLE self_study_cursors;
ALTER TABLE self_study_cursors_v8 RENAME TO self_study_cursors;

CREATE UNIQUE INDEX self_study_cursors_one_active_idx
  ON self_study_cursors(student_id)
  WHERE is_active = 1;

CREATE INDEX self_study_cursors_updated_idx
  ON self_study_cursors(student_id, updated_at DESC, node_id);
