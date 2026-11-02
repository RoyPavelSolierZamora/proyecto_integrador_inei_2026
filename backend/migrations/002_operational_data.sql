ALTER TABLE epen.datasets
  ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE epen.survey_cases
  ADD COLUMN IF NOT EXISTS demo_qwen jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS datasets_single_active_idx
  ON epen.datasets ((status)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS epen.ciiu_catalog (
  code char(4) PRIMARY KEY CHECK (code ~ '^[0-9]{4}$'),
  description text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ciiu_catalog_description_idx
  ON epen.ciiu_catalog USING gin (to_tsvector('simple', description));

