CREATE TABLE IF NOT EXISTS classroom_sessions (
  session_id TEXT PRIMARY KEY CHECK (length(trim(session_id)) > 0),
  class_id TEXT NOT NULL CHECK (length(trim(class_id)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  teacher_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'active', 'paused', 'closed')),
  active_node_id TEXT,
  active_unit_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX IF NOT EXISTS classroom_sessions_class_id_idx
  ON classroom_sessions(class_id);

CREATE TABLE IF NOT EXISTS classroom_members (
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, student_id),
  FOREIGN KEY (session_id) REFERENCES classroom_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS classroom_members_student_id_idx
  ON classroom_members(student_id);

CREATE TABLE IF NOT EXISTS classroom_commands (
  command_id TEXT PRIMARY KEY CHECK (length(trim(command_id)) > 0),
  session_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  kind TEXT NOT NULL CHECK (length(trim(kind)) > 0),
  target_student_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  UNIQUE (session_id, revision),
  FOREIGN KEY (session_id) REFERENCES classroom_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (target_student_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS device_presence (
  device_id TEXT PRIMARY KEY CHECK (length(trim(device_id)) > 0),
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student', 'projector')),
  helper_state TEXT NOT NULL DEFAULT 'offline'
    CHECK (helper_state IN ('offline', 'connecting', 'online', 'degraded')),
  page_state TEXT NOT NULL DEFAULT 'closed'
    CHECK (page_state IN ('closed', 'opening', 'ready', 'hidden', 'error')),
  last_heartbeat_at TEXT,
  last_applied_revision INTEGER NOT NULL DEFAULT 0 CHECK (last_applied_revision >= 0),
  FOREIGN KEY (session_id) REFERENCES classroom_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS device_presence_session_id_idx
  ON device_presence(session_id);

CREATE TABLE IF NOT EXISTS command_acks (
  command_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'delivered', 'applied', 'failed', 'expired')),
  reason TEXT,
  acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (command_id, device_id),
  FOREIGN KEY (command_id) REFERENCES classroom_commands(command_id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES device_presence(device_id) ON DELETE CASCADE
) STRICT;
