-- Un lote activo es visible para su codificador; uno inactivo se oculta sin borrar sus decisiones.
-- Los lotes existentes quedan activos. Desactivar no altera casos ni decisiones.
ALTER TABLE epen.assignment_lots ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
