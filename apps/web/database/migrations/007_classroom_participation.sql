CREATE TABLE classroom_participation (
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('joined', 'left')),
  mode TEXT NOT NULL CHECK (mode IN ('follow', 'self')),
  joined_at TEXT,
  left_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, student_id),
  FOREIGN KEY (session_id, student_id)
    REFERENCES classroom_members(session_id, student_id)
    ON DELETE CASCADE
) STRICT;

CREATE INDEX classroom_participation_following_idx
  ON classroom_participation(session_id, state, mode, student_id);
