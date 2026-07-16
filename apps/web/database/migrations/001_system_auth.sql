CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(username)) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) > 0),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY CHECK (length(trim(key)) > 0),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS snapshot_versions (
  topic TEXT PRIMARY KEY CHECK (length(trim(topic)) > 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

INSERT INTO snapshot_versions (topic, version)
VALUES ('global', 0)
ON CONFLICT(topic) DO NOTHING;
