-- Corrige el esquema del reparto. La versión 016 quedó registrada en epen.schema_migrations con un
-- borrador anterior (tabla case_assignments con batch_no), así que la versión nueva no llegó a
-- ejecutarse. Esta migración reemplaza ese borrador solo si no tiene asignaciones.
-- Si ya existen asignaciones reales con el borrador, se detiene y no toca nada.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'epen' AND table_name = 'case_assignments' AND column_name = 'batch_no'
  ) THEN
    IF EXISTS (SELECT 1 FROM epen.case_assignments) THEN
      RAISE EXCEPTION 'Hay asignaciones del borrador anterior de calidad de codificación. Revísalas antes de continuar.';
    END IF;
    DROP TABLE epen.case_assignments;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS epen.assignment_lots (
  id bigserial PRIMARY KEY,
  dataset_id bigint NOT NULL REFERENCES epen.datasets(id) ON DELETE RESTRICT,
  assignee_id bigint NOT NULL REFERENCES epen.users(id) ON DELETE RESTRICT,
  source varchar(10) NOT NULL CHECK (source IN ('ml', 'llm', 'review', 'todas')),
  requested_percent numeric(6,2) CHECK (requested_percent IS NULL OR (requested_percent > 0 AND requested_percent <= 100)),
  case_count integer NOT NULL CHECK (case_count >= 0),
  created_by bigint NOT NULL REFERENCES epen.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS epen.case_assignments (
  id bigserial PRIMARY KEY,
  lot_id bigint NOT NULL REFERENCES epen.assignment_lots(id) ON DELETE RESTRICT,
  case_id bigint NOT NULL REFERENCES epen.survey_cases(id) ON DELETE RESTRICT,
  CONSTRAINT case_assignments_case_unique UNIQUE (case_id)
);

CREATE INDEX IF NOT EXISTS assignment_lots_dataset_idx ON epen.assignment_lots (dataset_id);
CREATE INDEX IF NOT EXISTS assignment_lots_assignee_idx ON epen.assignment_lots (assignee_id);
CREATE INDEX IF NOT EXISTS case_assignments_lot_idx ON epen.case_assignments (lot_id);
