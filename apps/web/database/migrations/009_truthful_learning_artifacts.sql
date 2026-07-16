CREATE TABLE formal_assessment_instances (
  assessment_id TEXT PRIMARY KEY CHECK (length(trim(assessment_id)) > 0),
  session_id TEXT,
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  game_id TEXT NOT NULL CHECK (length(trim(game_id)) > 0),
  question_version TEXT NOT NULL CHECK (length(trim(question_version)) > 0),
  status TEXT NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'running', 'closed')),
  opened_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES classroom_sessions(session_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX formal_assessment_instances_session_idx
  ON formal_assessment_instances(session_id, status, opened_at);

CREATE TABLE formal_assessment_tokens (
  token_hash TEXT PRIMARY KEY CHECK (length(trim(token_hash)) > 0),
  assessment_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  question_version TEXT NOT NULL CHECK (length(trim(question_version)) > 0),
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (assessment_id) REFERENCES formal_assessment_instances(assessment_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX formal_assessment_tokens_student_idx
  ON formal_assessment_tokens(student_id, assessment_id, used_at);

CREATE TABLE practice_attempts (
  attempt_id TEXT PRIMARY KEY CHECK (length(trim(attempt_id)) > 0),
  student_id TEXT NOT NULL,
  activity_id TEXT NOT NULL CHECK (length(trim(activity_id)) > 0),
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  response_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(response_json)),
  result_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(result_json)),
  artifact_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(artifact_json)),
  passed INTEGER NOT NULL DEFAULT 0 CHECK (passed IN (0, 1)),
  origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('demo', 'user')),
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX practice_attempts_student_activity_idx
  ON practice_attempts(student_id, activity_id, attempted_at);

CREATE TABLE evidence_library (
  evidence_id TEXT PRIMARY KEY CHECK (length(trim(evidence_id)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'diagram', 'document', 'reading')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  asset_url TEXT NOT NULL CHECK (length(trim(asset_url)) > 0),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  origin TEXT NOT NULL DEFAULT 'demo' CHECK (origin IN ('demo', 'user')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE output_evidence_links (
  output_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  field_key TEXT NOT NULL CHECK (length(trim(field_key)) > 0),
  evidence_id TEXT NOT NULL,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (output_id, version, field_key, evidence_id),
  FOREIGN KEY (output_id, version)
    REFERENCES professional_output_versions(output_id, version) ON DELETE CASCADE,
  FOREIGN KEY (evidence_id) REFERENCES evidence_library(evidence_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX output_evidence_links_evidence_idx
  ON output_evidence_links(evidence_id, output_id, version);

CREATE TABLE output_review_annotations (
  review_id TEXT NOT NULL,
  field_key TEXT NOT NULL CHECK (length(trim(field_key)) > 0),
  comment TEXT NOT NULL CHECK (length(trim(comment)) > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id, field_key),
  FOREIGN KEY (review_id) REFERENCES output_reviews(review_id) ON DELETE CASCADE
) STRICT;

ALTER TABLE learning_events
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'demo' CHECK (origin IN ('demo', 'user'));

ALTER TABLE formal_attempts
  ADD COLUMN assessment_id TEXT REFERENCES formal_assessment_instances(assessment_id) ON DELETE SET NULL;

ALTER TABLE formal_attempts
  ADD COLUMN question_version TEXT;

ALTER TABLE formal_attempts
  ADD COLUMN answers_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(answers_json));

ALTER TABLE formal_attempts
  ADD COLUMN diagnostics_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(diagnostics_json));

ALTER TABLE formal_attempts
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'demo' CHECK (origin IN ('demo', 'user'));

ALTER TABLE professional_outputs
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'demo' CHECK (origin IN ('demo', 'user'));

ALTER TABLE output_reviews
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'demo' CHECK (origin IN ('demo', 'user'));

ALTER TABLE frozen_task_scores
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'demo' CHECK (origin IN ('demo', 'user'));
