ALTER TABLE professional_outputs
  ADD COLUMN current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0);

ALTER TABLE professional_outputs
  ADD COLUMN state_revision INTEGER NOT NULL DEFAULT 0 CHECK (state_revision >= 0);

-- Canonical task identities are P01/P02/P03. Preserve legacy rows while moving
-- them onto the same IDs used by the learning policy and generated textbook.
UPDATE professional_outputs
SET task_id = CASE task_id
  WHEN 'P1T1' THEN 'P01'
  WHEN 'P1T2' THEN 'P02'
  WHEN 'P1T3' THEN 'P03'
  ELSE task_id
END;

CREATE UNIQUE INDEX IF NOT EXISTS professional_outputs_student_task_unique
  ON professional_outputs(student_id, task_id);

CREATE TABLE professional_output_versions (
  output_id TEXT NOT NULL,
  task_id TEXT NOT NULL CHECK (task_id IN ('P01', 'P02', 'P03')),
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  fields_json TEXT NOT NULL CHECK (json_valid(fields_json) AND json_type(fields_json) = 'object'),
  upstream_refs_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(upstream_refs_json) AND json_type(upstream_refs_json) = 'array'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (output_id, version),
  FOREIGN KEY (output_id) REFERENCES professional_outputs(output_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX professional_output_versions_task_idx
  ON professional_output_versions(task_id, output_id, version);

-- Existing content_json is the current compatibility projection. Promote it to
-- immutable v1 without rewriting the content payload.
UPDATE professional_outputs
SET current_version = 1,
    state_revision = 1
WHERE current_version = 0;

INSERT INTO professional_output_versions (
  output_id, task_id, version, schema_version, fields_json, upstream_refs_json, created_at
)
SELECT
  output.output_id,
  output.task_id,
  1,
  1,
  output.content_json,
  CASE output.task_id
    WHEN 'P02' THEN COALESCE((
      SELECT json_array(json_object(
        'outputId', upstream.output_id,
        'version', upstream.current_version
      ))
      FROM professional_outputs AS upstream
      WHERE upstream.student_id = output.student_id
        AND upstream.task_id = 'P01'
        AND upstream.current_version > 0
      LIMIT 1
    ), '[]')
    WHEN 'P03' THEN COALESCE((
      SELECT json_array(json_object(
        'outputId', upstream.output_id,
        'version', upstream.current_version
      ))
      FROM professional_outputs AS upstream
      WHERE upstream.student_id = output.student_id
        AND upstream.task_id = 'P02'
        AND upstream.current_version > 0
      LIMIT 1
    ), '[]')
    ELSE '[]'
  END,
  output.created_at
FROM professional_outputs AS output;

CREATE TRIGGER professional_output_versions_no_update
BEFORE UPDATE ON professional_output_versions
BEGIN
  SELECT RAISE(ABORT, 'professional output versions are immutable');
END;
