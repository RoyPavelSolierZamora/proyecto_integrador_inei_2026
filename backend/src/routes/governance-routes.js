import express from 'express';
import { audit } from '../services/audit.js';
import { getPool, transaction } from '../db/pool.js';
import { requireCsrf, requireRole } from '../security/middleware.js';

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function cleanText(value, maximum, required = false) {
  const text = String(value || '').trim();
  if (required && !text) throw httpError(400, 'Completa todos los campos obligatorios.');
  if (text.length > maximum) throw httpError(400, `Un campo supera el máximo de ${maximum} caracteres.`);
  return text || null;
}

function cleanExamples(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item || '').trim().slice(0, 300)).filter(Boolean).slice(0, 12);
}

async function requireCatalogCode(client, value) {
  const code = String(value || '').trim();
  if (!/^\d{4}$/.test(code)) throw httpError(400, 'Selecciona un código CIIU de cuatro dígitos.');
  const result = await client.query('SELECT code, description FROM epen.ciiu_catalog WHERE code = $1 AND active = true', [code]);
  if (!result.rowCount) throw httpError(400, 'El código no pertenece al catálogo CIIU activo.');
  return result.rows[0];
}

function mapRule(row) {
  return {
    id: Number(row.id), code: row.code, codeDescription: row.code_description, title: row.title,
    pattern: row.p309_pattern, occupationalContext: row.occupational_context || '', guidance: row.guidance,
    positiveExamples: row.positive_examples || [], negativeExamples: row.negative_examples || [], sourceReference: row.source_reference || '',
    status: row.status, createdById: Number(row.created_by), createdBy: row.created_by_name, approvedBy: row.approved_by_name || null,
    createdAt: row.created_at, updatedAt: row.updated_at, approvedAt: row.approved_at, retiredAt: row.retired_at,
  };
}

function mapCatalogRequest(row) {
  return {
    id: Number(row.id), type: row.request_type, code: row.code, description: row.description || '',
    justification: row.justification, sourceReference: row.source_reference, status: row.status,
    createdBy: row.created_by_name, reviewedBy: row.reviewed_by_name || null,
    reviewNotes: row.review_notes || '', createdAt: row.created_at, reviewedAt: row.reviewed_at,
  };
}

const RULE_SELECT = `
  SELECT r.*, cat.description AS code_description,
    creator.full_name AS created_by_name, approver.full_name AS approved_by_name
  FROM epen.coding_rules r
  JOIN epen.ciiu_catalog cat ON cat.code = r.code
  JOIN epen.users creator ON creator.id = r.created_by
  LEFT JOIN epen.users approver ON approver.id = r.approved_by
`;

