import express from 'express';
import { audit } from './audit.js';
import { getPool, transaction } from './db.js';
import { requireAuth, requireCsrf, requireRole } from './middleware.js';

const CASE_SELECT = `
  SELECT c.id, c.dataset_id, c.external_id, c.p309, c.p308, c.p308a,
         c.candidates, c.confianza_ml, c.status, c.final_code, c.updated_at,
         llm.decision AS llm_decision, llm.code AS llm_code,
         llm.justification AS llm_justification, llm.latency_seconds AS llm_latency,
         human.decision AS human_decision
  FROM epen.survey_cases c
  LEFT JOIN LATERAL (
    SELECT decision, code, justification, latency_seconds
    FROM epen.decisions WHERE case_id = c.id AND source = 'llm'
    ORDER BY created_at DESC, id DESC LIMIT 1
  ) llm ON true
  LEFT JOIN LATERAL (
    SELECT decision FROM epen.decisions WHERE case_id = c.id AND source = 'human'
    ORDER BY created_at DESC, id DESC LIMIT 1
  ) human ON true
`;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function mapDataset(row) {
  return {
    id: Number(row.id), code: row.code, name: row.name, period: row.period,
    version: row.version, fileName: row.source_filename || '—', records: row.record_count,
    importedAt: row.imported_at, importedBy: row.imported_by_name || 'Sistema',
    active: row.status === 'active', synthetic: row.is_synthetic, notes: row.notes,
  };
}

function mapCase(row) {
  let estado = 'pendiente';
  if (row.status === 'review') estado = 'revision';
  if (row.status === 'resolved') estado = row.human_decision === 'correction' ? 'corregido' : 'confirmado';
  const qwen = row.llm_decision ? {
    decision: row.llm_decision === 'revision' ? 'revision_humana' : 'seleccionar',
    codigo: row.llm_code,
    justificacion: row.llm_justification,
    latencia_s: row.llm_latency === null ? null : Number(row.llm_latency),
  } : null;
  return {
    id: Number(row.id), dataset_id: Number(row.dataset_id), id_registro: row.external_id,
    p309: row.p309, p308: row.p308 || '', p308a: row.p308a || '',
    candidatos: row.candidates, confianza_ml: row.confianza_ml === null ? 0 : Number(row.confianza_ml),
    estado, codigo_final: row.final_code, qwen, updated_at: row.updated_at,
  };
}

async function datasets(db) {
  const result = await db.query(`
    SELECT d.*, u.full_name AS imported_by_name
    FROM epen.datasets d LEFT JOIN epen.users u ON u.id = d.imported_by
    ORDER BY d.imported_at DESC, d.id DESC
  `);
  return result.rows.map(mapDataset);
}

async function activeDataset(db) {
  const result = await db.query(`
    SELECT d.*, u.full_name AS imported_by_name
    FROM epen.datasets d LEFT JOIN epen.users u ON u.id = d.imported_by
    WHERE d.status = 'active' ORDER BY d.activated_at DESC NULLS LAST LIMIT 1
  `);
  return result.rowCount ? mapDataset(result.rows[0]) : null;
}

async function casesForDataset(db, datasetId) {
  const result = await db.query(`${CASE_SELECT} WHERE c.dataset_id = $1 ORDER BY c.id`, [datasetId]);
  return result.rows.map(mapCase);
}

async function caseByExternalId(db, datasetId, externalId) {
  const result = await db.query(`${CASE_SELECT} WHERE c.dataset_id = $1 AND c.external_id = $2`, [datasetId, externalId]);
  return result.rowCount ? mapCase(result.rows[0]) : null;
}

