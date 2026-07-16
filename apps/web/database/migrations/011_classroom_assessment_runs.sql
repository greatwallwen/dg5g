ALTER TABLE formal_assessment_instances
  ADD COLUMN classroom_run_id TEXT
    CHECK (classroom_run_id IS NULL OR length(trim(classroom_run_id)) > 0);

CREATE INDEX formal_assessment_instances_classroom_run_idx
  ON formal_assessment_instances(session_id, classroom_run_id, node_id, status);