export function createGovernanceRouter() {
  const router = express.Router();

  router.get('/api/datasets/:datasetId/cases/:externalId/coding-rules', requireRole('analista', 'supervisor', 'auditor', 'admin'), async (req, res) => {
    const datasetId = validId(req.params.datasetId);
    if (!datasetId) throw httpError(400, 'Base no válida.');
    const item = await getPool().query(`
      SELECT p309, p308, p308a FROM epen.survey_cases
      WHERE dataset_id = $1 AND external_id = $2
    `, [datasetId, req.params.externalId]);
    if (!item.rowCount) throw httpError(404, 'Registro no encontrado.');
    const sourceText = [item.rows[0].p309, item.rows[0].p308, item.rows[0].p308a].filter(Boolean).join(' ').toLowerCase();
    const tokens = [...new Set(sourceText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{4,}/g) || [])].slice(0, 20);
    if (!tokens.length) return res.json({ rules: [] });
    const result = await getPool().query(`
      SELECT r.*, cat.description AS code_description,
        creator.full_name AS created_by_name, approver.full_name AS approved_by_name,
        relevance.matches
      FROM epen.coding_rules r
      JOIN epen.ciiu_catalog cat ON cat.code = r.code
      JOIN epen.users creator ON creator.id = r.created_by
      LEFT JOIN epen.users approver ON approver.id = r.approved_by,
      LATERAL (
      SELECT count(*)::int AS matches
      FROM unnest($1::text[]) token
      WHERE lower(concat_ws(' ', r.title, r.p309_pattern, r.occupational_context, r.guidance)) LIKE '%' || token || '%'
    ) relevance
    WHERE r.status = 'active' AND relevance.matches > 0
    ORDER BY relevance.matches DESC, r.updated_at DESC, r.id DESC
    LIMIT 5`, [tokens]);
    res.json({ rules: result.rows.map(row => ({ ...mapRule(row), matches: Number(row.matches) })) });
  });

  router.get('/api/coding-rules', requireRole('supervisor', 'auditor', 'admin'), async (req, res) => {
    const status = String(req.query.status || '').trim();
    if (status && !['draft', 'pending', 'active', 'retired'].includes(status)) throw httpError(400, 'Estado no válido.');
    const result = await getPool().query(`${RULE_SELECT} ${status ? 'WHERE r.status = $1' : ''} ORDER BY r.updated_at DESC, r.id DESC`, status ? [status] : []);
    res.json({ rules: result.rows.map(mapRule) });
  });

  router.post('/api/coding-rules', requireRole('supervisor', 'admin'), requireCsrf, async (req, res) => {
    const title = cleanText(req.body?.title, 160, true);
    const pattern = cleanText(req.body?.pattern, 1000, true);
    const context = cleanText(req.body?.occupationalContext, 1000);
    const guidance = cleanText(req.body?.guidance, 3000, true);
    const sourceReference = cleanText(req.body?.sourceReference, 1000);
    const positiveExamples = cleanExamples(req.body?.positiveExamples);
    const negativeExamples = cleanExamples(req.body?.negativeExamples);
    const created = await transaction(async client => {
      const catalog = await requireCatalogCode(client, req.body?.code);
      const result = await client.query(`
        INSERT INTO epen.coding_rules
          (code, title, p309_pattern, occupational_context, guidance, positive_examples, negative_examples, source_reference, created_by)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
        RETURNING id
      `, [catalog.code, title, pattern, context, guidance, JSON.stringify(positiveExamples), JSON.stringify(negativeExamples), sourceReference, req.auth.user.id]);
      await audit(client, req, 'coding_rule.created', 'coding_rule', result.rows[0].id, { code: catalog.code, status: 'draft' });
      return result.rows[0].id;
    });
    const result = await getPool().query(`${RULE_SELECT} WHERE r.id = $1`, [created]);
    res.status(201).json({ rule: mapRule(result.rows[0]) });
  });

  router.patch('/api/coding-rules/:id', requireRole('supervisor', 'admin'), requireCsrf, async (req, res) => {
    const id = validId(req.params.id);
    if (!id) throw httpError(400, 'Criterio no válido.');
    const title = cleanText(req.body?.title, 160, true);
    const pattern = cleanText(req.body?.pattern, 1000, true);
    const context = cleanText(req.body?.occupationalContext, 1000);
    const guidance = cleanText(req.body?.guidance, 3000, true);
    const sourceReference = cleanText(req.body?.sourceReference, 1000);
    const positiveExamples = cleanExamples(req.body?.positiveExamples);
    const negativeExamples = cleanExamples(req.body?.negativeExamples);
    await transaction(async client => {
      const current = await client.query('SELECT id, status, created_by FROM epen.coding_rules WHERE id = $1 FOR UPDATE', [id]);
      if (!current.rowCount) throw httpError(404, 'Criterio no encontrado.');
      if (current.rows[0].status !== 'draft') throw httpError(409, 'Solo se puede editar un criterio en borrador.');
      if (req.auth.user.role !== 'admin' && Number(current.rows[0].created_by) !== Number(req.auth.user.id)) throw httpError(403, 'Solo el autor o un administrador puede editar este borrador.');
      const catalog = await requireCatalogCode(client, req.body?.code);
      await client.query(`
        UPDATE epen.coding_rules SET code = $1, title = $2, p309_pattern = $3,
          occupational_context = $4, guidance = $5, positive_examples = $6::jsonb,
          negative_examples = $7::jsonb, source_reference = $8, updated_at = now()
        WHERE id = $9
      `, [catalog.code, title, pattern, context, guidance, JSON.stringify(positiveExamples), JSON.stringify(negativeExamples), sourceReference, id]);
      await audit(client, req, 'coding_rule.updated', 'coding_rule', id, { code: catalog.code, status: 'draft' });
    });
    const result = await getPool().query(`${RULE_SELECT} WHERE r.id = $1`, [id]);
    res.json({ rule: mapRule(result.rows[0]) });
  });

  router.patch('/api/coding-rules/:id/status', requireRole('supervisor', 'admin'), requireCsrf, async (req, res) => {
    const id = validId(req.params.id);
    const next = String(req.body?.status || '');
    if (!id || !['draft', 'pending', 'active', 'retired'].includes(next)) throw httpError(400, 'Cambio de estado no válido.');
    if (['active', 'retired'].includes(next) && req.auth.user.role !== 'admin') throw httpError(403, 'Solo un administrador puede aprobar o retirar criterios.');
    await transaction(async client => {
      const current = await client.query('SELECT id, status, code, created_by FROM epen.coding_rules WHERE id = $1 FOR UPDATE', [id]);
      if (!current.rowCount) throw httpError(404, 'Criterio no encontrado.');
      if (req.auth.user.role !== 'admin' && Number(current.rows[0].created_by) !== Number(req.auth.user.id)) throw httpError(403, 'Solo el autor o un administrador puede cambiar este criterio.');
      const allowed = {
        draft: ['pending'],
        pending: ['draft', 'active'],
        active: ['retired'],
        retired: [],
      };
      if (!allowed[current.rows[0].status].includes(next)) throw httpError(409, 'La transición solicitada no está permitida.');
      await client.query(`
        UPDATE epen.coding_rules SET status = $1::varchar(20), updated_at = now(),
          approved_by = CASE WHEN $1::text = 'active' THEN $2::bigint ELSE approved_by END,
          approved_at = CASE WHEN $1::text = 'active' THEN now() ELSE approved_at END,
          retired_at = CASE WHEN $1::text = 'retired' THEN now() ELSE retired_at END
        WHERE id = $3
      `, [next, req.auth.user.id, id]);
      await audit(client, req, `coding_rule.${next}`, 'coding_rule', id, { previous: current.rows[0].status, code: current.rows[0].code });
    });
    const result = await getPool().query(`${RULE_SELECT} WHERE r.id = $1`, [id]);
    res.json({ rule: mapRule(result.rows[0]) });
  });

  router.get('/api/catalog-change-requests', requireRole('supervisor', 'auditor', 'admin'), async (_req, res) => {
    const result = await getPool().query(`
      SELECT r.*, creator.full_name AS created_by_name, reviewer.full_name AS reviewed_by_name
      FROM epen.catalog_change_requests r
      JOIN epen.users creator ON creator.id = r.created_by
      LEFT JOIN epen.users reviewer ON reviewer.id = r.reviewed_by
      ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC, r.id DESC
      LIMIT 200
    `);
    res.json({ requests: result.rows.map(mapCatalogRequest) });
  });

  router.post('/api/catalog-change-requests', requireRole('supervisor', 'admin'), requireCsrf, async (req, res) => {
    const type = String(req.body?.type || '');
    const code = String(req.body?.code || '').trim();
    const description = cleanText(req.body?.description, 500, type !== 'deactivate');
    const justification = cleanText(req.body?.justification, 2000, true);
    const sourceReference = cleanText(req.body?.sourceReference, 1000, true);
    if (!['add', 'update', 'deactivate'].includes(type) || !/^\d{4}$/.test(code)) throw httpError(400, 'Selecciona un tipo de cambio y un código CIIU de cuatro dígitos.');
    const existing = await getPool().query('SELECT code, active FROM epen.ciiu_catalog WHERE code = $1', [code]);
    if (type === 'add' && existing.rowCount && existing.rows[0].active) throw httpError(409, 'Ese código ya existe en el catálogo activo.');
    if (type !== 'add' && !existing.rowCount) throw httpError(409, 'El código no existe en el catálogo actual.');
    let id;
    try {
      const result = await getPool().query(`
        INSERT INTO epen.catalog_change_requests
          (request_type, code, description, justification, source_reference, created_by)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
      `, [type, code, description, justification, sourceReference, req.auth.user.id]);
      id = result.rows[0].id;
    } catch (cause) {
      if (cause.code === '23505') throw httpError(409, 'Ya existe una solicitud pendiente para ese código.');
      throw cause;
    }
    await audit(getPool(), req, 'catalog_change.requested', 'catalog_change_request', id, { type, code });
    res.status(201).json({ id: Number(id) });
  });

  router.patch('/api/catalog-change-requests/:id/status', requireRole('admin'), requireCsrf, async (req, res) => {
    const id = validId(req.params.id);
    const status = String(req.body?.status || '');
    const reviewNotes = cleanText(req.body?.reviewNotes, 1500, status === 'rejected');
    if (!id || !['approved', 'rejected'].includes(status)) throw httpError(400, 'Revisión de catálogo no válida.');
    await transaction(async client => {
      const current = await client.query('SELECT * FROM epen.catalog_change_requests WHERE id = $1 FOR UPDATE', [id]);
      if (!current.rowCount) throw httpError(404, 'Solicitud no encontrada.');
      const request = current.rows[0];
      if (request.status !== 'pending') throw httpError(409, 'La solicitud ya fue revisada.');
      if (status === 'approved') {
        if (request.request_type === 'add') {
          await client.query(`INSERT INTO epen.ciiu_catalog (code, description, active) VALUES ($1, $2, true)
            ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = true, updated_at = now()`, [request.code, request.description]);
        } else if (request.request_type === 'update') {
          const changed = await client.query('UPDATE epen.ciiu_catalog SET description = $1, updated_at = now() WHERE code = $2', [request.description, request.code]);
          if (!changed.rowCount) throw httpError(409, 'El código ya no existe en el catálogo.');
        } else {
          const changed = await client.query('UPDATE epen.ciiu_catalog SET active = false, updated_at = now() WHERE code = $1', [request.code]);
          if (!changed.rowCount) throw httpError(409, 'El código ya no existe en el catálogo.');
        }
      }
      await client.query(`UPDATE epen.catalog_change_requests SET status = $1, reviewed_by = $2,
        review_notes = $3, reviewed_at = now() WHERE id = $4`, [status, req.auth.user.id, reviewNotes, id]);
      await audit(client, req, `catalog_change.${status}`, 'catalog_change_request', id, { type: request.request_type, code: request.code });
    });
    res.json({ ok: true });
  });

  router.get('/api/datasets/:datasetId/cases/:externalId/quality-reviews', requireRole('supervisor', 'auditor', 'admin'), async (req, res) => {
    const datasetId = validId(req.params.datasetId);
    if (!datasetId) throw httpError(400, 'Base no válida.');
    const result = await getPool().query(`
      SELECT qr.id, qr.verdict, qr.corrected_code, qr.notes, qr.created_at,
        u.full_name AS reviewer, d.source AS reviewed_source, d.code AS reviewed_code
      FROM epen.quality_reviews qr
      JOIN epen.survey_cases c ON c.id = qr.case_id
      JOIN epen.users u ON u.id = qr.reviewer_id
      LEFT JOIN epen.decisions d ON d.id = qr.decision_id
      WHERE c.dataset_id = $1 AND c.external_id = $2
      ORDER BY qr.created_at DESC, qr.id DESC
    `, [datasetId, req.params.externalId]);
    res.json({ reviews: result.rows.map(row => ({
      id: Number(row.id), verdict: row.verdict, correctedCode: row.corrected_code, notes: row.notes || '', at: row.created_at,
      reviewer: row.reviewer, reviewedSource: row.reviewed_source, reviewedCode: row.reviewed_code,
    })) });
  });

  router.post('/api/datasets/:datasetId/cases/:externalId/quality-reviews', requireRole('supervisor', 'admin'), requireCsrf, async (req, res) => {
    const datasetId = validId(req.params.datasetId);
    const verdict = String(req.body?.verdict || '');
    const notes = cleanText(req.body?.notes, 2000);
    if (!datasetId || !['correct', 'incorrect', 'uncertain'].includes(verdict)) throw httpError(400, 'Revisión de calidad no válida.');
    const reviewId = await transaction(async client => {
      const item = await client.query('SELECT id, final_code FROM epen.survey_cases WHERE dataset_id = $1 AND external_id = $2 FOR UPDATE', [datasetId, req.params.externalId]);
      if (!item.rowCount) throw httpError(404, 'Registro no encontrado.');
      const latest = await client.query('SELECT id, source, code FROM epen.decisions WHERE case_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [item.rows[0].id]);
      if (!latest.rowCount) throw httpError(409, 'El registro aún no tiene una decisión que pueda revisarse.');
      let correctedCode = null;
      if (verdict === 'incorrect') {
        correctedCode = (await requireCatalogCode(client, req.body?.correctedCode)).code;
        if (correctedCode === latest.rows[0].code) throw httpError(400, 'El código corregido debe ser distinto de la decisión revisada.');
      }
      const inserted = await client.query(`
        INSERT INTO epen.quality_reviews (case_id, decision_id, verdict, corrected_code, notes, reviewer_id)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
      `, [item.rows[0].id, latest.rows[0].id, verdict, correctedCode, notes, req.auth.user.id]);
      if (verdict === 'incorrect') {
        await client.query("UPDATE epen.survey_cases SET status = 'resolved', final_code = $1, updated_at = now() WHERE id = $2", [correctedCode, item.rows[0].id]);
        await client.query(`
          INSERT INTO epen.decisions (case_id, source, decision, code, justification, decided_by)
          VALUES ($1, 'human', 'correction', $2, $3, $4)
        `, [item.rows[0].id, correctedCode, `Control de calidad: ${notes || 'corrección confirmada en muestra supervisada.'}`, req.auth.user.id]);
      }
      await audit(client, req, 'quality.reviewed', 'case', item.rows[0].id, { datasetId, externalId: req.params.externalId, verdict, correctedCode, reviewedDecisionId: Number(latest.rows[0].id) });
      return inserted.rows[0].id;
    });
    res.status(201).json({ id: Number(reviewId) });
  });

  return router;
}
