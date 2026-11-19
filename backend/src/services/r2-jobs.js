import { getPool, transaction } from '../db/pool.js';
import { predictR2Batch } from '../clients/r2-client.js';
import { classifyWithQwen, qwenResolutionPolicy } from '../clients/qwen-client.js';

let worker = Promise.resolve();
const activeQwenRequests = new Map();
const QWEN_BLOCKING_QUALITY_REASONS = new Set([
  'p309_vacio', 'p309_demasiado_corto', 'exceso_de_simbolos', 'caracteres_repetidos',
  'respuesta_no_informativa', 'texto_sin_sentido', 'fuera_de_distribucion',
]);

export function requiresDirectHumanReview(result) {
  if (result?.revision_manual === true) return true;
  const quality = result?.evidencia_r2?.calidad_entrada;
  if (quality?.nivel === 'baja') return true;
  return Array.isArray(quality?.motivos) && quality.motivos.some(reason => QWEN_BLOCKING_QUALITY_REASONS.has(reason));
}

// El cierre automático depende solo del umbral τ elegido en cada trabajo. El modelo BETO
// (sin calibrar) cierra con el mismo criterio que los demás clasificadores; la asistencia de IA
// nunca cierra por sí sola (ver qwenResolutionPolicy).
export function canResolveAutomatically(modelVersion, confidence, threshold) {
  return Number(confidence) >= Number(threshold);
}

