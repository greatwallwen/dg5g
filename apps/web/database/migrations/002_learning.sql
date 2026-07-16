CREATE TABLE IF NOT EXISTS learning_events (
  event_id TEXT PRIMARY KEY CHECK (length(trim(event_id)) > 0),
  student_id TEXT NOT NULL,
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  channel TEXT NOT NULL DEFAULT 'self-study'
    CHECK (channel IN ('self-study', 'classroom', 'game')),
  event_type TEXT NOT NULL CHECK (length(trim(event_type)) > 0),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS learning_events_student_node_idx
  ON learning_events(student_id, node_id, occurred_at);

CREATE TABLE IF NOT EXISTS formal_attempts (
  attempt_id TEXT PRIMARY KEY CHECK (length(trim(attempt_id)) > 0),
  student_id TEXT NOT NULL,
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  game_id TEXT,
  score REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  mistake_knowledge_point_ids_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(mistake_knowledge_point_ids_json)),
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS formal_attempts_student_node_idx
  ON formal_attempts(student_id, node_id, completed_at);

CREATE TABLE IF NOT EXISTS professional_outputs (
  output_id TEXT PRIMARY KEY CHECK (length(trim(output_id)) > 0),
  student_id TEXT NOT NULL,
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'returned', 'verified')),
  content_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(content_json)),
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS professional_outputs_student_task_idx
  ON professional_outputs(student_id, task_id);

CREATE TABLE IF NOT EXISTS output_reviews (
  review_id TEXT PRIMARY KEY CHECK (length(trim(review_id)) > 0),
  output_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('returned', 'verified')),
  score REAL CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  feedback TEXT,
  reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (output_id) REFERENCES professional_outputs(output_id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX IF NOT EXISTS output_reviews_output_id_idx ON output_reviews(output_id);

CREATE TABLE IF NOT EXISTS self_study_cursors (
  student_id TEXT NOT NULL,
  context_id TEXT NOT NULL CHECK (length(trim(context_id)) > 0),
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  unit_id TEXT,
  action_id TEXT,
  action_index INTEGER NOT NULL DEFAULT 0 CHECK (action_index >= 0),
  position_ms INTEGER NOT NULL DEFAULT 0 CHECK (position_ms >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, context_id),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS frozen_task_scores (
  score_id TEXT PRIMARY KEY CHECK (length(trim(score_id)) > 0),
  student_id TEXT NOT NULL,
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  snapshot_version INTEGER NOT NULL CHECK (snapshot_version >= 0),
  provisional_score REAL NOT NULL CHECK (provisional_score BETWEEN 0 AND 100),
  official_score REAL CHECK (official_score IS NULL OR official_score BETWEEN 0 AND 100),
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  frozen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, task_id, snapshot_version),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS frozen_task_scores_student_task_idx
  ON frozen_task_scores(student_id, task_id, frozen_at);
