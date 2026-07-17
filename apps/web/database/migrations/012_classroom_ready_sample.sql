ALTER TABLE practice_attempts
  ADD COLUMN delivery_channel TEXT NOT NULL DEFAULT 'self-study'
    CHECK (delivery_channel IN ('self-study', 'classroom'));

ALTER TABLE practice_attempts
  ADD COLUMN classroom_session_id TEXT
    REFERENCES classroom_sessions(session_id) ON DELETE SET NULL;

ALTER TABLE practice_attempts
  ADD COLUMN classroom_run_id TEXT
    CHECK (classroom_run_id IS NULL OR length(trim(classroom_run_id)) > 0);

ALTER TABLE practice_attempts
  ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0);

CREATE INDEX practice_attempts_delivery_idx
  ON practice_attempts(student_id, activity_id, delivery_channel, attempted_at);

CREATE TABLE classroom_lesson_runs (
  lesson_run_id TEXT PRIMARY KEY CHECK (length(trim(lesson_run_id)) > 0),
  session_id TEXT NOT NULL REFERENCES classroom_sessions(session_id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL CHECK (length(trim(lesson_id)) > 0),
  task_id TEXT NOT NULL CHECK (task_id IN ('P01', 'P02', 'P03')),
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  status TEXT NOT NULL CHECK (status IN ('preparing', 'active', 'paused', 'closed')),
  teaching_cursor_json TEXT NOT NULL CHECK (json_valid(teaching_cursor_json)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  started_at TEXT,
  paused_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE UNIQUE INDEX classroom_lesson_runs_one_open_idx
  ON classroom_lesson_runs(session_id)
  WHERE status IN ('preparing', 'active', 'paused');

ALTER TABLE classroom_sessions
  ADD COLUMN active_lesson_run_id TEXT
    REFERENCES classroom_lesson_runs(lesson_run_id) ON DELETE SET NULL;

CREATE TABLE classroom_assessment_runs (
  run_id TEXT PRIMARY KEY CHECK (length(trim(run_id)) > 0),
  lesson_run_id TEXT NOT NULL REFERENCES classroom_lesson_runs(lesson_run_id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES classroom_sessions(session_id) ON DELETE CASCADE,
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  game_id TEXT NOT NULL CHECK (length(trim(game_id)) > 0),
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'reviewing', 'closed', 'expired')),
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  remaining_seconds_when_paused INTEGER CHECK (remaining_seconds_when_paused >= 0),
  review_started_at TEXT,
  closed_at TEXT,
  closed_reason TEXT CHECK (
    closed_reason IS NULL
    OR closed_reason IN ('all-submitted', 'time-expired', 'teacher-collected', 'lesson-ended')
  ),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
) STRICT;

CREATE UNIQUE INDEX classroom_assessment_runs_one_open_idx
  ON classroom_assessment_runs(lesson_run_id)
  WHERE status IN ('running', 'paused', 'reviewing');

CREATE TABLE formal_assessment_drafts (
  assessment_id TEXT NOT NULL
    REFERENCES formal_assessment_instances(assessment_id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(answers_json)),
  state_revision INTEGER NOT NULL DEFAULT 0 CHECK (state_revision >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assessment_id, student_id)
) STRICT;

ALTER TABLE formal_assessment_instances ADD COLUMN expires_at TEXT;

ALTER TABLE formal_assessment_instances
  ADD COLUMN closure_reason TEXT
    CHECK (closure_reason IS NULL OR closure_reason IN ('submitted', 'expired', 'cancelled'));

ALTER TABLE device_presence
  ADD COLUMN client_kind TEXT NOT NULL DEFAULT 'helper-simulator'
    CHECK (client_kind IN ('browser', 'helper-simulator'));

ALTER TABLE device_presence
  ADD COLUMN visibility_state TEXT NOT NULL DEFAULT 'visible'
    CHECK (visibility_state IN ('visible', 'hidden'));
