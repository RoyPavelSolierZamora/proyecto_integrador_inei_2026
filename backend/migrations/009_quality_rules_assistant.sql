CREATE TABLE IF NOT EXISTS epen.coding_rules (
  id bigserial PRIMARY KEY,
  code char(4) NOT NULL REFERENCES epen.ciiu_catalog(code) ON DELETE RESTRICT,
  title varchar(160) NOT NULL,
  p309_pattern text NOT NULL,
  occupational_context text,
  guidance text NOT NULL,
  positive_examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  negative_examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_reference text,
  status varchar(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'active', 'retired')),
  created_by bigint NOT NULL REFERENCES epen.users(id) ON DELETE RESTRICT,
  approved_by bigint REFERENCES epen.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  retired_at timestamptz,
  CHECK (jsonb_typeof(positive_examples) = 'array'),
  CHECK (jsonb_typeof(negative_examples) = 'array')
);

CREATE INDEX IF NOT EXISTS coding_rules_status_code_idx
  ON epen.coding_rules (status, code, updated_at DESC);

CREATE TABLE IF NOT EXISTS epen.quality_reviews (
  id bigserial PRIMARY KEY,
  case_id bigint NOT NULL REFERENCES epen.survey_cases(id) ON DELETE RESTRICT,
  decision_id bigint REFERENCES epen.decisions(id) ON DELETE SET NULL,
  verdict varchar(20) NOT NULL CHECK (verdict IN ('correct', 'incorrect', 'uncertain')),
  corrected_code char(4) REFERENCES epen.ciiu_catalog(code) ON DELETE RESTRICT,
  notes text,
  reviewer_id bigint NOT NULL REFERENCES epen.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (verdict <> 'incorrect' OR corrected_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS quality_reviews_case_idx
  ON epen.quality_reviews (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quality_reviews_reviewer_idx
  ON epen.quality_reviews (reviewer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS epen.assistant_query_log (
  id bigserial PRIMARY KEY,
  user_id bigint REFERENCES epen.users(id) ON DELETE SET NULL,
  role varchar(20) NOT NULL,
  dataset_id bigint REFERENCES epen.datasets(id) ON DELETE SET NULL,
  compare_dataset_id bigint REFERENCES epen.datasets(id) ON DELETE SET NULL,
  case_id bigint REFERENCES epen.survey_cases(id) ON DELETE SET NULL,
  intent varchar(40) NOT NULL,
  question_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_query_log_user_idx
  ON epen.assistant_query_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS survey_cases_text_search_idx
  ON epen.survey_cases USING gin (
    to_tsvector('simple', coalesce(p309, '') || ' ' || coalesce(p308, '') || ' ' || coalesce(p308a, ''))
  );

COMMENT ON TABLE epen.coding_rules IS 'Criterios versionables de codificación; no sustituye el catálogo oficial CIIU.';
COMMENT ON TABLE epen.quality_reviews IS 'Adjudicaciones formales para medir calidad sin inferir error a partir de confianza o desacuerdo.';
COMMENT ON TABLE epen.assistant_query_log IS 'Auditoría mínima del asistente; conserva hash e intención, no el texto potencialmente sensible.';
