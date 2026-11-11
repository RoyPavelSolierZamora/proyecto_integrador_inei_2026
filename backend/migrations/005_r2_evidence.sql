ALTER TABLE epen.survey_cases
  ADD COLUMN IF NOT EXISTS r2_evidence jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'survey_cases_r2_evidence_object_check'
      AND conrelid = 'epen.survey_cases'::regclass
  ) THEN
    ALTER TABLE epen.survey_cases
      ADD CONSTRAINT survey_cases_r2_evidence_object_check
      CHECK (r2_evidence IS NULL OR jsonb_typeof(r2_evidence) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN epen.survey_cases.r2_evidence IS
  'Calidad de entrada y antecedentes similares devueltos por R2; no contiene la etiqueta del caso actual.';
