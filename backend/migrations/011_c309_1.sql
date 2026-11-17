ALTER TABLE epen.survey_cases ADD COLUMN IF NOT EXISTS c309_1 varchar(160);
COMMENT ON COLUMN epen.survey_cases.c309_1 IS 'Sector primario EPEN informado en la entrada; opcional.';