async function eventsForDataset(db, datasetId) {
  const result = await db.query(`
    SELECT d.id, c.external_id, d.source, d.decision, d.code, d.created_at,
           COALESCE(u.full_name, CASE WHEN d.source = 'llm' THEN 'Qwen3' WHEN d.source = 'ml' THEN 'Clasificador R2' ELSE 'Sistema demo' END) AS actor
    FROM epen.decisions d
    JOIN epen.survey_cases c ON c.id = d.case_id
    LEFT JOIN epen.users u ON u.id = d.decided_by
    WHERE c.dataset_id = $1 ORDER BY d.created_at, d.id
  `, [datasetId]);
  const labels = { confirmation: 'confirmación', correction: 'corrección', derivation: 'derivación', selection: 'consulta Qwen', revision: 'consulta Qwen', automatic: 'codificación automática R2' };
  return result.rows.map(row => ({
    id: Number(row.id), caseId: row.external_id, action: labels[row.decision] || row.decision,
    code: row.code, user: row.actor, at: row.created_at,
  }));
}

function validateCandidates(candidates) {
  return Array.isArray(candidates) && candidates.length >= 1 && candidates.length <= 5 && candidates.every(item => /^\d{4}$/.test(String(item.codigo || '')));
}

export function planR2Simulation(rows, threshold) {
  const value = Number(threshold);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw httpError(400, 'El umbral R2 debe estar entre 0 y 1.');
  const automatic = [];
  const pending = [];
  for (const row of rows) {
    const candidate = Array.isArray(row.candidates) ? row.candidates[0] : null;
    const code = String(candidate?.codigo || '');
    if (Number(row.confianza_ml) >= value && /^\d{4}$/.test(code)) automatic.push({ id: row.id, code });
    else pending.push(row.id);
  }
  return { threshold: value, automatic, pending };
}

