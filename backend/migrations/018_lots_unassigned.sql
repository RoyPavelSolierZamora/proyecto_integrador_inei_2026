-- Un lote puede crearse sin codificador y asignarse después. Así se puede partir una base en más partes
-- que personas disponibles: las partes sin persona quedan pendientes de asignación.
ALTER TABLE epen.assignment_lots ALTER COLUMN assignee_id DROP NOT NULL;
