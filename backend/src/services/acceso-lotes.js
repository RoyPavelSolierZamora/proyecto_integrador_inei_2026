// Acceso de los codificadores a los casos según sus lotes.
// Regla: un analista que tiene lotes asignados en una base solo ve y decide los casos de sus lotes ACTIVOS en esa base.
// Si no tiene lotes en esa base, conserva el acceso habitual. Supervisores y administradores no se restringen.
// Un lote desactivado no amplía el acceso: si era su único lote, la persona deja de ver casos de esa base.

export async function hasLotRestriction(db, datasetId, user) {
  if (!user || user.role !== 'analista') return false;
  const result = await db.query(
    'SELECT EXISTS (SELECT 1 FROM epen.assignment_lots WHERE dataset_id = $1 AND assignee_id = $2) AS restricted',
    [datasetId, user.id],
  );
  return result.rows[0].restricted === true;
}

// ¿Puede esta persona tocar este caso (ver o decidir)?
export async function canTouchCase(db, datasetId, externalId, user) {
  if (!(await hasLotRestriction(db, datasetId, user))) return true;
  const result = await db.query(`
    SELECT EXISTS (
      SELECT 1 FROM epen.case_assignments a
      JOIN epen.assignment_lots l ON l.id = a.lot_id
      JOIN epen.survey_cases c ON c.id = a.case_id
      WHERE c.dataset_id = $1 AND c.external_id = $2 AND l.assignee_id = $3 AND l.active = true
    ) AS allowed
  `, [datasetId, externalId, user.id]);
  return result.rows[0].allowed === true;
}

// Identificadores de los casos que la persona puede ver en esa base. Null = sin restricción.
export async function visibleCaseIds(db, datasetId, user) {
  if (!(await hasLotRestriction(db, datasetId, user))) return null;
  const result = await db.query(`
    SELECT c.external_id FROM epen.case_assignments a
    JOIN epen.assignment_lots l ON l.id = a.lot_id
    JOIN epen.survey_cases c ON c.id = a.case_id
    WHERE c.dataset_id = $1 AND l.assignee_id = $2 AND l.active = true
  `, [datasetId, user.id]);
  return new Set(result.rows.map(row => row.external_id));
}
