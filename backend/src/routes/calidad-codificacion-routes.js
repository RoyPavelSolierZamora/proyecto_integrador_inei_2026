// Módulo «Calidad de codificación»: reparto de casos por lotes (base, fuente y codificador), avance por lote y
// calidad por persona. Es independiente de «Control de calidad».
import express from 'express';
import { audit } from '../services/audit.js';
import { getPool, transaction } from '../db/pool.js';
import { requireCsrf, requireRole } from '../security/middleware.js';
import { summarizeVerdicts, wilsonInterval } from '../services/quality-metrics.js';
import { allocatePlan, groupKey, SOURCES, SOURCE_LABELS, validatePlan } from '../services/reparto.js';

const ROLES = ['supervisor', 'admin'];
const MAX_LINES = 60;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function readActive(value) {
  if (typeof value !== 'boolean') throw httpError(400, 'Indica si queda activo o inactivo.');
  return value;
}

// Codificador opcional: vacío = sin asignar. Un valor presente que no es un id válido es un error.
function parseAssignee(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = validId(value);
  if (!id) throw httpError(400, 'Codificador no válido.');
  return id;
}

// Casos pendientes de repartir y su fuente. Excluye los que ya tienen lote y las decisiones humanas.
const POOL_SQL = `
  SELECT c.id, c.external_id, c.dataset_id,
    CASE WHEN c.final_code IS NULL OR c.status = 'review' THEN 'review' ELSE last.source END AS fuente,
    COALESCE(last.code, c.final_code) AS codigo_sugerido,
    c.p309, c.p308, c.p308a, c.c309_1, c.c310, c.c311, c.c366
  FROM epen.survey_cases c
  LEFT JOIN LATERAL (
    SELECT d.source, d.code FROM epen.decisions d WHERE d.case_id = c.id ORDER BY d.created_at DESC, d.id DESC LIMIT 1
  ) last ON true
  WHERE NOT EXISTS (SELECT 1 FROM epen.case_assignments a WHERE a.case_id = c.id)
`;

function pendingRows(rows, datasetIds) {
  return rows.filter(row => datasetIds.includes(Number(row.dataset_id)) && ['ml', 'llm', 'review'].includes(row.fuente));
}

// Convierte las filas del formulario en asignaciones validadas. porcentaje null = resto.
function readItems(raw) {
  if (!Array.isArray(raw)) throw httpError(400, 'Envía la lista de asignaciones.');
  if (raw.length > MAX_LINES) throw httpError(400, `Como máximo ${MAX_LINES} asignaciones por reparto.`);
  return raw.map(line => ({
    datasetId: validId(line?.base),
    fuente: SOURCES.includes(line?.fuente) ? line.fuente : String(line?.fuente || ''),
    asignadoId: parseAssignee(line?.codificador),
    porcentaje: line?.porcentaje === null || line?.porcentaje === undefined || line.porcentaje === ''
      ? null
      : Number(String(line.porcentaje).replace(',', '.')),
  }));
}

async function buildPools(client, items) {
  const datasetIds = [...new Set(items.map(item => item.datasetId).filter(Boolean))];
  const rows = pendingRows((await client.query(POOL_SQL)).rows, datasetIds);
  const pools = new Map();
  const counts = new Map();
  for (const row of rows) {
    const entry = { id: Number(row.id), externalId: row.external_id, datasetId: Number(row.dataset_id), fuente: row.fuente, row };
    for (const key of [groupKey(entry.datasetId, entry.fuente), groupKey(entry.datasetId, 'todas')]) {
      if (!pools.has(key)) pools.set(key, []);
      pools.get(key).push(entry);
    }
  }
  for (const [key, list] of pools) counts.set(key, list.length);
  return { pools, counts };
}

