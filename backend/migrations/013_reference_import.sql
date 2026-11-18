-- Base codificada de referencia: un resultado ya codificado (por analistas u otro proceso) que se importa
-- junto con el código de analista de cada registro. Sirve para comparar lo que hizo el sistema con esa codificación
-- y para auditar por analista. No reemplaza las decisiones del sistema.

-- Código de analista de cada perfil (lo asigna el administrador).
ALTER TABLE epen.users ADD COLUMN IF NOT EXISTS analyst_code varchar(20);
CREATE UNIQUE INDEX IF NOT EXISTS users_analyst_code_key
  ON epen.users (analyst_code) WHERE analyst_code IS NOT NULL;

-- Código de analista del registro en la base de referencia.
ALTER TABLE epen.survey_cases ADD COLUMN IF NOT EXISTS analyst_code varchar(20);

-- Tipo de base: 'system' (salida del clasificador) o 'reference' (codificación de referencia importada).
ALTER TABLE epen.datasets ADD COLUMN IF NOT EXISTS kind varchar(20) NOT NULL DEFAULT 'system'
  CHECK (kind IN ('system', 'reference'));

-- Origen 'external': decisión registrada al importar una codificación de referencia.
ALTER TABLE epen.decisions DROP CONSTRAINT IF EXISTS decisions_source_check;
ALTER TABLE epen.decisions ADD CONSTRAINT decisions_source_check
  CHECK (source IN ('ml', 'llm', 'human', 'external'));

CREATE INDEX IF NOT EXISTS survey_cases_external_idx ON epen.survey_cases (external_id);
