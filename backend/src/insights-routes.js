import { createHash } from 'node:crypto';
import express from 'express';
import { getPool } from './db.js';
import { requireAuth, requireCsrf, requireRole } from './middleware.js';
import { compareCodeRows, detectAssistantIntent, helpAnswer } from './insights.js';

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function datasetSummary(db, datasetId) {
  const dataset = await db.query(`
    SELECT id, name, period, version, status, record_count
    FROM epen.datasets WHERE id = $1
  `, [datasetId]);
  if (!dataset.rowCount) throw httpError(404, 'Base no encontrada.');
  const totals = await db.query(`
    WITH latest AS (
      SELECT DISTINCT ON (d.case_id) d.case_id, d.source
      FROM epen.decisions d
      JOIN epen.survey_cases c ON c.id = d.case_id
      WHERE c.dataset_id = $1
      ORDER BY d.case_id, d.created_at DESC, d.id DESC
    )
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE c.status = 'resolved')::int AS resolved,
      count(*) FILTER (WHERE c.status = 'review')::int AS review,
      count(*) FILTER (WHERE c.status = 'pending')::int AS pending,
      count(*) FILTER (WHERE l.source = 'ml')::int AS automatic,
      count(*) FILTER (WHERE l.source = 'llm')::int AS ai,
      count(*) FILTER (WHERE l.source = 'human')::int AS human,
      COALESCE(avg(c.confianza_ml), 0)::float8 AS average_confidence
    FROM epen.survey_cases c LEFT JOIN latest l ON l.case_id = c.id
    WHERE c.dataset_id = $1
  `, [datasetId]);
  const top = await db.query(`
    SELECT c.final_code AS code, COALESCE(cat.description, 'Sin descripción') AS description,
      count(*)::int AS count
    FROM epen.survey_cases c
    LEFT JOIN epen.ciiu_catalog cat ON cat.code = c.final_code
    WHERE c.dataset_id = $1 AND c.final_code IS NOT NULL
    GROUP BY c.final_code, cat.description
    ORDER BY count(*) DESC, c.final_code LIMIT 15
  `, [datasetId]);
  const meta = dataset.rows[0];
  const summary = totals.rows[0];
  const denominator = Number(summary.resolved) || 0;
  return {
    dataset: { id: Number(meta.id), name: meta.name, period: meta.period, version: meta.version, status: meta.status },
    totals: {
      total: Number(summary.total), resolved: Number(summary.resolved), review: Number(summary.review), pending: Number(summary.pending),
      automatic: Number(summary.automatic), ai: Number(summary.ai), human: Number(summary.human), averageConfidence: Number(summary.average_confidence),
    },
    topCodes: top.rows.map(row => ({ code: row.code, description: row.description, count: Number(row.count), share: denominator ? Number(row.count) / denominator : 0 })),
  };
}

async function codeDistribution(db, datasetId) {
  const result = await db.query(`
    SELECT c.final_code AS code, COALESCE(cat.description, 'Sin descripción') AS description,
      count(*)::int AS count
    FROM epen.survey_cases c
    LEFT JOIN epen.ciiu_catalog cat ON cat.code = c.final_code
    WHERE c.dataset_id = $1 AND c.final_code IS NOT NULL
    GROUP BY c.final_code, cat.description
    ORDER BY c.final_code
  `, [datasetId]);
  const total = result.rows.reduce((sum, row) => sum + Number(row.count), 0);
  return result.rows.map(row => ({
    code: row.code,
    description: row.description,
    count: Number(row.count),
    share: total ? Number(row.count) / total : 0,
  }));
}

async function compareDatasets(db, leftId, rightId) {
  const [left, right, leftCodes, rightCodes] = await Promise.all([
    datasetSummary(db, leftId), datasetSummary(db, rightId),
    codeDistribution(db, leftId), codeDistribution(db, rightId),
  ]);
  return { left, right, codeChanges: compareCodeRows(leftCodes, rightCodes) };
}

