-- Una sola base activa del sistema. Las bases de referencia pueden estar activas sin desplazarla.
DROP INDEX IF EXISTS epen.datasets_single_active_idx;
CREATE UNIQUE INDEX IF NOT EXISTS datasets_single_active_idx
  ON epen.datasets ((status)) WHERE status = 'active' AND kind = 'system';
