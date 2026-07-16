CREATE UNIQUE INDEX practice_attempts_attempt_node_unique
  ON practice_attempts(attempt_id, node_id);

CREATE TABLE output_field_sources (
  output_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  field_key TEXT NOT NULL CHECK (length(trim(field_key)) > 0),
  source_node_id TEXT NOT NULL CHECK (length(trim(source_node_id)) > 0),
  source_attempt_id TEXT NOT NULL CHECK (length(trim(source_attempt_id)) > 0),
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (output_id, version, field_key, source_node_id, source_attempt_id),
  FOREIGN KEY (output_id, version)
    REFERENCES professional_output_versions(output_id, version) ON DELETE CASCADE,
  FOREIGN KEY (source_attempt_id, source_node_id)
    REFERENCES practice_attempts(attempt_id, node_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX output_field_sources_attempt_idx
  ON output_field_sources(source_attempt_id, output_id, version);

CREATE TRIGGER output_field_sources_no_update
BEFORE UPDATE ON output_field_sources
BEGIN
  SELECT RAISE(ABORT, 'output field sources are immutable');
END;

CREATE TRIGGER output_evidence_links_no_update
BEFORE UPDATE ON output_evidence_links
BEGIN
  SELECT RAISE(ABORT, 'output evidence links are immutable');
END;