async function similarCases(db, datasetId, externalId) {
  const source = await db.query(`SELECT id, p309 FROM epen.survey_cases WHERE dataset_id = $1 AND external_id = $2`, [datasetId, externalId]);
  if (!source.rowCount) throw httpError(404, 'Registro no encontrado.');
  const text = String(source.rows[0].p309 || '').trim();
  if (!text) return { source: { externalId, p309: '' }, rows: [] };
  const result = await db.query(`
    WITH query AS (SELECT websearch_to_tsquery('simple', $2) AS value)
    SELECT c.external_id, c.p309, c.p308, c.p308a, c.final_code,
      d.id AS dataset_id, d.name AS dataset_name, d.period, d.version,
      COALESCE(cat.description, '') AS description,
      ts_rank_cd(to_tsvector('simple', coalesce(c.p309, '') || ' ' || coalesce(c.p308, '') || ' ' || coalesce(c.p308a, '')), query.value)::float8 AS similarity,
      COALESCE(actor.full_name, CASE latest.source WHEN 'ml' THEN 'Clasificación automática' WHEN 'llm' THEN 'Asistente de IA' ELSE 'Sin responsable' END) AS actor
    FROM epen.survey_cases c
    JOIN epen.datasets d ON d.id = c.dataset_id
    CROSS JOIN query
    LEFT JOIN epen.ciiu_catalog cat ON cat.code = c.final_code
    LEFT JOIN LATERAL (
      SELECT dec.source, dec.decided_by FROM epen.decisions dec WHERE dec.case_id = c.id ORDER BY dec.created_at DESC, dec.id DESC LIMIT 1
    ) latest ON true
    LEFT JOIN epen.users actor ON actor.id = latest.decided_by
    WHERE c.id <> $1 AND c.final_code IS NOT NULL
      AND to_tsvector('simple', coalesce(c.p309, '') || ' ' || coalesce(c.p308, '') || ' ' || coalesce(c.p308a, '')) @@ query.value
    ORDER BY similarity DESC, c.updated_at DESC LIMIT 12
  `, [source.rows[0].id, text]);
  return {
    source: { externalId, p309: text },
    rows: result.rows.map(row => ({
      externalId: row.external_id, p309: row.p309, p308: row.p308 || '', p308a: row.p308a || '', code: row.final_code,
      description: row.description, datasetId: Number(row.dataset_id), datasetName: row.dataset_name, period: row.period,
      version: row.version, similarity: Number(row.similarity), actor: row.actor,
    })),
  };
}

