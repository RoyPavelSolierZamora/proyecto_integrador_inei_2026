const validCode = code => typeof code === 'string' && /^\d{4}$/.test(code);

function topCode(candidates) {
  if (!Array.isArray(candidates)) return null;
  const top = candidates.find(candidate => Number(candidate?.rank) === 1) ?? candidates[0];
  return String(top?.codigo ?? '');
}

function classification(rows, predict) {
  const classes = new Map();
  function counts(code) {
    if (!classes.has(code)) classes.set(code, { actual: 0, predicted: 0, correct: 0 });
    return classes.get(code);
  }

  let evaluated = 0;
  let correct = 0;
  for (const row of rows) {
    const predicted = predict(row);
    const actual = row.human_code;
    if (!validCode(predicted) || !validCode(actual)) continue;
    evaluated += 1;
    counts(actual).actual += 1;
    counts(predicted).predicted += 1;
    if (actual === predicted) {
      correct += 1;
      counts(actual).correct += 1;
    }
  }

  let f1Sum = 0;
  for (const label of classes.values()) {
    f1Sum += 2 * label.correct / (label.actual + label.predicted);
  }
  return {
    evaluated,
    accuracy: evaluated ? correct / evaluated : null,
    macroF1: evaluated ? f1Sum / classes.size : null,
  };
}

export function summarizeWorkspaceIndicators(rows, run = {}) {
  let processed = 0;
  let automatic = 0;
  for (const row of rows) {
    if (row.ml_decision || (Array.isArray(row.candidates) && row.candidates.length)) processed += 1;
    if (row.ml_automatic) automatic += 1;
  }
  const r3Queries = Number(run.r3_queries || 0);
  return {
    r2: {
      ...classification(rows, row => topCode(row.candidates)),
      automaticApproval: processed ? automatic / processed : null,
      threshold: run.r2_threshold == null ? null : Number(run.r2_threshold),
    },
    r3: {
      ...classification(rows, row => row.r3_code),
      automaticApproval: r3Queries ? Number(run.r3_resolved) / r3Queries : null,
    },
  };
}

export async function workspaceIndicators(db, datasetId) {
  const [evidence, runs] = await Promise.all([
    db.query(`
      SELECT c.candidates, COALESCE(ref.code, human.code) AS human_code, ref.code AS reference_code, llm.code AS r3_code,
             ml.processed AS ml_decision, ml.automatic AS ml_automatic
      FROM epen.survey_cases c
      LEFT JOIN LATERAL (
        SELECT code FROM epen.decisions
        WHERE case_id = c.id AND source = 'human'
          AND decision IN ('confirmation', 'correction') AND code IS NOT NULL
        ORDER BY created_at DESC, id DESC LIMIT 1
      ) human ON true
      LEFT JOIN LATERAL (
        SELECT rc.final_code AS code FROM epen.survey_cases rc
        JOIN epen.datasets rd ON rd.id = rc.dataset_id
        WHERE rd.kind = 'reference' AND rd.status = 'active' AND rc.external_id = c.external_id AND rc.final_code IS NOT NULL
        ORDER BY rc.id DESC LIMIT 1
      ) ref ON true
      LEFT JOIN LATERAL (
        SELECT code FROM epen.decisions
        WHERE case_id = c.id AND source = 'llm' AND decision = 'selection' AND code IS NOT NULL
        ORDER BY created_at DESC, id DESC LIMIT 1
      ) llm ON true
      LEFT JOIN LATERAL (
        SELECT count(*) > 0 AS processed,
               bool_or(decision = 'automatic' AND code IS NOT NULL) AS automatic
        FROM epen.decisions WHERE case_id = c.id AND source = 'ml'
      ) ml ON true
      WHERE c.dataset_id = $1
        AND (SELECT kind FROM epen.datasets WHERE id = $1) = 'system'
    `, [datasetId]),
    db.query(`
      SELECT sum(qwen_processed_count) FILTER (WHERE qwen_mode = 'automatic') AS r3_queries,
             sum(qwen_resolved_count) FILTER (WHERE qwen_mode = 'automatic') AS r3_resolved,
             COALESCE((
               SELECT details->>'threshold' FROM epen.audit_log
               WHERE action = 'dataset.r2_simulated' AND entity_type = 'dataset' AND entity_id = $1::bigint::text
               ORDER BY created_at DESC, id DESC LIMIT 1
             ), CASE WHEN count(DISTINCT threshold) FILTER (WHERE processed_records > 0) = 1
                THEN (min(threshold) FILTER (WHERE processed_records > 0))::text END) AS r2_threshold
      FROM epen.processing_jobs WHERE dataset_id = $1
    `, [datasetId]),
  ]);
  const activeReference = await db.query("SELECT 1 FROM epen.datasets WHERE kind = 'reference' AND status = 'active' LIMIT 1");
  return {
    ...summarizeWorkspaceIndicators(evidence.rows, runs.rows[0]),
    // Cobertura con la referencia activa: cuántos registros de esta base están en ella.
    reference: {
      hasActiveReference: activeReference.rowCount > 0,
      matched: evidence.rows.filter(row => row.reference_code).length,
      total: evidence.rows.length,
    },
  };
}