export function mapJob(row) {
  const qwenPending = Number(row.qwen_pending_count || 0);
  const qwenProcessed = Number(row.qwen_processed_count || 0);
  const remainingQwen = Math.max(0, qwenPending - qwenProcessed);
  const averageSeconds = Number(row.qwen_average_seconds);
  const estimatedSecondsRemaining = row.status === 'qwen_running' && remainingQwen > 0 && Number.isFinite(averageSeconds) && averageSeconds > 0
    ? Math.ceil(remainingQwen * averageSeconds)
    : null;
  return {
    id: Number(row.id),
    datasetId: Number(row.dataset_id),
    datasetName: row.dataset_name,
    period: row.period,
    status: row.status,
    threshold: Number(row.threshold),
    aiThreshold: row.ai_threshold === null || row.ai_threshold === undefined ? null : Number(row.ai_threshold),
    total: Number(row.total_records),
    processed: Number(row.processed_records),
    automatic: Number(row.automatic_count),
    qwenPending,
    manual: Number(row.manual_count),
    qwenMode: row.qwen_mode || 'manual',
    qwenProcessed,
    qwenResolved: Number(row.qwen_resolved_count || 0),
    qwenReview: Number(row.qwen_review_count || 0),
    modelVersion: row.model_version,
    error: row.error_message,
    cancelRequested: Boolean(row.cancel_requested),
    qwenAverageSeconds: Number.isFinite(averageSeconds) && averageSeconds > 0 ? averageSeconds : null,
    estimatedSecondsRemaining,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export async function listR2Jobs(limit = 20) {
  const result = await getPool().query(`
    SELECT j.*, d.name AS dataset_name, d.period, qwen_stats.average_seconds AS qwen_average_seconds
    FROM epen.processing_jobs j JOIN epen.datasets d ON d.id = j.dataset_id
    LEFT JOIN LATERAL (
      SELECT avg(dec.latency_seconds)::float AS average_seconds
      FROM epen.decisions dec
      WHERE dec.run_id = ('r2-job-' || j.id::text)
        AND dec.source = 'llm' AND dec.latency_seconds > 0
    ) qwen_stats ON true
    ORDER BY j.created_at DESC, j.id DESC LIMIT $1
  `, [limit]);
  return result.rows.map(mapJob);
}

async function cancellationRequested(jobId) {
  const result = await getPool().query('SELECT cancel_requested FROM epen.processing_jobs WHERE id = $1', [jobId]);
  return !result.rowCount || result.rows[0].cancel_requested;
}

async function cancelJob(jobId, datasetId) {
  await transaction(async client => {
    const updated = await client.query(`
      UPDATE epen.processing_jobs
      SET status = 'cancelled', finished_at = now(), updated_at = now()
      WHERE id = $1 AND status NOT IN ('completed', 'failed', 'cancelled')
      RETURNING id
    `, [jobId]);
    if (!updated.rowCount) return;
    await client.query("UPDATE epen.datasets SET status = 'cancelled', notes = 'Procesamiento cancelado; se conservaron los resultados parciales.' WHERE id = $1", [datasetId]);
    await client.query(`
      INSERT INTO epen.audit_log (action, entity_type, entity_id, details)
      VALUES ('r2.job_cancelled', 'processing_job', $1, $2::jsonb)
    `, [String(jobId), JSON.stringify({ datasetId: Number(datasetId), preserved: true })]);
  });
}

async function failJob(jobId, datasetId, message) {
  await transaction(async client => {
    await client.query("UPDATE epen.processing_jobs SET status = 'failed', error_message = $1, finished_at = now(), updated_at = now() WHERE id = $2", [String(message).slice(0, 2000), jobId]);
    await client.query("UPDATE epen.datasets SET status = 'failed' WHERE id = $1", [datasetId]);
    await client.query(`
      INSERT INTO epen.audit_log (action, entity_type, entity_id, details)
      VALUES ('r2.job_failed', 'processing_job', $1, $2::jsonb)
    `, [String(jobId), JSON.stringify({ datasetId, error: String(message).slice(0, 500) })]);
  });
}

async function processR2Job(jobId, config) {
  const claimed = await transaction(async client => {
    const found = await client.query(`
      SELECT j.*, d.status AS dataset_status
      FROM epen.processing_jobs j JOIN epen.datasets d ON d.id = j.dataset_id
      WHERE j.id = $1 FOR UPDATE OF j
    `, [jobId]);
    if (!found.rowCount || ['completed', 'failed', 'cancelled'].includes(found.rows[0].status)) return null;
    if (found.rows[0].cancel_requested) return { ...found.rows[0], cancellation_pending: true };
    await client.query("UPDATE epen.processing_jobs SET status = 'running', started_at = COALESCE(started_at, now()), error_message = NULL, updated_at = now() WHERE id = $1", [jobId]);
    return found.rows[0];
  });
  if (!claimed) return;
  if (claimed.cancellation_pending) return cancelJob(jobId, claimed.dataset_id);

  try {
    let jobModelVersion = claimed.model_version || null;
    while (true) {
      if (await cancellationRequested(jobId)) return cancelJob(jobId, claimed.dataset_id);
      const batch = await getPool().query(`
        SELECT id, external_id, p309, p308, p308a, c309_1, c310, c311, c366
        FROM epen.survey_cases
        WHERE dataset_id = $1 AND candidates IS NULL AND status = 'pending'
        ORDER BY id LIMIT $2
      `, [claimed.dataset_id, config.r2BatchSize]);
      if (!batch.rowCount) break;
      const records = batch.rows.map(row => ({
        id_registro: row.external_id, p309: row.p309, p308: row.p308 || '', p308a: row.p308a || '',
        c309_1: row.c309_1 || '', c310: row.c310 || '', c311: row.c311 || '', c366: row.c366 || '',
      }));
      const prediction = await predictR2Batch(config, {
        runId: `r2-job-${jobId}`, datasetId: Number(claimed.dataset_id), records,
      });
      if (jobModelVersion && prediction.modelVersion !== jobModelVersion) {
        throw new Error('El modelo del clasificador cambió durante el trabajo. Inicie una nueva versión para conservar la trazabilidad.');
      }
      jobModelVersion = prediction.modelVersion;
      const returnedCodes = [...new Set(prediction.results.flatMap(item => item.candidatos?.map(candidate => candidate.codigo) || []))];
      if (returnedCodes.length) {
        const catalog = await getPool().query('SELECT code FROM epen.ciiu_catalog WHERE active = true AND code::text = ANY($1::text[])', [returnedCodes]);
        const legalCodes = new Set(catalog.rows.map(row => row.code));
        const unknown = returnedCodes.filter(code => !legalCodes.has(code));
        if (unknown.length) throw new Error(`R2 devolvió códigos fuera del catálogo activo: ${unknown.join(', ')}.`);
      }
      const byExternalId = new Map(batch.rows.map(row => [row.external_id, row]));
      await transaction(async client => {
        let automatic = 0;
        let qwenPending = 0;
        let manual = 0;
        for (const result of prediction.results) {
          const row = byExternalId.get(result.id_registro);
          if (requiresDirectHumanReview(result)) {
            manual += 1;
            await client.query("UPDATE epen.survey_cases SET status = 'review', r2_evidence = $2::jsonb, updated_at = now() WHERE id = $1", [row.id, JSON.stringify(result.evidencia_r2 || {})]);
            const reason = result.motivo || 'La calidad de entrada no permite una clasificación automática segura.';
            await client.query("INSERT INTO epen.decisions (case_id, run_id, source, decision, justification, model) VALUES ($1, $2, 'ml', 'derivation', $3, $4)", [row.id, `r2-job-${jobId}`, reason, prediction.modelVersion]);
            continue;
          }
          // BETO cierra por el umbral del trabajo, como los demás clasificadores. Su puntaje no está calibrado:
          // la precisión medida por banda está en la evaluación de septiembre de 2026.
          const isAutomatic = canResolveAutomatically(prediction.modelVersion, result.confianza_ml, claimed.threshold);
          if (isAutomatic) automatic += 1;
          else qwenPending += 1;
          await client.query(`
            UPDATE epen.survey_cases
            SET candidates = $1::jsonb, confianza_ml = $2, status = $3, final_code = $4,
                r2_evidence = $5::jsonb, updated_at = now()
            WHERE id = $6
          `, [JSON.stringify(result.candidatos), result.confianza_ml, isAutomatic ? 'resolved' : 'pending', isAutomatic ? result.candidatos[0].codigo : null, JSON.stringify(result.evidencia_r2 || {}), row.id]);
          if (isAutomatic) {
            await client.query(`
              INSERT INTO epen.decisions (case_id, run_id, source, decision, code, justification, model)
              VALUES ($1, $2, 'ml', 'automatic', $3, $4, $5)
            `, [row.id, `r2-job-${jobId}`, result.candidatos[0].codigo, `Confianza R2 ${result.confianza_ml.toFixed(4)} ≥ umbral ${Number(claimed.threshold).toFixed(4)}`, prediction.modelVersion]);
          }
        }
        await client.query(`
          UPDATE epen.processing_jobs
          SET processed_records = processed_records + $1,
              automatic_count = automatic_count + $2,
              qwen_pending_count = qwen_pending_count + $3,
              manual_count = manual_count + $4,
              model_version = $5, updated_at = now()
          WHERE id = $6
        `, [prediction.results.length, automatic, qwenPending, manual, prediction.modelVersion, jobId]);
      });
    }

    const remaining = await getPool().query('SELECT count(*)::int AS total FROM epen.survey_cases WHERE dataset_id = $1 AND candidates IS NULL AND status = $2', [claimed.dataset_id, 'pending']);
    if (remaining.rows[0].total > 0) throw new Error('El trabajo terminó con registros sin respuesta R2.');

    if (await cancellationRequested(jobId)) return cancelJob(jobId, claimed.dataset_id);

    if (claimed.qwen_mode === 'automatic') {
      await getPool().query("UPDATE epen.processing_jobs SET status = 'qwen_running', qwen_started_at = COALESCE(qwen_started_at, now()), updated_at = now() WHERE id = $1", [jobId]);
      while (true) {
        if (await cancellationRequested(jobId)) return cancelJob(jobId, claimed.dataset_id);
        const pending = await getPool().query(`
          SELECT c.* FROM epen.survey_cases c
          WHERE c.dataset_id = $1 AND c.status = 'pending' AND c.candidates IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM epen.decisions d WHERE d.case_id = c.id AND d.source = 'llm')
          ORDER BY c.id LIMIT 1
        `, [claimed.dataset_id]);
        if (!pending.rowCount) break;
        const item = pending.rows[0];
        let qwen;
        let policy;
        const qwenController = new AbortController();
        activeQwenRequests.set(Number(jobId), qwenController);
        try {
          qwen = await classifyWithQwen(config, item, { signal: qwenController.signal });
          policy = qwenResolutionPolicy(item.candidates, qwen);
        } catch (cause) {
          if (cause.code === 'QWEN_CANCELLED' || await cancellationRequested(jobId)) {
            return cancelJob(jobId, claimed.dataset_id);
          }
          qwen = { result: { justificacion: `El asistente de IA no estuvo disponible: ${cause.message}`, modelo: null, latencia_s: null }, review: true, code: null };
          policy = { status: 'review', finalCode: null, reason: 'La consulta automática falló y requiere revisión humana.' };
        } finally {
          if (activeQwenRequests.get(Number(jobId)) === qwenController) activeQwenRequests.delete(Number(jobId));
        }
        const justification = [qwen.result.justificacion, policy.reason].filter(Boolean).join(' ');
        await transaction(async client => {
          await client.query(`
            INSERT INTO epen.decisions (case_id, run_id, source, decision, code, justification, model, latency_seconds)
            VALUES ($1, $2, 'llm', $3, $4, $5, $6, $7)
          `, [item.id, `r2-job-${jobId}`, qwen.review ? 'revision' : 'selection', qwen.code, justification, qwen.result.modelo || null, qwen.result.latencia_s || null]);
          await client.query('UPDATE epen.survey_cases SET status = $1, final_code = $2, updated_at = now() WHERE id = $3', [policy.status, policy.finalCode, item.id]);
          await client.query(`
            UPDATE epen.processing_jobs
            SET qwen_processed_count = qwen_processed_count + 1,
                qwen_resolved_count = qwen_resolved_count + $1,
                qwen_review_count = qwen_review_count + $2,
                updated_at = now()
            WHERE id = $3
          `, [policy.status === 'resolved' ? 1 : 0, policy.status === 'review' ? 1 : 0, jobId]);
        });
      }
    }

    if (await cancellationRequested(jobId)) return cancelJob(jobId, claimed.dataset_id);

    await transaction(async client => {
      await client.query("UPDATE epen.datasets SET status = 'archived' WHERE status = 'active' AND kind = 'system'");
      await client.query("UPDATE epen.datasets SET status = 'active', activated_at = now() WHERE id = $1", [claimed.dataset_id]);
      await client.query("UPDATE epen.processing_jobs SET status = 'completed', processed_records = total_records, finished_at = now(), updated_at = now() WHERE id = $1", [jobId]);
      await client.query(`
        INSERT INTO epen.audit_log (user_id, action, entity_type, entity_id, details)
        VALUES ($1, 'r2.job_completed', 'processing_job', $2, $3::jsonb)
      `, [claimed.created_by, String(jobId), JSON.stringify({ datasetId: Number(claimed.dataset_id), threshold: Number(claimed.threshold), qwenMode: claimed.qwen_mode })]);
    });
  } catch (cause) {
    await failJob(jobId, claimed.dataset_id, cause.message);
  }
}

export async function requestR2JobCancellation(jobId) {
  const result = await transaction(async client => {
    const found = await client.query('SELECT id, dataset_id, status FROM epen.processing_jobs WHERE id = $1 FOR UPDATE', [jobId]);
    if (!found.rowCount) return { outcome: 'missing' };
    const job = found.rows[0];
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return { outcome: 'finished', status: job.status };
    const queued = job.status === 'queued';
    await client.query(`
      UPDATE epen.processing_jobs
      SET cancel_requested = true, cancel_requested_at = now(),
          status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
          finished_at = CASE WHEN status = 'queued' THEN now() ELSE finished_at END,
          updated_at = now()
      WHERE id = $1
    `, [jobId]);
    if (queued) await client.query("UPDATE epen.datasets SET status = 'cancelled', notes = 'Procesamiento cancelado antes de iniciar.' WHERE id = $1", [job.dataset_id]);
    return { outcome: queued ? 'cancelled' : 'requested', status: queued ? 'cancelled' : job.status };
  });
  if (result.outcome === 'requested') activeQwenRequests.get(Number(jobId))?.abort();
  return result;
}

export function enqueueR2Job(jobId, config) {
  worker = worker.then(() => processR2Job(jobId, config)).catch(error => console.error('Cola R2:', error.message));
  return worker;
}

export async function resumeR2Jobs(config) {
  const jobs = await getPool().query("SELECT id FROM epen.processing_jobs WHERE status IN ('queued', 'running', 'qwen_running') ORDER BY created_at, id");
  for (const row of jobs.rows) enqueueR2Job(row.id, config);
  return jobs.rowCount;
}