export function createDataRouter(config) {
  const router = express.Router();

  router.get('/api/system/r3-health', requireRole('admin'), async (_req, res) => {
    try {
      const response = await fetch(`${config.r3BaseUrl}/salud`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(7_000),
      });
      if (!response.ok) throw httpError(503, `La capa R3 respondió ${response.status}.`);
      const health = await response.json();
      res.json({ ...health, mode: config.qwenMode });
    } catch (cause) {
      if (cause.status) throw cause;
      throw httpError(503, cause.name === 'TimeoutError'
        ? 'La capa R3 no respondió dentro de 7 segundos.'
        : 'No se pudo conectar con la capa R3 local.');
    }
  });

  router.get('/api/data/bootstrap', requireAuth, async (_req, res) => {
    const pool = getPool();
    const active = await activeDataset(pool);
    res.json({
      datasets: await datasets(pool),
      activeDataset: active,
      cases: active ? await casesForDataset(pool, active.id) : [],
      events: active ? await eventsForDataset(pool, active.id) : [],
    });
  });

  router.get('/api/catalog', requireAuth, async (req, res) => {
    const query = String(req.query.q || '').trim();
    const result = query
      ? await getPool().query('SELECT code, description FROM epen.ciiu_catalog WHERE active = true AND (code LIKE $1 OR description ILIKE $2) ORDER BY code LIMIT 20', [`${query}%`, `%${query}%`])
      : await getPool().query('SELECT code, description FROM epen.ciiu_catalog WHERE active = true ORDER BY code LIMIT 20');
    res.json({ rows: result.rows.map(row => ({ codigo: row.code, descripcion: row.description })) });
  });

  router.post('/api/cases/:externalId/decision', requireRole('analista', 'supervisor', 'admin'), requireCsrf, async (req, res) => {
    const actionMap = { confirmación: 'confirmation', confirmation: 'confirmation', corrección: 'correction', correction: 'correction', derivación: 'derivation', derivation: 'derivation' };
    const decision = actionMap[String(req.body?.action || '')];
    const code = req.body?.code ? String(req.body.code) : null;
    if (!decision) throw httpError(400, 'La decisión no es válida.');
    if (decision !== 'derivation' && !/^\d{4}$/.test(code || '')) throw httpError(400, 'El código final debe tener 4 dígitos.');
    const updated = await transaction(async client => {
      const active = await activeDataset(client);
      if (!active) throw httpError(409, 'No existe una base activa.');
      const current = await client.query('SELECT id FROM epen.survey_cases WHERE dataset_id = $1 AND external_id = $2 FOR UPDATE', [active.id, req.params.externalId]);
      if (!current.rowCount) throw httpError(404, 'Registro no encontrado.');
      const caseId = current.rows[0].id;
      await client.query('UPDATE epen.survey_cases SET status = $1, final_code = $2, updated_at = now() WHERE id = $3', [decision === 'derivation' ? 'review' : 'resolved', decision === 'derivation' ? null : code, caseId]);
      await client.query('INSERT INTO epen.decisions (case_id, source, decision, code, decided_by) VALUES ($1, $2, $3, $4, $5)', [caseId, 'human', decision, decision === 'derivation' ? null : code, req.auth.user.id]);
      await audit(client, req, `case.${decision}`, 'case', caseId, { externalId: req.params.externalId, code });
      return caseByExternalId(client, active.id, req.params.externalId);
    });
    res.json({ case: updated });
  });

  router.post('/api/cases/:externalId/qwen', requireRole('analista', 'supervisor', 'admin'), requireCsrf, async (req, res) => {
    const pool = getPool();
    const active = await activeDataset(pool);
    if (!active) throw httpError(409, 'No existe una base activa.');
    const raw = await pool.query('SELECT * FROM epen.survey_cases WHERE dataset_id = $1 AND external_id = $2', [active.id, req.params.externalId]);
    if (!raw.rowCount) throw httpError(404, 'Registro no encontrado.');
    const item = raw.rows[0];
    let result;
    if (config.qwenMode === 'demo') {
      if (!item.demo_qwen) throw httpError(409, 'Este registro no tiene una respuesta Qwen sintética preparada.');
      result = item.demo_qwen;
    } else {
      let response;
      try {
        response = await fetch(`${config.r3BaseUrl}/codificar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ id_registro: item.external_id, p309: item.p309, candidatos: item.candidates, confianza_ml: item.confianza_ml }),
          signal: AbortSignal.timeout(90_000),
        });
      } catch (cause) {
        throw httpError(503, cause.name === 'TimeoutError'
          ? 'La capa R3 no respondió dentro de 90 segundos.'
          : 'No se pudo conectar con la capa R3 local.');
      }
      if (!response.ok) throw httpError(503, `La capa R3 respondió ${response.status}.`);
      result = await response.json();
    }
    const review = result.decision === 'revision_humana' || result.requiere_revision === 1;
    const code = review ? null : String(result.codigo || '');
    if (!review && !item.candidates.some(candidate => candidate.codigo === code)) throw httpError(422, 'Qwen devolvió un código fuera de los candidatos de R2.');
    await transaction(async client => {
      await client.query('INSERT INTO epen.decisions (case_id, source, decision, code, justification, model, latency_seconds) VALUES ($1, $2, $3, $4, $5, $6, $7)', [item.id, 'llm', review ? 'revision' : 'selection', code, result.justificacion || null, result.modelo || (config.qwenMode === 'demo' ? 'qwen-demo' : null), result.latencia_s || null]);
      if (review) await client.query("UPDATE epen.survey_cases SET status = 'review', updated_at = now() WHERE id = $1", [item.id]);
      await audit(client, req, 'case.qwen', 'case', item.id, { externalId: item.external_id, code, review, mode: config.qwenMode });
    });
    res.json({ result: { ...result, codigo: code }, case: await caseByExternalId(pool, active.id, item.external_id) });
  });

  router.post('/api/admin/datasets/:id/activate', requireRole('admin'), requireCsrf, async (req, res) => {
    await transaction(async client => {
      const target = await client.query('SELECT id FROM epen.datasets WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!target.rowCount) throw httpError(404, 'Base no encontrada.');
      await client.query("UPDATE epen.datasets SET status = 'archived' WHERE status = 'active'");
      await client.query("UPDATE epen.datasets SET status = 'active', activated_at = now() WHERE id = $1", [req.params.id]);
      await audit(client, req, 'dataset.activated', 'dataset', req.params.id);
    });
    res.json({ ok: true });
  });

  router.post('/api/admin/datasets/:id/simulate-r2', requireRole('admin'), requireCsrf, async (req, res) => {
    const result = await transaction(async client => {
      const target = await client.query('SELECT id, status, is_synthetic FROM epen.datasets WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!target.rowCount) throw httpError(404, 'Base no encontrada.');
      if (!target.rows[0].is_synthetic) throw httpError(409, 'La simulación R2 solo está permitida en bases sintéticas.');
      if (target.rows[0].status !== 'active') throw httpError(409, 'Activa la base antes de ejecutar la simulación R2.');
      const existing = await client.query('SELECT count(*)::int AS total FROM epen.decisions d JOIN epen.survey_cases c ON c.id = d.case_id WHERE c.dataset_id = $1', [target.rows[0].id]);
      if (existing.rows[0].total > 0) throw httpError(409, 'Esta base ya tiene decisiones registradas; usa una base sintética nueva para repetir la simulación.');
      const cases = await client.query('SELECT id, candidates, confianza_ml FROM epen.survey_cases WHERE dataset_id = $1 ORDER BY id FOR UPDATE', [target.rows[0].id]);
      const plan = planR2Simulation(cases.rows, req.body?.threshold);
      for (const item of plan.automatic) {
        await client.query("UPDATE epen.survey_cases SET status = 'resolved', final_code = $1, updated_at = now() WHERE id = $2", [item.code, item.id]);
        await client.query("INSERT INTO epen.decisions (case_id, source, decision, code, justification, model) VALUES ($1, 'ml', 'automatic', $2, $3, 'r2-simulacion-umbral')", [item.id, item.code, `Confianza R2 igual o superior a ${plan.threshold.toFixed(2)}`]);
      }
      await audit(client, req, 'dataset.r2_simulated', 'dataset', target.rows[0].id, { threshold: plan.threshold, automatic: plan.automatic.length, pending: plan.pending.length });
      return { threshold: plan.threshold, automatic: plan.automatic.length, pending: plan.pending.length };
    });
    res.json(result);
  });

  router.post('/api/admin/datasets', requireRole('admin'), requireCsrf, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const period = String(req.body?.period || '').trim();
    const fileName = String(req.body?.fileName || '').trim();
    const rows = req.body?.rows;
    const synthetic = req.body?.synthetic === true;
    if (!name || !period || !Array.isArray(rows) || rows.length < 1 || rows.length > 5000) throw httpError(400, 'La importación debe incluir nombre, periodo y entre 1 y 5000 registros.');
    if (rows.some(row => !row.id_registro || !row.p309 || !validateCandidates(row.candidatos))) throw httpError(400, 'Uno o más registros no cumplen el contrato R2 → R3.');
    const dataset = await transaction(async client => {
      await client.query("UPDATE epen.datasets SET status = 'archived' WHERE status = 'active'");
      const code = `BASE-${Date.now()}`;
      const created = await client.query(`
        INSERT INTO epen.datasets (code, name, period, source_filename, status, record_count, imported_by, activated_at, is_synthetic)
        VALUES ($1, $2, $3, $4, 'active', $5, $6, now(), $7) RETURNING id
      `, [code, name, period, fileName || 'importacion.csv', rows.length, req.auth.user.id, synthetic]);
      const datasetId = created.rows[0].id;
      for (const row of rows) {
        await client.query(`
          INSERT INTO epen.survey_cases (dataset_id, external_id, p309, p308, p308a, candidates, confianza_ml)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        `, [datasetId, String(row.id_registro), String(row.p309), row.p308 || null, row.p308a || null, JSON.stringify(row.candidatos), row.confianza_ml ?? null]);
      }
      await audit(client, req, 'dataset.imported', 'dataset', datasetId, { code, records: rows.length, fileName, synthetic });
      return datasetId;
    });
    res.status(201).json({ id: Number(dataset) });
  });

  return router;
}

