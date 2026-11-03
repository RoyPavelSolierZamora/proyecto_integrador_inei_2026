function serviceError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeCandidate(item, index) {
  const codigo = String(item?.codigo || '');
  const prob = Number(item?.prob);
  if (!/^\d{4}$/.test(codigo) || !Number.isFinite(prob) || prob < 0 || prob > 1) {
    throw serviceError(502, 'R2 devolvió un candidato inválido.');
  }
  return {
    codigo,
    descripcion: String(item.descripcion || ''),
    prob,
    rank: Number.isInteger(item.rank) ? item.rank : index + 1,
  };
}

export function validateR2Response(payload, expectedIds) {
  if (!payload || payload.contract_version !== '1.0' || !Array.isArray(payload.results)) {
    throw serviceError(502, 'R2 no respondió con el contrato v1.0.');
  }
  const expected = new Set(expectedIds.map(String));
  const seen = new Set();
  const results = payload.results.map(item => {
    const id = String(item?.id_registro || '');
    if (!expected.has(id) || seen.has(id)) throw serviceError(502, 'R2 devolvió identificadores faltantes, repetidos o desconocidos.');
    seen.add(id);
    if (item.revision_manual === true) {
      return { id_registro: id, revision_manual: true, motivo: String(item.motivo || 'R2 no produjo candidatos válidos.') };
    }
    if (!Array.isArray(item.candidatos) || item.candidatos.length < 1 || item.candidatos.length > 5) {
      throw serviceError(502, 'R2 debe devolver entre 1 y 5 candidatos por registro.');
    }
    const candidatos = item.candidatos.map(normalizeCandidate).sort((a, b) => a.rank - b.rank);
    const confianza = Number(item.confianza_ml);
    if (!Number.isFinite(confianza) || confianza < 0 || confianza > 1) throw serviceError(502, 'R2 devolvió una confianza fuera del intervalo 0–1.');
    return { id_registro: id, candidatos, confianza_ml: confianza, revision_manual: false };
  });
  if (seen.size !== expected.size) throw serviceError(502, 'R2 no devolvió todos los registros solicitados.');
  return { modelVersion: String(payload.model_version || 'r2-sin-version'), results };
}

export async function r2Health(config) {
  try {
    const response = await fetch(`${config.r2BaseUrl}/salud`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (cause) {
    throw serviceError(503, `No se pudo conectar con R2: ${cause.message}`);
  }
}

export async function predictR2Batch(config, { runId, datasetId, records }) {
  let response;
  try {
    response = await fetch(`${config.r2BaseUrl}/v1/predict-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ contract_version: '1.0', run_id: runId, dataset_id: datasetId, records }),
      signal: AbortSignal.timeout(config.r2TimeoutSeconds * 1_000),
    });
  } catch (cause) {
    throw serviceError(503, cause.name === 'TimeoutError' ? 'R2 superó el tiempo máximo del lote.' : `No se pudo conectar con R2: ${cause.message}`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw serviceError(502, payload?.error || `R2 respondió HTTP ${response.status}.`);
  return validateR2Response(payload, records.map(item => item.id_registro));
}