export function createCalidadCodificacionRouter() {
  const router = express.Router();

  router.get('/api/calidad-codificacion/usuarios', requireRole(...ROLES), async (req, res) => {
    const result = await getPool().query(`
      SELECT id, username, full_name, analyst_code
      FROM epen.users
      WHERE role = 'analista' AND active = true AND deleted_at IS NULL
      ORDER BY COALESCE(analyst_code, username)
    `);
    res.json({
      users: result.rows.map(row => ({
        id: Number(row.id),
        name: row.full_name || row.username,
        code: row.analyst_code || row.username,
      })),
    });
  });

  // Bases con sus casos pendientes por fuente y cuántos ya están repartidos.
  router.get('/api/calidad-codificacion/bases', requireRole(...ROLES), async (req, res) => {
    const pool = getPool();
    const [datasets, rows, assigned] = await Promise.all([
      pool.query(`
        SELECT id, name, period, version, status, record_count
        FROM epen.datasets
        WHERE kind = 'system' AND status IN ('active', 'archived')
        ORDER BY imported_at DESC, id DESC
      `),
      pool.query(POOL_SQL),
      pool.query(`
        SELECT l.dataset_id, count(*)::int AS n
        FROM epen.case_assignments a JOIN epen.assignment_lots l ON l.id = a.lot_id
        GROUP BY l.dataset_id
      `),
    ]);
    const assignedBy = new Map(assigned.rows.map(row => [Number(row.dataset_id), Number(row.n)]));
    res.json({
      bases: datasets.rows.map(base => {
        const id = Number(base.id);
        const mine = rows.rows.filter(row => Number(row.dataset_id) === id);
        const count = fuente => mine.filter(row => row.fuente === fuente).length;
        return {
          id,
          name: base.name,
          period: base.period,
          version: Number(base.version),
          active: base.status === 'active',
          records: Number(base.record_count || 0),
          pending: { ml: count('ml'), llm: count('llm'), review: count('review') },
          assigned: assignedBy.get(id) || 0,
        };
      }),
    });
  });

  // Vista previa: cuántos casos recibe cada línea. No guarda nada.
  router.post('/api/calidad-codificacion/previsualizar', requireRole(...ROLES), async (req, res) => {
    const items = readItems(req.body?.asignaciones);
    const client = await getPool().connect();
    try {
      const { pools, counts } = await buildPools(client, items);
      const { errors, warnings } = validatePlan(items, counts);
      if (errors.length) return res.json({ valid: false, errors, warnings, lines: [] });
      const { assigned, leftovers } = allocatePlan(items, pools);
      res.json({
        valid: true,
        errors: [],
        warnings,
        lines: items.map((item, index) => ({
          base: item.datasetId,
          fuente: item.fuente,
          fuenteLabel: SOURCE_LABELS[item.fuente],
          codificador: item.asignadoId,
          porcentaje: item.porcentaje,
          casos: (assigned.get(index) || []).length,
        })),
        sinAsignar: [...leftovers.values()].reduce((acc, list) => acc + list.length, 0),
      });
    } finally {
      client.release();
    }
  });

  // Crea los lotes. Cada caso queda en un solo lote; las decisiones existentes no se tocan.
  router.post('/api/calidad-codificacion/reparto', requireRole(...ROLES), requireCsrf, async (req, res) => {
    const items = readItems(req.body?.asignaciones);
    if (new Set(items.map(item => item.datasetId)).size > 1) throw httpError(400, 'Un reparto solo puede ser de una base.');
    const nombre = String(req.body?.nombre || '').trim().slice(0, 120)
      || `Reparto ${new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}`;
    let result;
    try {
      result = await transaction(async client => {
      const people = await client.query(`
        SELECT id FROM epen.users
        WHERE id = ANY($1::bigint[]) AND role = 'analista' AND active = true AND deleted_at IS NULL
      `, [[...new Set(items.map(item => item.asignadoId).filter(Boolean))]]);
      const validPeople = new Set(people.rows.map(row => Number(row.id)));
      if (items.some(item => item.asignadoId !== null && !validPeople.has(item.asignadoId))) {
        throw httpError(400, 'Todos los codificadores deben ser usuarios analistas activos.');
      }
      const bases = await client.query(`SELECT id FROM epen.datasets WHERE id = ANY($1::bigint[]) AND kind = 'system'`, [
        [...new Set(items.map(item => item.datasetId).filter(Boolean))],
      ]);
      if (bases.rowCount !== new Set(items.map(item => item.datasetId)).size) throw httpError(404, 'Base no encontrada.');

      const { pools, counts } = await buildPools(client, items);
      const { errors } = validatePlan(items, counts);
      if (errors.length) throw httpError(400, errors.join(' '));
      const { assigned } = allocatePlan(items, pools);

      const repartoRow = await client.query(`
        INSERT INTO epen.assignment_repartos (dataset_id, name, created_by)
        VALUES ($1, $2, $3) RETURNING id
      `, [items[0].datasetId, nombre, req.auth.user.id]);
      const repartoId = Number(repartoRow.rows[0].id);
      const created = [];
      for (const [index, item] of items.entries()) {
        const cases = assigned.get(index) || [];
        const lot = await client.query(`
          INSERT INTO epen.assignment_lots (dataset_id, assignee_id, source, requested_percent, case_count, created_by, reparto_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [item.datasetId, item.asignadoId, item.fuente, item.porcentaje, cases.length, req.auth.user.id, repartoId]);
        const lotId = Number(lot.rows[0].id);
        if (cases.length) {
          await client.query(`
            INSERT INTO epen.case_assignments (lot_id, case_id)
            SELECT $1, t.case_id FROM unnest($2::bigint[]) AS t(case_id)
          `, [lotId, cases.map(entry => entry.id)]);
        }
        created.push({ lot: lotId, base: item.datasetId, fuente: item.fuente, codificador: item.asignadoId, casos: cases.length });
      }
      await audit(client, req, 'assignment.created', 'assignment', null, {
        lots: created.length,
        cases: created.reduce((acc, line) => acc + line.casos, 0),
      });
      return { reparto: repartoId, name: nombre, lots: created };
      });
    } catch (cause) {
      // Otra persona creó un reparto con esos mismos casos entre la revisión y la creación.
      if (cause.code === '23505') throw httpError(409, 'Algunos casos ya fueron repartidos por otra persona. Revisa el reparto de nuevo.');
      throw cause;
    }
    res.status(201).json(result);
  });

  // Avance y calidad por lote y por persona. Filtra por base si se indica ?base=ID.
  router.get('/api/calidad-codificacion/resumen', requireRole(...ROLES), async (req, res) => {
    const baseId = req.query.base ? validId(req.query.base) : null;
    if (req.query.base && !baseId) throw httpError(400, 'Base no válida.');
    const pool = getPool();
    const [lotRows, qualityRows, dailyRows] = await Promise.all([
      pool.query(`
        SELECT l.id, l.dataset_id, d.name AS dataset_name, d.period, l.source, l.requested_percent, l.case_count,
          l.active, l.reparto_id, r.name AS reparto_name, r.created_at AS reparto_created,
          u.id AS assignee_id, u.full_name, u.username, u.analyst_code,
          (SELECT count(*)::int FROM epen.case_assignments a
             WHERE a.lot_id = l.id AND EXISTS (
               SELECT 1 FROM epen.decisions dc
               WHERE dc.case_id = a.case_id AND dc.source = 'human' AND dc.decided_by = l.assignee_id
             )) AS decided
        FROM epen.assignment_lots l
        JOIN epen.datasets d ON d.id = l.dataset_id
        LEFT JOIN epen.users u ON u.id = l.assignee_id
        LEFT JOIN epen.assignment_repartos r ON r.id = l.reparto_id
        WHERE ($1::bigint IS NULL OR l.dataset_id = $1)
        ORDER BY l.created_at DESC, l.id DESC
      `, [baseId]),
      pool.query(`
        SELECT DISTINCT ON (r.decision_id) r.decision_id, r.verdict, a.lot_id, l.assignee_id
        FROM epen.quality_reviews r
        JOIN epen.decisions d ON d.id = r.decision_id AND d.source = 'human'
        JOIN epen.case_assignments a ON a.case_id = d.case_id
        JOIN epen.assignment_lots l ON l.id = a.lot_id AND l.assignee_id = d.decided_by
        WHERE ($1::bigint IS NULL OR l.dataset_id = $1)
        ORDER BY r.decision_id, r.created_at DESC, r.id DESC
      `, [baseId]),
      // Ritmo por lote y día: la gráfica por día se filtra por reparto en el cliente.
      pool.query(`
        SELECT l.id AS lot_id, to_char(date_trunc('day', d.created_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
        FROM epen.decisions d
        JOIN epen.case_assignments a ON a.case_id = d.case_id
        JOIN epen.assignment_lots l ON l.id = a.lot_id AND l.assignee_id = d.decided_by
        WHERE d.source = 'human' AND ($1::bigint IS NULL OR l.dataset_id = $1)
        GROUP BY 1, 2 ORDER BY 2
      `, [baseId]),
    ]);

    const verdictsByLot = new Map();
    for (const row of qualityRows.rows) {
      const key = Number(row.lot_id);
      if (!verdictsByLot.has(key)) verdictsByLot.set(key, []);
      verdictsByLot.get(key).push(row.verdict);
    }
    const dailyByLot = new Map();
    for (const row of dailyRows.rows) {
      const key = Number(row.lot_id);
      if (!dailyByLot.has(key)) dailyByLot.set(key, []);
      dailyByLot.get(key).push({ day: row.day, count: Number(row.count) });
    }

    const lots = lotRows.rows.map(row => {
      const quality = summarizeVerdicts(verdictsByLot.get(Number(row.id)) || []);
      const caseCount = Number(row.case_count);
      const decided = Number(row.decided);
      return {
        lot: Number(row.id),
        base: Number(row.dataset_id),
        baseName: row.dataset_name,
        period: row.period,
        fuente: row.source,
        fuenteLabel: SOURCE_LABELS[row.source],
        active: row.active === true,
        repartoId: row.reparto_id === null ? null : Number(row.reparto_id),
        repartoName: row.reparto_name || 'Reparto anterior',
        repartoCreatedAt: row.reparto_created || null,
        daily: dailyByLot.get(Number(row.id)) || [],
        assigneeId: row.assignee_id === null ? null : Number(row.assignee_id),
        name: row.full_name || row.username || 'Sin asignar',
        code: row.analyst_code || row.username || 'Sin asignar',
        assigned: caseCount,
        decided,
        remaining: caseCount - decided,
        percent: caseCount ? Math.round((decided / caseCount) * 1000) / 10 : 0,
        verified: quality.verified,
        correct: quality.correct,
        incorrect: quality.incorrect,
        uncertain: quality.uncertain,
        accuracy: quality.accuracy,
        interval: quality.interval,
      };
    });

    // Resumen por persona: suma sus lotes.
    const people = new Map();
    for (const lot of lots) {
      if (lot.assigneeId === null) continue;
      if (!people.has(lot.assigneeId)) {
        people.set(lot.assigneeId, { assigneeId: lot.assigneeId, name: lot.name, code: lot.code, assigned: 0, decided: 0, verdicts: [] });
      }
      const entry = people.get(lot.assigneeId);
      entry.assigned += lot.assigned;
      entry.decided += lot.decided;
      entry.verdicts.push(...(verdictsByLot.get(lot.lot) || []));
    }
    const personas = [...people.values()].map(person => {
      const quality = summarizeVerdicts(person.verdicts);
      return {
        assigneeId: person.assigneeId,
        name: person.name,
        code: person.code,
        assigned: person.assigned,
        decided: person.decided,
        remaining: person.assigned - person.decided,
        percent: person.assigned ? Math.round((person.decided / person.assigned) * 1000) / 10 : 0,
        verified: quality.verified,
        correct: quality.correct,
        incorrect: quality.incorrect,
        accuracy: quality.accuracy,
        interval: quality.interval,
      };
    });

    const assigned = lots.reduce((acc, lot) => acc + lot.assigned, 0);
    const decided = lots.reduce((acc, lot) => acc + lot.decided, 0);
    const verifiedTotal = lots.reduce((acc, lot) => acc + lot.verified, 0);
    const correctTotal = lots.reduce((acc, lot) => acc + lot.correct, 0);
    res.json({
      lots,
      people: personas,
      daily: [...lots.flatMap(lot => lot.daily).reduce((map, item) => {
        map.set(item.day, (map.get(item.day) || 0) + item.count);
        return map;
      }, new Map()).entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, count]) => ({ day, count })),
      totals: {
        assigned,
        decided,
        remaining: assigned - decided,
        percent: assigned ? Math.round((decided / assigned) * 1000) / 10 : 0,
        verified: verifiedTotal,
        accuracy: verifiedTotal ? correctTotal / verifiedTotal : null,
        interval: wilsonInterval(correctTotal, verifiedTotal),
      },
    });
  });

  // Asigna, cambia o quita el codificador de un lote. Si el lote ya tiene decisiones humanas no se cambia.
  router.patch('/api/calidad-codificacion/lotes/:lote/codificador', requireRole(...ROLES), requireCsrf, async (req, res) => {
    const loteId = validId(req.params.lote);
    if (!loteId) throw httpError(400, 'Lote no válido.');
    const assignee = parseAssignee(req.body?.codificador);
    const result = await transaction(async client => {
      const lot = await client.query('SELECT id FROM epen.assignment_lots WHERE id = $1 FOR UPDATE', [loteId]);
      if (!lot.rowCount) throw httpError(404, 'Lote no encontrado.');
      if (assignee !== null) {
        const person = await client.query(`
          SELECT id FROM epen.users WHERE id = $1 AND role = 'analista' AND active = true AND deleted_at IS NULL
        `, [assignee]);
        if (!person.rowCount) throw httpError(400, 'El codificador debe ser un usuario analista activo.');
      }
      const decided = await client.query(`
        SELECT count(*)::int AS n FROM epen.case_assignments a
        JOIN epen.decisions d ON d.case_id = a.case_id AND d.source = 'human'
        WHERE a.lot_id = $1
      `, [loteId]);
      if (decided.rows[0].n > 0) throw httpError(409, 'Este lote ya tiene decisiones humanas. No se puede cambiar de codificador.');
      await client.query('UPDATE epen.assignment_lots SET assignee_id = $2 WHERE id = $1', [loteId, assignee]);
      await audit(client, req, 'assignment.reassigned', 'assignment_lot', loteId, { codificador: assignee });
      return { lot: loteId, codificador: assignee };
    });
    res.json(result);
  });

  // Lotes asignados a la persona que consulta. Sirve para avisar y para la pantalla «Mis lotes».
  router.get('/api/mis-lotes', requireRole('analista', 'supervisor', 'admin'), async (req, res) => {
    // El identificador llega como texto desde PostgreSQL; se compara siempre como número.
    const me = Number(req.auth.user.id);
    const result = await getPool().query(`
      SELECT l.id, l.dataset_id, d.name AS dataset_name, d.period, l.source, l.case_count, l.created_at,
        (SELECT count(*)::int FROM epen.case_assignments a
          WHERE a.lot_id = l.id AND EXISTS (
            SELECT 1 FROM epen.decisions dc WHERE dc.case_id = a.case_id AND dc.source = 'human' AND dc.decided_by = $1
          )) AS decided
      FROM epen.assignment_lots l
      JOIN epen.datasets d ON d.id = l.dataset_id
      WHERE l.assignee_id = $1 AND l.active = true
      ORDER BY l.created_at DESC, l.id DESC
    `, [me]);
    const lots = result.rows.map(row => {
      const assigned = Number(row.case_count);
      const decided = Number(row.decided);
      return {
        lot: Number(row.id),
        base: Number(row.dataset_id),
        baseName: row.dataset_name,
        period: row.period,
        fuente: row.source,
        fuenteLabel: SOURCE_LABELS[row.source],
        assigned,
        decided,
        remaining: Math.max(0, assigned - decided),
        percent: assigned ? Math.round((decided / assigned) * 1000) / 10 : 0,
        createdAt: row.created_at,
      };
    });
    res.json({ lots, pending: lots.filter(lot => lot.remaining > 0).length });
  });

  // Casos de un lote. Un codificador solo ve sus propios lotes; supervisor y administrador ven cualquiera.
  router.get('/api/mis-lotes/:lote/casos', requireRole('analista', 'supervisor', 'admin'), async (req, res) => {
    const loteId = validId(req.params.lote);
    if (!loteId) throw httpError(400, 'Lote no válido.');
    const me = Number(req.auth.user.id);
    const lot = await getPool().query(`
      SELECT l.id, l.dataset_id, l.assignee_id, l.source, l.active, d.name AS dataset_name, d.period
      FROM epen.assignment_lots l JOIN epen.datasets d ON d.id = l.dataset_id
      WHERE l.id = $1
    `, [loteId]);
    if (!lot.rowCount) throw httpError(404, 'Lote no encontrado.');
    const row = lot.rows[0];
    const privileged = ['supervisor', 'admin'].includes(req.auth.user.role);
    if (!privileged && Number(row.assignee_id) !== me) throw httpError(403, 'Este lote no está asignado a tu usuario.');
    if (!privileged && row.active !== true) throw httpError(403, 'Este lote está desactivado. Consulta con tu supervisor.');
    const cases = await getPool().query(`
      SELECT c.external_id, c.p309, c.p308, c.final_code, c.status,
        EXISTS (
          SELECT 1 FROM epen.decisions d WHERE d.case_id = c.id AND d.source = 'human' AND d.decided_by = $2
        ) AS decidido,
        CASE WHEN $3 = 'review' THEN NULL ELSE (
          SELECT d.code FROM epen.decisions d WHERE d.case_id = c.id ORDER BY d.created_at DESC, d.id DESC LIMIT 1
        ) END AS sugerido
      FROM epen.case_assignments a
      JOIN epen.survey_cases c ON c.id = a.case_id
      WHERE a.lot_id = $1
      ORDER BY decidido, c.external_id
    `, [loteId, Number(row.assignee_id) || me, row.source]);
    res.json({
      lot: {
        id: Number(row.id),
        datasetId: Number(row.dataset_id),
        datasetName: row.dataset_name,
        period: row.period,
        fuente: row.source,
        fuenteLabel: SOURCE_LABELS[row.source],
      },
      cases: cases.rows.map(item => ({
        id: item.external_id,
        p309: item.p309,
        p308: item.p308,
        sugerido: item.sugerido,
        decidido: item.decidido,
      })),
    });
  });

  // Elimina un reparto completo. Si el lote ya tiene decisiones humanas no se borra: se puede dejar sin codificador.
  router.delete('/api/calidad-codificacion/lotes/:lote', requireRole(...ROLES), requireCsrf, async (req, res) => {
    const loteId = validId(req.params.lote);
    if (!loteId) throw httpError(400, 'Lote no válido.');
    const result = await transaction(async client => {
      const lot = await client.query('SELECT id, case_count FROM epen.assignment_lots WHERE id = $1 FOR UPDATE', [loteId]);
      if (!lot.rowCount) throw httpError(404, 'Lote no encontrado.');
      const decided = await client.query(`
        SELECT count(*)::int AS n FROM epen.case_assignments a
        JOIN epen.decisions d ON d.case_id = a.case_id AND d.source = 'human'
        WHERE a.lot_id = $1
      `, [loteId]);
      if (decided.rows[0].n > 0) {
        throw httpError(409, 'Este lote ya tiene decisiones humanas y no se puede eliminar. Puedes dejarlo sin codificador.');
      }
      await client.query('DELETE FROM epen.case_assignments WHERE lot_id = $1', [loteId]);
      await client.query('DELETE FROM epen.assignment_lots WHERE id = $1', [loteId]);
      await audit(client, req, 'assignment.deleted', 'assignment_lot', loteId, { cases: Number(lot.rows[0].case_count) });
      return { lot: loteId, deleted: true, cases: Number(lot.rows[0].case_count) };
    });
    res.json(result);
  });

  // Elimina un reparto completo: todos sus lotes y asignaciones. Si algún lote tiene decisiones humanas, no se borra.
  router.delete('/api/calidad-codificacion/repartos/:reparto', requireRole(...ROLES), requireCsrf, async (req, res) => {
    const repartoId = validId(req.params.reparto);
    if (!repartoId) throw httpError(400, 'Reparto no válido.');
    const result = await transaction(async client => {
      const reparto = await client.query('SELECT id, name FROM epen.assignment_repartos WHERE id = $1 FOR UPDATE', [repartoId]);
      if (!reparto.rowCount) throw httpError(404, 'Reparto no encontrado.');
      const decided = await client.query(`
        SELECT count(*)::int AS n FROM epen.case_assignments a
        JOIN epen.assignment_lots l ON l.id = a.lot_id
        JOIN epen.decisions d ON d.case_id = a.case_id AND d.source = 'human'
        WHERE l.reparto_id = $1
      `, [repartoId]);
      if (decided.rows[0].n > 0) {
        throw httpError(409, 'Este reparto ya tiene decisiones humanas y no se puede eliminar. Puedes quitar codificadores de sus partes.');
      }
      await client.query(`
        DELETE FROM epen.case_assignments WHERE lot_id IN (SELECT id FROM epen.assignment_lots WHERE reparto_id = $1)
      `, [repartoId]);
      await client.query('DELETE FROM epen.assignment_lots WHERE reparto_id = $1', [repartoId]);
      await client.query('DELETE FROM epen.assignment_repartos WHERE id = $1', [repartoId]);
      await audit(client, req, 'assignment.reparto_deleted', 'assignment_reparto', repartoId, { name: reparto.rows[0].name });
      return { reparto: repartoId, deleted: true };
    });
    res.json(result);
  });

  // Activa o desactiva un reparto completo. Un reparto inactivo no aparece a los codificadores,
  // pero conserva sus casos y decisiones. Sirve cuando ya tiene decisiones y no puede eliminarse.
  router.patch('/api/calidad-codificacion/repartos/:reparto/activo', requireRole(...ROLES), requireCsrf, async (req, res) => {
    const repartoId = validId(req.params.reparto);
    if (!repartoId) throw httpError(400, 'Reparto no válido.');
    const activo = readActive(req.body?.activo);
    const result = await transaction(async client => {
      const reparto = await client.query('SELECT id, name FROM epen.assignment_repartos WHERE id = $1 FOR UPDATE', [repartoId]);
      if (!reparto.rowCount) throw httpError(404, 'Reparto no encontrado.');
      const updated = await client.query('UPDATE epen.assignment_lots SET active = $2 WHERE reparto_id = $1', [repartoId, activo]);
      await audit(client, req, activo ? 'assignment.reparto_activated' : 'assignment.reparto_deactivated', 'assignment_reparto', repartoId, {
        name: reparto.rows[0].name,
        lots: updated.rowCount,
      });
      return { reparto: repartoId, activo, lots: updated.rowCount };
    });
    res.json(result);
  });

  // Activa o desactiva un lote suelto (repartos anteriores, creados antes de los repartos).
  router.patch('/api/calidad-codificacion/lotes/:lote/activo', requireRole(...ROLES), requireCsrf, async (req, res) => {
    const loteId = validId(req.params.lote);
    if (!loteId) throw httpError(400, 'Lote no válido.');
    const activo = readActive(req.body?.activo);
    const result = await transaction(async client => {
      const lot = await client.query('SELECT id FROM epen.assignment_lots WHERE id = $1 FOR UPDATE', [loteId]);
      if (!lot.rowCount) throw httpError(404, 'Lote no encontrado.');
      await client.query('UPDATE epen.assignment_lots SET active = $2 WHERE id = $1', [loteId, activo]);
      await audit(client, req, activo ? 'assignment.lot_activated' : 'assignment.lot_deactivated', 'assignment_lot', loteId, {});
      return { lot: loteId, activo };
    });
    res.json(result);
  });

  // Exporta un lote para trabajar fuera del sistema. Las fuentes automáticas incluyen el código sugerido
  // porque la persona debe confirmarlo o corregirlo; los casos de revisión manual no lo incluyen.
  router.get('/api/calidad-codificacion/lotes/:lote/exportar', requireRole(...ROLES), async (req, res) => {
    const loteId = validId(req.params.lote);
    if (!loteId) throw httpError(400, 'Lote no válido.');
    const lot = await getPool().query('SELECT id, source, dataset_id FROM epen.assignment_lots WHERE id = $1', [loteId]);
    if (!lot.rowCount) throw httpError(404, 'Lote no encontrado.');
    const result = await getPool().query(`
      SELECT c.external_id, c.p309, c.p308, c.p308a, c.c309_1, c.c310, c.c311, c.c366,
        CASE WHEN $2 = 'review' THEN NULL ELSE (
          SELECT d.code FROM epen.decisions d WHERE d.case_id = c.id ORDER BY d.created_at DESC, d.id DESC LIMIT 1
        ) END AS codigo_sugerido
      FROM epen.case_assignments a
      JOIN epen.survey_cases c ON c.id = a.case_id
      WHERE a.lot_id = $1
      ORDER BY c.external_id
    `, [loteId, lot.rows[0].source]);
    const header = ['id_registro', 'p309', 'p308', 'p308a', 'c309_1', 'c310', 'c311', 'c366', 'codigo_sugerido'];
    const cell = value => {
      let text = value === null || value === undefined ? '' : String(value);
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const lines = [header.join(',')];
    for (const row of result.rows) {
      lines.push([row.external_id, row.p309, row.p308, row.p308a, row.c309_1, row.c310, row.c311, row.c366, row.codigo_sugerido].map(cell).join(','));
    }
    await transaction(client => audit(client, req, 'assignment.exported', 'assignment_lot', loteId, { cases: result.rowCount }));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lote-${loteId}.csv"`);
    res.send('﻿' + lines.join('\r\n') + '\r\n');
  });

  return router;
}
