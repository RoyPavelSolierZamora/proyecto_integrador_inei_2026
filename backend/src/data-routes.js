import express from 'express';
import { audit } from './audit.js';
import { getPool, transaction } from './db.js';
import { requireAuth, requireCsrf, requireRole } from './middleware.js';
import { r2Health } from './r2-client.js';
import { enqueueR2Job, listR2Jobs, requestR2JobCancellation } from './r2-jobs.js';
import { parseRawEpenCsv } from './raw-csv.js';
import { classifyWithQwen } from './qwen-client.js';
import { buildCsv, RESULT_HEADERS } from './csv-export.js';

const CASE_SELECT = `
  SELECT c.id, c.dataset_id, c.external_id, c.p309, c.p308, c.p308a, c.c310, c.c311, c.c366,
         c.candidates, c.confianza_ml, c.r2_evidence, c.status, c.final_code, c.updated_at,
         llm.decision AS llm_decision, llm.code AS llm_code,
         llm.justification AS llm_justification, llm.latency_seconds AS llm_latency,
         human.decision AS human_decision,
         latest.source AS latest_source, latest.decision AS latest_decision,
         latest.model AS latest_model, latest.justification AS latest_justification,
         COALESCE(latest_actor.full_name,
           CASE latest.source WHEN 'ml' THEN 'Clasificación automática' WHEN 'llm' THEN 'Asistente de IA' ELSE NULL END
         ) AS latest_actor
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
  LEFT JOIN LATERAL (
    SELECT source, decision, model, justification, decided_by FROM epen.decisions WHERE case_id = c.id
    ORDER BY created_at DESC, id DESC LIMIT 1
  ) latest ON true
  LEFT JOIN epen.users latest_actor ON latest_actor.id = latest.decided_by
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
    active: row.status === 'active', status: row.status, synthetic: row.is_synthetic, notes: row.notes,
  };
}

function cleanEvidenceText(value, maximum) {
  return String(value || '').trim().slice(0, maximum);
}

export function mapR2Evidence(value) {
  const evidence = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const quality = evidence.calidad_entrada && typeof evidence.calidad_entrada === 'object'
    ? {
        nivel: ['alta', 'media', 'baja'].includes(evidence.calidad_entrada.nivel) ? evidence.calidad_entrada.nivel : 'desconocida',
        motivos: Array.isArray(evidence.calidad_entrada.motivos)
          ? evidence.calidad_entrada.motivos.map(reason => cleanEvidenceText(reason, 80)).filter(Boolean).slice(0, 8)
          : [],
      }
    : null;
  const cases = Array.isArray(evidence.casos_similares) ? evidence.casos_similares : [];
  const similarCases = cases.flatMap(item => {
    const code = cleanEvidenceText(item?.codigo, 4);
    const similarity = Number(item?.similitud);
    const p309 = cleanEvidenceText(item?.p309, 240);
    if (!/^\d{4}$/.test(code) || !Number.isFinite(similarity) || similarity <= 0 || similarity > 1 || !p309) return [];
    return [{
      codigo: code,
      similitud: similarity,
      p309,
      p308: cleanEvidenceText(item?.p308, 160),
      p308a: cleanEvidenceText(item?.p308a, 240),
    }];
  }).slice(0, 3);
  return {
    calibracion: cleanEvidenceText(evidence.calibracion, 80) || null,
    calidad_entrada: quality,
    casos_similares: similarCases,
    reglas_estructurales: Array.isArray(evidence.reglas_estructurales)
      ? evidence.reglas_estructurales.map(rule => cleanEvidenceText(rule, 100)).filter(Boolean).slice(0, 5)
      : [],
  };
}

export function mapCase(row) {
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
    c310: row.c310 || '', c311: row.c311 || '', c366: row.c366 || '',
    candidatos: Array.isArray(row.candidates) ? row.candidates : [], confianza_ml: row.confianza_ml === null ? 0 : Number(row.confianza_ml),
    evidencia_r2: mapR2Evidence(row.r2_evidence),
    estado, codigo_final: row.final_code, qwen,
    origen_decision: row.latest_source === 'ml' ? 'r2' : row.latest_source === 'llm' ? 'qwen' : row.latest_source === 'human' ? 'humano' : 'pendiente',
    responsable_decision: row.latest_actor || null,
    tipo_decision: row.latest_decision || null,
    modelo_decision: row.latest_model || null,
    justificacion_decision: row.latest_justification || null,
    updated_at: row.updated_at,
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

async function datasetById(db, datasetId) {
  const result = await db.query(`
    SELECT d.*, u.full_name AS imported_by_name
    FROM epen.datasets d LEFT JOIN epen.users u ON u.id = d.imported_by
    WHERE d.id = $1
  `, [datasetId]);
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
           COALESCE(u.full_name, CASE WHEN d.source = 'llm' THEN 'Asistente de IA' WHEN d.source = 'ml' THEN 'Clasificador automático' ELSE 'Sistema sintético' END) AS actor
    FROM epen.decisions d
    JOIN epen.survey_cases c ON c.id = d.case_id
    LEFT JOIN epen.users u ON u.id = d.decided_by
    WHERE c.dataset_id = $1 ORDER BY d.created_at, d.id
  `, [datasetId]);
  const labels = { confirmation: 'confirmación', correction: 'corrección', derivation: 'derivación', selection: 'consulta de IA', revision: 'consulta de IA', automatic: 'codificación automática' };
  return result.rows.map(row => ({
    id: Number(row.id), caseId: row.external_id, action: labels[row.decision] || row.decision,
    code: row.code, user: row.actor, at: row.created_at,
    source: row.source === 'ml' ? 'automatic' : row.source === 'llm' ? 'ai' : 'human',
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
        headers: {
          Accept: 'application/json',
          ...(config.r3ApiToken ? { Authorization: `Bearer ${config.r3ApiToken}` } : {}),
        },
        signal: AbortSignal.timeout(7_000),
      });
      if (!response.ok) throw httpError(503, `La capa R3 respondió ${response.status}.`);
      const health = await response.json();
      res.json({ ...health, mode: config.qwenMode, execution: config.r3Mode || 'local' });
    } catch (cause) {
      if (cause.status) throw cause;
      throw httpError(503, cause.name === 'TimeoutError'
        ? 'La capa R3 no respondió dentro de 7 segundos.'
        : 'No se pudo conectar con la capa R3 local.');
    }
  });

  router.get('/api/system/r2-health', requireRole('operador', 'admin'), async (_req, res) => {
    res.json(await r2Health(config));
  });

  router.get('/api/r2/jobs', requireRole('operador', 'admin'), async (_req, res) => {
    res.json({ jobs: await listR2Jobs() });
  });

  router.post('/api/r2/jobs/:id/cancel', requireRole('operador', 'admin'), requireCsrf, async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isSafeInteger(jobId) || jobId < 1) throw httpError(400, 'El trabajo solicitado no es válido.');
    const result = await requestR2JobCancellation(jobId);
    if (result.outcome === 'missing') throw httpError(404, 'Trabajo no encontrado.');
    if (result.outcome === 'finished') throw httpError(409, 'El trabajo ya finalizó y no se puede cancelar.');
    await audit(getPool(), req, 'r2.job_cancel_requested', 'processing_job', jobId, { immediate: result.outcome === 'cancelled' });
    res.status(202).json({ status: result.outcome });
  });

  router.post('/api/r2/jobs', requireRole('operador', 'admin'), requireCsrf,
    express.text({ type: ['text/csv', 'text/plain'], limit: '25mb' }), async (req, res) => {
      const name = String(req.query.name || '').trim();
      const period = String(req.query.period || '').trim();
      const fileName = String(req.query.fileName || 'base-epen.csv').trim();
      const threshold = Number(req.query.threshold);
      const synthetic = String(req.query.synthetic || 'false') === 'true';
      const qwenMode = String(req.query.qwenMode || 'manual');
      if (!name || name.length > 160 || !period || period.length > 40) throw httpError(400, 'Nombre y periodo son obligatorios.');
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw httpError(400, 'El umbral R2 debe estar entre 0 y 1.');
      if (!['manual', 'automatic'].includes(qwenMode)) throw httpError(400, 'El modo Qwen debe ser manual o automático.');
      if (qwenMode === 'automatic' && config.qwenMode !== 'real') throw httpError(409, 'El procesamiento automático requiere Qwen real.');
      let records;
      try { records = parseRawEpenCsv(req.body); }
      catch (cause) { throw httpError(400, cause.message); }
      const created = await transaction(async client => {
        const versionResult = await client.query('SELECT COALESCE(max(version), 0)::int + 1 AS next FROM epen.datasets WHERE name = $1 AND period = $2', [name, period]);
        const code = `R2-${Date.now()}`;
        const dataset = await client.query(`
          INSERT INTO epen.datasets (code, name, period, version, source_filename, status, record_count, imported_by, is_synthetic, notes)
          VALUES ($1, $2, $3, $4, $5, 'staging', $6, $7, $8, 'Pendiente de procesamiento por microservicio R2')
          RETURNING id
        `, [code, name, period, versionResult.rows[0].next, fileName.slice(0, 500), records.length, req.auth.user.id, synthetic]);
        const datasetId = dataset.rows[0].id;
        for (const row of records) {
          await client.query(`
            INSERT INTO epen.survey_cases (dataset_id, external_id, p309, p308, p308a, c310, c311, c366, candidates)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
          `, [datasetId, row.id_registro, row.p309, row.p308 || null, row.p308a || null,
            row.c310 || null, row.c311 || null, row.c366 || null]);
        }
        const job = await client.query(`
          INSERT INTO epen.processing_jobs (dataset_id, threshold, total_records, created_by, qwen_mode)
          VALUES ($1, $2, $3, $4, $5) RETURNING id
        `, [datasetId, threshold, records.length, req.auth.user.id, qwenMode]);
        await audit(client, req, 'r2.job_created', 'processing_job', job.rows[0].id, { datasetId: Number(datasetId), records: records.length, threshold, fileName, synthetic, qwenMode });
        return { jobId: Number(job.rows[0].id), datasetId: Number(datasetId), records: records.length };
      });
      enqueueR2Job(created.jobId, config);
      res.status(202).json(created);
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

  router.get('/api/datasets/:id/workspace', requireRole('analista', 'supervisor', 'auditor', 'admin'), async (req, res) => {
    const datasetId = Number(req.params.id);
    if (!Number.isSafeInteger(datasetId) || datasetId < 1) throw httpError(400, 'La base solicitada no es válida.');
    const pool = getPool();
    const dataset = await datasetById(pool, datasetId);
    if (!dataset) throw httpError(404, 'Base no encontrada.');
    res.json({
      dataset,
      cases: await casesForDataset(pool, datasetId),
      events: await eventsForDataset(pool, datasetId),
    });
  });

  router.get('/api/datasets/:id/export', requireRole('operador', 'supervisor', 'auditor', 'admin'), async (req, res) => {
    const datasetId = Number(req.params.id);
    if (!Number.isSafeInteger(datasetId) || datasetId < 1) throw httpError(400, 'La base solicitada no es válida.');
    const exported = await transaction(async client => {
      const dataset = await client.query('SELECT id, name, period, status FROM epen.datasets WHERE id = $1', [datasetId]);
      if (!dataset.rowCount) throw httpError(404, 'Base no encontrada.');
      const result = await client.query(`
        SELECT c.external_id AS id_registro, c.p309, COALESCE(c.p308, '') AS p308,
               COALESCE(c.p308a, '') AS p308a, COALESCE(c.final_code, '') AS codigo_ciiu_final,
               COALESCE(cat.description, '') AS descripcion_ciiu,
               CASE c.status WHEN 'resolved' THEN 'codificado' WHEN 'review' THEN 'revision_humana'
                 WHEN 'processing' THEN 'procesando' WHEN 'error' THEN 'error' ELSE 'pendiente' END AS estado,
               CASE latest.source WHEN 'ml' THEN 'R2' WHEN 'llm' THEN 'Qwen' WHEN 'human' THEN 'humano' ELSE '' END AS origen_decision,
               COALESCE(latest.decision, '') AS decision,
               COALESCE(c.confianza_ml::text, '') AS confianza_r2,
               COALESCE(c.candidates::text, '[]') AS candidatos_r2,
               COALESCE(latest.model, '') AS modelo,
               COALESCE(latest.justification, '') AS justificacion,
               c.updated_at::text AS actualizado_en
        FROM epen.survey_cases c
        LEFT JOIN epen.ciiu_catalog cat ON cat.code = c.final_code
        LEFT JOIN LATERAL (
          SELECT d.source, d.decision, d.model, d.justification
          FROM epen.decisions d WHERE d.case_id = c.id
          ORDER BY d.created_at DESC, d.id DESC LIMIT 1
        ) latest ON true
        WHERE c.dataset_id = $1 ORDER BY c.id
      `, [datasetId]);
      await audit(client, req, 'dataset.exported', 'dataset', datasetId, { records: result.rowCount, format: 'csv', includesPending: true });
      return { dataset: dataset.rows[0], rows: result.rows };
    });
    const csv = buildCsv(RESULT_HEADERS, exported.rows);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="epen_resultados_${datasetId}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(csv);
  });

  router.get('/api/catalog', requireAuth, async (req, res) => {
    const query = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 500);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const filter = query ? 'WHERE active = true AND (code LIKE $1 OR description ILIKE $2)' : 'WHERE active = true';
    const filterValues = query ? [`${query}%`, `%${query}%`] : [];
    const totalResult = await getPool().query(`SELECT COUNT(*)::int AS total FROM epen.ciiu_catalog ${filter}`, filterValues);
    const result = await getPool().query(
      `SELECT code, description FROM epen.ciiu_catalog ${filter} ORDER BY code LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`,
      [...filterValues, limit, offset],
    );
    res.json({
      rows: result.rows.map(row => ({ codigo: row.code, descripcion: row.description })),
      total: totalResult.rows[0]?.total ?? result.rowCount,
      limit,
      offset,
    });
  });

  router.post(['/api/cases/:externalId/decision', '/api/datasets/:datasetId/cases/:externalId/decision'], requireRole('analista', 'supervisor', 'admin'), requireCsrf, async (req, res) => {
    const actionMap = { confirmación: 'confirmation', confirmation: 'confirmation', corrección: 'correction', correction: 'correction', derivación: 'derivation', derivation: 'derivation' };
    const decision = actionMap[String(req.body?.action || '')];
    const code = req.body?.code ? String(req.body.code).trim() : null;
    const justification = String(req.body?.justification || '').trim().slice(0, 2000) || null;
    if (!decision) throw httpError(400, 'La decisión no es válida.');
    if (decision !== 'derivation' && !/^\d{4}$/.test(code || '')) throw httpError(400, 'El código final debe tener 4 dígitos.');
    const updated = await transaction(async client => {
      const requestedId = req.params.datasetId ? Number(req.params.datasetId) : null;
      if (req.params.datasetId && (!Number.isSafeInteger(requestedId) || requestedId < 1)) throw httpError(400, 'La base solicitada no es válida.');
      const target = requestedId ? await datasetById(client, requestedId) : await activeDataset(client);
      if (!target) throw httpError(409, requestedId ? 'La base solicitada no existe.' : 'No existe una base activa.');
      const current = await client.query('SELECT id, candidates FROM epen.survey_cases WHERE dataset_id = $1 AND external_id = $2 FOR UPDATE', [target.id, req.params.externalId]);
      if (!current.rowCount) throw httpError(404, 'Registro no encontrado.');
      const caseId = current.rows[0].id;
      let storedDecision = decision;
      let storedJustification = justification;
      if (decision !== 'derivation') {
        const catalog = await client.query('SELECT code FROM epen.ciiu_catalog WHERE code = $1 AND active = true', [code]);
        if (!catalog.rowCount) throw httpError(400, 'El código no pertenece al catálogo CIIU activo.');
        const candidates = Array.isArray(current.rows[0].candidates) ? current.rows[0].candidates.map(item => String(item.codigo || '')) : [];
        if (!candidates.includes(code)) storedDecision = 'correction';
        if (storedDecision === 'correction' && !storedJustification) storedJustification = 'Selección manual desde el catálogo CIIU.';
      }
      await client.query('UPDATE epen.survey_cases SET status = $1, final_code = $2, updated_at = now() WHERE id = $3', [storedDecision === 'derivation' ? 'review' : 'resolved', storedDecision === 'derivation' ? null : code, caseId]);
      await client.query('INSERT INTO epen.decisions (case_id, source, decision, code, justification, decided_by) VALUES ($1, $2, $3, $4, $5, $6)', [caseId, 'human', storedDecision, storedDecision === 'derivation' ? null : code, storedJustification, req.auth.user.id]);
      await audit(client, req, `case.${storedDecision}`, 'case', caseId, { datasetId: Number(target.id), externalId: req.params.externalId, code, outsideCandidates: storedDecision === 'correction' });
      return caseByExternalId(client, target.id, req.params.externalId);
    });
    res.json({ case: updated });
  });

  router.post(['/api/cases/:externalId/qwen', '/api/datasets/:datasetId/cases/:externalId/qwen'], requireRole('analista', 'supervisor', 'admin'), requireCsrf, async (req, res) => {
    const pool = getPool();
    const requestedId = req.params.datasetId ? Number(req.params.datasetId) : null;
    if (req.params.datasetId && (!Number.isSafeInteger(requestedId) || requestedId < 1)) throw httpError(400, 'La base solicitada no es válida.');
    const target = requestedId ? await datasetById(pool, requestedId) : await activeDataset(pool);
    if (!target) throw httpError(409, requestedId ? 'La base solicitada no existe.' : 'No existe una base activa.');
    const raw = await pool.query('SELECT * FROM epen.survey_cases WHERE dataset_id = $1 AND external_id = $2', [target.id, req.params.externalId]);
    if (!raw.rowCount) throw httpError(404, 'Registro no encontrado.');
    const item = raw.rows[0];
    const { result, review, code } = await classifyWithQwen(config, item);
    await transaction(async client => {
      await client.query('INSERT INTO epen.decisions (case_id, source, decision, code, justification, model, latency_seconds) VALUES ($1, $2, $3, $4, $5, $6, $7)', [item.id, 'llm', review ? 'revision' : 'selection', code, result.justificacion || null, result.modelo || null, result.latencia_s || null]);
      if (review) await client.query("UPDATE epen.survey_cases SET status = 'review', updated_at = now() WHERE id = $1", [item.id]);
      await audit(client, req, 'case.qwen', 'case', item.id, { datasetId: Number(target.id), externalId: item.external_id, code, review, mode: config.qwenMode });
    });
    res.json({ result: { ...result, codigo: code }, case: await caseByExternalId(pool, target.id, item.external_id) });
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