async function qualitySummary(db, datasetId) {
  const dataset = await db.query('SELECT id, name, period, version FROM epen.datasets WHERE id = $1', [datasetId]);
  if (!dataset.rowCount) throw httpError(404, 'Base no encontrada.');
  const rows = await db.query(`
    WITH human AS (
      SELECT d.id, d.case_id, d.code, d.decision, d.decided_by
      FROM epen.decisions d JOIN epen.survey_cases c ON c.id = d.case_id
      WHERE c.dataset_id = $1 AND d.source = 'human' AND d.decided_by IS NOT NULL
    ), reviewed AS (
      SELECT DISTINCT ON (decision_id) decision_id, 1::int AS reviewed,
        (verdict = 'incorrect')::int AS incorrect
      FROM epen.quality_reviews
      WHERE decision_id IS NOT NULL
      ORDER BY decision_id, created_at DESC, id DESC
    )
    SELECT u.id, u.full_name, u.username,
      count(h.id)::int AS decisions,
      count(h.id) FILTER (WHERE h.decision = 'correction')::int AS corrections,
      COALESCE(sum(r.reviewed), 0)::int AS reviewed,
      COALESCE(sum(r.incorrect), 0)::int AS incorrect
    FROM human h JOIN epen.users u ON u.id = h.decided_by
    LEFT JOIN reviewed r ON r.decision_id = h.id
    GROUP BY u.id, u.full_name, u.username ORDER BY decisions DESC, u.full_name
  `, [datasetId]);
  const concentration = await db.query(`
    SELECT d.decided_by AS user_id, left(d.code, 2) AS branch, count(*)::int AS count
    FROM epen.decisions d JOIN epen.survey_cases c ON c.id = d.case_id
    WHERE c.dataset_id = $1 AND d.source = 'human' AND d.decided_by IS NOT NULL AND d.code IS NOT NULL
    GROUP BY d.decided_by, left(d.code, 2)
  `, [datasetId]);
  const byUser = new Map();
  for (const row of concentration.rows) {
    const list = byUser.get(String(row.user_id)) || [];
    list.push({ branch: row.branch, count: Number(row.count) });
    byUser.set(String(row.user_id), list);
  }
  return {
    dataset: { ...dataset.rows[0], id: Number(dataset.rows[0].id) },
    coders: rows.rows.map(row => {
      const branches = byUser.get(String(row.id)) || [];
      const total = branches.reduce((sum, item) => sum + item.count, 0);
      const dominant = branches.sort((a, b) => b.count - a.count)[0] || null;
      const reviewed = Number(row.reviewed);
      return {
        id: Number(row.id), name: row.full_name, username: row.username, decisions: Number(row.decisions), corrections: Number(row.corrections),
        reviewed, incorrect: Number(row.incorrect), errorRate: reviewed ? Number(row.incorrect) / reviewed : null,
        dominantBranch: dominant?.branch || null, dominantShare: dominant && total ? dominant.count / total : null,
      };
    }),
  };
}

function summaryAnswer(summary) {
  const t = summary.totals;
  const top = summary.topCodes.slice(0, 3).map(item => `${item.code} (${item.count})`).join(', ') || 'sin códigos finales';
  return `${summary.dataset.name} · ${summary.dataset.period} · v${summary.dataset.version} contiene ${t.total} registros: ${t.resolved} resueltos, ${t.review} en revisión y ${t.pending} pendientes. Origen de la última decisión: ${t.automatic} clasificación automática, ${t.ai} asistencia de IA y ${t.human} personas. Códigos más frecuentes: ${top}.`;
}

function comparisonAnswer(value) {
  const changes = value.codeChanges.slice(0, 3).map(item => `${item.code}: ${(item.change * 100).toFixed(1)} puntos porcentuales`).join('; ') || 'sin variaciones calculables';
  return `Comparación entre ${value.left.dataset.period} y ${value.right.dataset.period}. Registros resueltos: ${value.left.totals.resolved} frente a ${value.right.totals.resolved}. Mayores cambios relativos: ${changes}. Estas diferencias describen la distribución observada y no prueban por sí solas un cambio económico o un error.`;
}

function qualityAnswer(value) {
  const reviewed = value.coders.reduce((sum, item) => sum + item.reviewed, 0);
  const incorrect = value.coders.reduce((sum, item) => sum + item.incorrect, 0);
  return `La base tiene decisiones humanas de ${value.coders.length} codificador(es). Existen ${reviewed} revisiones formales y ${incorrect} observaciones marcadas como incorrectas. Las tasas de error solo se muestran cuando hay revisión formal; una concentración por rama es una señal para revisar, no una conclusión de sesgo.`;
}

