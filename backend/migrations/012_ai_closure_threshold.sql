-- Umbral propio de cierre por IA para cada trabajo. NULL = la IA no cierra casos de BETO
-- (solo sugiere y el caso pasa a revisión humana). Para R2 no cambia la regla existente.
ALTER TABLE epen.processing_jobs ADD COLUMN IF NOT EXISTS ai_threshold numeric(6,5)
  CHECK (ai_threshold IS NULL OR ai_threshold BETWEEN 0 AND 1);
COMMENT ON COLUMN epen.processing_jobs.ai_threshold IS 'Puntaje mínimo de BETO para que la IA cierre la primera propuesta; NULL desactiva el cierre por IA con BETO.';
