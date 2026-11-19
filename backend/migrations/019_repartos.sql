-- Un reparto agrupa los lotes creados en una misma operación (una base, varias partes y personas).
-- Así se puede ver, modificar o eliminar el reparto completo. Los lotes anteriores quedan sin reparto.
CREATE TABLE IF NOT EXISTS epen.assignment_repartos (
  id bigserial PRIMARY KEY,
  dataset_id bigint NOT NULL REFERENCES epen.datasets(id) ON DELETE RESTRICT,
  name varchar(120) NOT NULL,
  created_by bigint NOT NULL REFERENCES epen.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE epen.assignment_lots ADD COLUMN IF NOT EXISTS reparto_id bigint REFERENCES epen.assignment_repartos(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS assignment_lots_reparto_idx ON epen.assignment_lots (reparto_id);
