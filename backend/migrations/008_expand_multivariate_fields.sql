ALTER TABLE epen.survey_cases
  ALTER COLUMN c310 TYPE varchar(160),
  ALTER COLUMN c311 TYPE varchar(160),
  ALTER COLUMN c366 TYPE varchar(160);

COMMENT ON COLUMN epen.survey_cases.c310 IS 'Categoría de ocupación EPEN opcional para R2 multivariado; acepta código o etiqueta.';
COMMENT ON COLUMN epen.survey_cases.c311 IS 'Tipo de entidad EPEN opcional para R2 multivariado; acepta código o etiqueta.';
COMMENT ON COLUMN epen.survey_cases.c366 IS 'Nivel educativo EPEN opcional; acepta código o etiqueta y debe auditarse por posible sesgo.';
