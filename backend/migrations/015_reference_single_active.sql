-- Una sola base codificada de referencia activa a la vez. Las demás quedan guardadas (archivadas).
CREATE UNIQUE INDEX IF NOT EXISTS datasets_single_active_reference_idx
  ON epen.datasets ((kind)) WHERE status = 'active' AND kind = 'reference';