export function createInsightsRouter() {
  const router = express.Router();

  router.get('/api/analytics/datasets/:id/summary', requireRole('analista', 'supervisor', 'auditor', 'admin'), async (req, res) => {
    const id = validId(req.params.id);
    if (!id) throw httpError(400, 'Base no válida.');
    res.json(await datasetSummary(getPool(), id));
  });

  router.get('/api/analytics/compare', requireRole('supervisor', 'auditor', 'admin'), async (req, res) => {
    const left = validId(req.query.left); const right = validId(req.query.right);
    if (!left || !right || left === right) throw httpError(400, 'Selecciona dos bases distintas.');
    res.json(await compareDatasets(getPool(), left, right));
  });

  router.get('/api/analytics/datasets/:id/quality', requireRole('supervisor', 'auditor', 'admin'), async (req, res) => {
    const id = validId(req.params.id);
    if (!id) throw httpError(400, 'Base no válida.');
    res.json(await qualitySummary(getPool(), id));
  });

  router.get('/api/analytics/datasets/:id/cases/:externalId/similar', requireRole('analista', 'supervisor', 'auditor', 'admin'), async (req, res) => {
    const id = validId(req.params.id);
    if (!id) throw httpError(400, 'Base no válida.');
    res.json(await similarCases(getPool(), id, String(req.params.externalId || '').slice(0, 120)));
  });

  router.post('/api/assistant/chat', requireAuth, requireCsrf, express.json({ limit: '32kb' }), async (req, res) => {
    const question = String(req.body?.question || '').trim().slice(0, 800);
    if (question.length < 3) throw httpError(400, 'Escribe una pregunta más específica.');
    const datasetId = validId(req.body?.datasetId);
    const compareDatasetId = validId(req.body?.compareDatasetId);
    const caseExternalId = String(req.body?.caseExternalId || '').trim().slice(0, 120) || null;
    const intent = detectAssistantIntent(question, { compareDatasetId, caseExternalId });
    const elevated = ['supervisor', 'auditor', 'admin'].includes(req.auth.user.role);
    const analytical = ['analista', 'supervisor', 'auditor', 'admin'].includes(req.auth.user.role);
    if (intent === 'quality_control' && !elevated) throw httpError(403, 'Tu rol no permite consultar métricas de codificadores.');
    if (intent !== 'help' && !analytical) throw httpError(403, 'Tu rol solo permite consultar ayuda de uso.');
    let data = null; let answer;
    if (intent === 'dataset_summary') {
      if (!datasetId) throw httpError(400, 'Selecciona una base para calcular estadísticas.');
      data = await datasetSummary(getPool(), datasetId); answer = summaryAnswer(data);
    } else if (intent === 'compare_datasets') {
      if (!datasetId || !compareDatasetId || datasetId === compareDatasetId) throw httpError(400, 'Selecciona dos bases distintas para comparar.');
      data = await compareDatasets(getPool(), datasetId, compareDatasetId); answer = comparisonAnswer(data);
    } else if (intent === 'similar_cases') {
      if (!datasetId || !caseExternalId) throw httpError(400, 'Abre un registro o indica el registro que deseas comparar.');
      data = await similarCases(getPool(), datasetId, caseExternalId);
      answer = data.rows.length
        ? `Encontré ${data.rows.length} observaciones históricas relacionadas. Las primeras corresponden a ${data.rows.slice(0, 3).map(row => `${row.period}: ${row.code}`).join(', ')}. Revisa el contexto antes de reutilizar un código.`
        : 'No encontré observaciones históricas suficientemente relacionadas dentro de las bases cargadas.';
    } else if (intent === 'quality_control') {
      if (!datasetId) throw httpError(400, 'Selecciona una base para revisar control de calidad.');
      data = await qualitySummary(getPool(), datasetId); answer = qualityAnswer(data);
    } else answer = helpAnswer(question);
    await getPool().query(`
      INSERT INTO epen.assistant_query_log (user_id, role, dataset_id, compare_dataset_id, case_id, intent, question_hash)
      SELECT $1, $2, selected.id, compared.id, c.id, $5, $6 FROM (SELECT 1) seed
      LEFT JOIN epen.datasets selected ON selected.id = $3
      LEFT JOIN epen.datasets compared ON compared.id = $4
      LEFT JOIN epen.survey_cases c ON c.dataset_id = selected.id AND c.external_id = $7
      LIMIT 1
    `, [req.auth.user.id, req.auth.user.role, datasetId, compareDatasetId, intent, createHash('sha256').update(question).digest('hex'), caseExternalId]);
    res.json({ answer, intent, data, calculatedAt: new Date().toISOString() });
  });

  return router;
}
