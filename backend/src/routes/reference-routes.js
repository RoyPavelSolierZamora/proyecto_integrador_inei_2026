import express from 'express';
import { randomBytes } from 'node:crypto';
import { audit } from '../services/audit.js';
import { getPool, transaction } from '../db/pool.js';
import { requireAuth, requireCsrf, requireRole } from '../security/middleware.js';
import { compareWithReference, validateReferenceRows } from '../services/reference-comparison.js';
import { buildCodingDashboard } from '../services/coding-dashboard.js';

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const ANALYST = /^[A-Za-z0-9_-]{1,20}$/;
const MAX_REFERENCE_ROWS = 20000;

// Rutas de la base codificada de referencia y del código de analista.
export function createReferenceRouter() {
  const router = express.Router();

  router.get('/api/reference-datasets', requireAuth, async (req, res) => {
    const result = await getPool().query(`
      SELECT id, name, period, version, record_count, imported_at, status
      FROM epen.datasets WHERE kind = 'reference' AND status IN ('active', 'archived')
      ORDER BY imported_at DESC, id DESC
    `);
    res.json({ references: result.rows.map(row => ({ id: Number(row.id), name: row.name, period: row.period, version: row.version, records: row.record_count, importedAt: row.imported_at, active: row.status === 'active' })) });
  });

  // Activa o desactiva una base codificada guardada. Solo una queda activa: las métricas y la comparación la usan.
  router.patch('/api/reference-datasets/:id/activation', requireRole('supervisor', 'admin'), requireCsrf, async (req, res) => {
    const referenceId = validId(req.params.id);
    if (!referenceId || typeof req.body?.active !== 'boolean') throw httpError(400, 'Indica la base y si debe quedar activa.');
    const result = await transaction(async client => {
      const found = await client.query("SELECT id, name, period, version FROM epen.datasets WHERE id = $1 AND kind = 'reference' FOR UPDATE", [referenceId]);
      if (!found.rowCount) throw httpError(404, 'Base codificada no encontrada.');
      if (req.body.active) {
        await client.query("UPDATE epen.datasets SET status = 'archived' WHERE kind = 'reference' AND status = 'active' AND id <> $1", [referenceId]);
        await client.query("UPDATE epen.datasets SET status = 'active', activated_at = now() WHERE id = $1", [referenceId]);
      } else {
        await client.query("UPDATE epen.datasets SET status = 'archived' WHERE id = $1", [referenceId]);
      }
      await audit(client, req, 'reference.activation_changed', 'dataset', referenceId, { name: found.rows[0].name, period: found.rows[0].period, active: req.body.active });
      return found.rows[0];
    });
    res.json({ id: Number(result.id), active: req.body.active });
  });

  // Importa una base ya codificada, con el código de analista de cada registro.
  router.post('/api/datasets/import-reference', requireRole('supervisor', 'admin'), requireCsrf, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const period = String(req.body?.period || '').trim();
    const fileName = String(req.body?.fileName || '').trim().slice(0, 200);
    if (name.length < 3 || name.length > 120) throw httpError(400, 'El nombre de la base debe tener entre 3 y 120 caracteres.');
    if (!period || period.length > 40) throw httpError(400, 'Indica el periodo de la base.');
    if (!Array.isArray(req.body?.rows) || req.body.rows.length < 1) throw httpError(400, 'El archivo no contiene registros.');
    if (req.body.rows.length > MAX_REFERENCE_ROWS) throw httpError(400, `Importa como máximo ${MAX_REFERENCE_ROWS} registros por archivo.`);
    const catalog = await getPool().query('SELECT code FROM epen.ciiu_catalog WHERE active = true');
    const validation = validateReferenceRows(req.body.rows, new Set(catalog.rows.map(row => row.code)));
    if (validation.errorCount) {
      throw httpError(400, `El archivo tiene ${validation.errorCount} error(es). ${validation.errors.join(' ')}`);
    }
    const datasetId = await transaction(async client => {
      // La base recién importada queda activa; la anterior no se borra, solo se guarda.
      await client.query("UPDATE epen.datasets SET status = 'archived' WHERE kind = 'reference' AND status = 'active'");
      const version = await client.query('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM epen.datasets WHERE name = $1 AND period = $2', [name, period]);
      const code = `REF-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
      const dataset = await client.query(`
        INSERT INTO epen.datasets (code, name, period, version, source_filename, status, record_count, imported_by, activated_at, kind)
        VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, now(), 'reference') RETURNING id
      `, [code, name, period, version.rows[0].next, fileName || null, validation.rows.length, req.auth.user.id]);
      const id = dataset.rows[0].id;
      for (const row of validation.rows) {
        const candidates = JSON.stringify([{ codigo: row.code, descripcion: '', prob: null, rank: 1 }]);
        const inserted = await client.query(`
          INSERT INTO epen.survey_cases (dataset_id, external_id, p309, p308, p308a, candidates, confianza_ml, status, final_code, analyst_code)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, NULL, 'resolved', $7, $8) RETURNING id
        `, [id, row.externalId, row.p309, row.p308 || null, row.p308a || null, candidates, row.code, row.analyst]);
        await client.query(`
          INSERT INTO epen.decisions (case_id, source, decision, code, justification, model, decided_by)
          VALUES ($1, 'external', 'reference_code', $2, 'Código de la base codificada de referencia.', 'referencia', NULL)
        `, [inserted.rows[0].id, row.code]);
      }
      await audit(client, req, 'reference.imported', 'dataset', id, { name, period, records: validation.rows.length, fileName });
      return id;
    });
    res.status(201).json({ datasetId: Number(datasetId), records: validation.rows.length });
  });

  // Código de analista de un perfil. Único en el sistema; vacío lo quita.
  router.patch('/api/admin/users/:id/analyst-code', requireRole('admin'), requireCsrf, async (req, res) => {
    const userId = validId(req.params.id);
    if (!userId) throw httpError(400, 'Usuario no válido.');
    const raw = String(req.body?.analystCode ?? '').trim();
    if (raw && !ANALYST.test(raw)) throw httpError(400, 'El código de analista admite letras, números, guion y guion bajo (máximo 20).');
    const value = raw || null;
    try {
      const result = await transaction(async client => {
        const updated = await client.query('UPDATE epen.users SET analyst_code = $1, updated_at = now() WHERE id = $2 AND deleted_at IS NULL RETURNING id, username', [value, userId]);
        if (!updated.rowCount) throw httpError(404, 'Usuario no encontrado.');
        await audit(client, req, 'user.analyst_code_set', 'user', userId, { username: updated.rows[0].username, analystCode: value });
        return updated.rows[0];
      });
      res.json({ id: Number(result.id), analystCode: value });
    } catch (cause) {
      if (cause.code === '23505') throw httpError(409, 'Ese código de analista ya está asignado a otro usuario.');
      throw cause;
    }
  });

  // Comparación de una base del sistema con una referencia: aciertos, errores y analistas.
  router.get('/api/datasets/:datasetId/reference-comparison', requireRole('supervisor', 'auditor', 'admin'), async (req, res) => {
    const datasetId = validId(req.params.datasetId);
    const referenceId = validId(req.query.reference);
    if (!datasetId || !referenceId) throw httpError(400, 'Indica la base y la referencia.');
    const pool = getPool();
    const [system, reference] = await Promise.all([
      pool.query('SELECT id, name, period, version, kind FROM epen.datasets WHERE id = $1', [datasetId]),
      pool.query("SELECT id, name, period, version, record_count, kind FROM epen.datasets WHERE id = $1 AND kind = 'reference'", [referenceId]),
    ]);
    if (!system.rowCount) throw httpError(404, 'Base no encontrada.');
    if (!reference.rowCount) throw httpError(400, 'La referencia debe ser una base codificada importada.');
    const [systemCases, referenceCases] = await Promise.all([
      pool.query(`
        SELECT c.external_id, c.p309, c.final_code, c.confianza_ml, origin.source AS origin
        FROM epen.survey_cases c
        LEFT JOIN LATERAL (
          SELECT source FROM epen.decisions WHERE case_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
        ) origin ON true
        WHERE c.dataset_id = $1
      `, [datasetId]),
      pool.query('SELECT external_id, final_code, analyst_code FROM epen.survey_cases WHERE dataset_id = $1 AND final_code IS NOT NULL', [referenceId]),
    ]);
    const originLabel = { ml: 'ml', llm: 'llm', human: 'human' };
    const comparison = compareWithReference(
      systemCases.rows.map(row => ({ ...row, origin: originLabel[row.origin] || 'pendiente' })),
      referenceCases.rows,
    );
    res.json({
      system: { id: Number(system.rows[0].id), name: system.rows[0].name, period: system.rows[0].period, version: system.rows[0].version },
      reference: { id: Number(reference.rows[0].id), name: reference.rows[0].name, period: reference.rows[0].period, version: reference.rows[0].version, records: reference.rows[0].record_count },
      ...comparison,
      note: 'Comparación contra una codificación de referencia. Una diferencia indica que el sistema y la referencia no coinciden; no demuestra por sí sola que uno de los dos tenga razón.',
    });
  });

  // Referencia de un caso: código y analista de la base codificada, si existe el mismo registro.
  router.get('/api/datasets/:datasetId/cases/:externalId/reference', requireRole('analista', 'supervisor', 'auditor', 'admin'), async (req, res) => {
    const datasetId = validId(req.params.datasetId);
    if (!datasetId) throw httpError(400, 'Base no válida.');
    const externalId = String(req.params.externalId || '').slice(0, 120);
    const [caseRow, ref] = await Promise.all([
      getPool().query('SELECT final_code FROM epen.survey_cases WHERE dataset_id = $1 AND external_id = $2', [datasetId, externalId]),
      getPool().query(`
        SELECT rc.final_code, rc.analyst_code, rd.id AS dataset_id, rd.name, rd.period
        FROM epen.survey_cases rc JOIN epen.datasets rd ON rd.id = rc.dataset_id
        WHERE rd.kind = 'reference' AND rd.status = 'active' AND rc.external_id = $1 AND rc.final_code IS NOT NULL
        ORDER BY rc.id DESC LIMIT 1
      `, [externalId]),
    ]);
    if (!caseRow.rowCount) throw httpError(404, 'Registro no encontrado.');
    const systemCode = caseRow.rows[0].final_code ? String(caseRow.rows[0].final_code) : null;
    if (!ref.rowCount) return res.json({ systemCode, reference: null });
    const row = ref.rows[0];
    res.json({
      systemCode,
      reference: { datasetId: Number(row.dataset_id), name: row.name, period: row.period, code: String(row.final_code), analyst: row.analyst_code || null, agrees: systemCode === String(row.final_code) },
    });
  });

  // Tablero de codificación para Métricas: avance por codificador, exactitud contra la referencia activa,
  // división, confusiones y serie diaria. El bloque de codificadores solo aparece con la referencia activa
  // o cuando un codificador completó la base.
  router.get('/api/datasets/:datasetId/coding-dashboard', requireRole('supervisor', 'auditor', 'admin'), async (req, res) => {
    const datasetId = validId(req.params.datasetId);
    if (!datasetId) throw httpError(400, 'Base no válida.');
    const pool = getPool();
    const [recordsResult, activeResult, humanResult] = await Promise.all([
      pool.query('SELECT count(*)::int AS n FROM epen.survey_cases WHERE dataset_id = $1', [datasetId]),
      pool.query("SELECT id, name, period, version, record_count FROM epen.datasets WHERE kind = 'reference' AND status = 'active' LIMIT 1"),
      pool.query(`
        SELECT d.id, d.case_id, d.decided_by AS user_id, d.decision, d.created_at,
          u.full_name, u.username, u.analyst_code
        FROM epen.decisions d
        JOIN epen.survey_cases c ON c.id = d.case_id
        JOIN epen.users u ON u.id = d.decided_by
        WHERE c.dataset_id = $1 AND d.source = 'human'
      `, [datasetId]),
    ]);
    const records = recordsResult.rows[0].n;
    const activeRef = activeResult.rows[0] || null;
    let comparison = null;
    if (activeRef) {
      const [systemCases, referenceCases] = await Promise.all([
        pool.query(`
          SELECT c.external_id, c.p309, c.final_code, c.confianza_ml, origin.source AS origin
          FROM epen.survey_cases c
          LEFT JOIN LATERAL (SELECT source FROM epen.decisions WHERE case_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) origin ON true
          WHERE c.dataset_id = $1
        `, [datasetId]),
        pool.query('SELECT external_id, final_code, analyst_code FROM epen.survey_cases WHERE dataset_id = $1 AND final_code IS NOT NULL', [activeRef.id]),
      ]);
      const originLabel = { ml: 'ml', llm: 'llm', human: 'human' };
      comparison = compareWithReference(
        systemCases.rows.map(row => ({ ...row, origin: originLabel[row.origin] || 'pendiente' })),
        referenceCases.rows,
      );
    }
    const payload = buildCodingDashboard({
      records,
      reference: activeRef ? { id: Number(activeRef.id), name: activeRef.name, period: activeRef.period, records: activeRef.record_count } : null,
      comparison,
      comparedItems: comparison?.items || [],
      humanDecisions: humanResult.rows.map(row => ({ ...row, case_id: Number(row.case_id) })),
      activeReference: Boolean(activeRef),
    });
    res.json(payload);
  });

  return router;
}

