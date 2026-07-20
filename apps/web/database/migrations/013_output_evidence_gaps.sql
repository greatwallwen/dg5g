CREATE TABLE output_evidence_gaps (
  output_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  field_key TEXT NOT NULL CHECK (length(trim(field_key)) > 0),
  gap_text TEXT NOT NULL DEFAULT '',
  next_action_text TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (output_id, version, field_key),
  FOREIGN KEY (output_id, version)
    REFERENCES professional_output_versions(output_id, version) ON DELETE CASCADE,
  CHECK (length(trim(gap_text)) > 0 OR length(trim(next_action_text)) > 0)
) STRICT;

CREATE TRIGGER output_evidence_gaps_no_update
BEFORE UPDATE ON output_evidence_gaps
BEGIN
  SELECT RAISE(ABORT, 'output evidence gaps are immutable');
END;

CREATE TRIGGER output_evidence_gaps_no_delete
BEFORE DELETE ON output_evidence_gaps
WHEN EXISTS (
  SELECT 1 FROM professional_outputs WHERE output_id = OLD.output_id
)
BEGIN
  SELECT RAISE(ABORT, 'output evidence gaps are immutable');
END;
