ALTER TABLE epen.survey_cases
  ADD COLUMN IF NOT EXISTS c310 varchar(20),
  ADD COLUMN IF NOT EXISTS c311 varchar(20),
  ADD COLUMN IF NOT EXISTS c366 varchar(20);

COMMENT ON COLUMN epen.survey_cases.c310 IS 'Categoría de ocupación EPEN opcional para R2 multivariado.';
COMMENT ON COLUMN epen.survey_cases.c311 IS 'Tipo de entidad EPEN opcional para R2 multivariado.';
COMMENT ON COLUMN epen.survey_cases.c366 IS 'Nivel educativo EPEN opcional; debe auditarse por posible sesgo.';
