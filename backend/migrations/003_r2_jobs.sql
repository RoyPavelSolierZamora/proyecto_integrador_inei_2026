ALTER TABLE epen.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE epen.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('operador', 'analista', 'supervisor', 'auditor', 'admin'));

ALTER TABLE epen.survey_cases ALTER COLUMN candidates DROP NOT NULL;
ALTER TABLE epen.survey_cases DROP CONSTRAINT IF EXISTS survey_cases_candidates_check;
ALTER TABLE epen.survey_cases
  ADD CONSTRAINT survey_cases_candidates_check
  CHECK (
    candidates IS NULL OR
    (jsonb_typeof(candidates) = 'array' AND jsonb_array_length(candidates) BETWEEN 1 AND 5)
  );

CREATE TABLE IF NOT EXISTS epen.processing_jobs (
  id bigserial PRIMARY KEY,
  dataset_id bigint NOT NULL REFERENCES epen.datasets(id) ON DELETE RESTRICT,
  kind varchar(30) NOT NULL DEFAULT 'r2_batch' CHECK (kind IN ('r2_batch')),
  status varchar(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  threshold numeric(6,5) NOT NULL CHECK (threshold BETWEEN 0 AND 1),
  total_records integer NOT NULL CHECK (total_records >= 1),
  processed_records integer NOT NULL DEFAULT 0 CHECK (processed_records >= 0),
  automatic_count integer NOT NULL DEFAULT 0 CHECK (automatic_count >= 0),
  qwen_pending_count integer NOT NULL DEFAULT 0 CHECK (qwen_pending_count >= 0),
  manual_count integer NOT NULL DEFAULT 0 CHECK (manual_count >= 0),
  model_version varchar(120),
  error_message text,
  created_by bigint REFERENCES epen.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processing_jobs_status_idx
  ON epen.processing_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS processing_jobs_dataset_idx
  ON epen.processing_jobs (dataset_id, created_at DESC);

