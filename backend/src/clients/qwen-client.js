function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function qwenResolutionPolicy(candidates, { review, code }, { modelVersion = '', confidence = null, aiThreshold = null } = {}) {
  if (review) return { status: 'review', finalCode: null, reason: 'El asistente de IA solicitó revisión humana.' };
  const selectedCode = String(code || '').trim();
  const candidateCodes = (Array.isArray(candidates) ? candidates : [])
    .map(candidate => String(candidate?.codigo || '').trim())
    .filter(Boolean);
  const candidateIndex = candidateCodes.indexOf(selectedCode);
  if (!selectedCode || candidateIndex < 0) {
    return {
      status: 'review',
      finalCode: null,
      reason: `El asistente de IA propuso ${selectedCode || 'sin código'}, que no pertenece a los candidatos válidos del clasificador.`,
    };
  }
  const rank = candidateIndex + 1;
  if (rank !== 1) {
    return {
      status: 'review',
      finalCode: null,
      reason: `El asistente de IA seleccionó la alternativa ${rank}; la evidencia actual no permite automatizar discrepancias con la primera propuesta del clasificador.`,
    };
  }
  if (String(modelVersion).startsWith('beto-v2-experimental-no-calibrado+')) {
    // BETO no está calibrado: la IA solo cierra si el trabajo fijó un umbral propio y el puntaje
    // de BETO lo alcanza. Sin umbral, la IA sugiere y el caso va a revisión humana.
    if (aiThreshold === null || aiThreshold === undefined || !Number.isFinite(Number(confidence))) {
      return { status: 'review', finalCode: null, reason: 'La propuesta de BETO e IA requiere confirmación humana.' };
    }
    if (Number(confidence) < Number(aiThreshold)) {
      return {
        status: 'review',
        finalCode: null,
        reason: `La IA confirmó la propuesta de BETO con puntaje ${Number(confidence).toFixed(4)}, por debajo del umbral de IA ${Number(aiThreshold).toFixed(2)}.`,
      };
    }
    return {
      status: 'resolved',
      finalCode: selectedCode,
      reason: `La IA confirmó la primera propuesta de BETO con puntaje ${Number(confidence).toFixed(4)} ≥ umbral de IA ${Number(aiThreshold).toFixed(2)}.`,
    };
  }
  return {
    status: 'resolved',
    finalCode: selectedCode,
    reason: 'El asistente de IA confirmó la primera propuesta del clasificador.',
  };
}

export async function classifyWithQwen(config, item, { signal } = {}) {
  let response;
  try {
    const timeoutSignal = AbortSignal.timeout(90_000);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    response = await fetch(`${config.r3BaseUrl}/codificar`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        ...(config.r3ApiToken ? { Authorization: `Bearer ${config.r3ApiToken}` } : {}),
      },
      body: JSON.stringify({
        id_registro: item.external_id,
        p309: item.p309,
        p308: item.p308 || '',
        p308a: item.p308a || '',
        candidatos: item.candidates,
        confianza_ml: item.confianza_ml,
        casos_similares: item.r2_evidence?.casos_similares || [],
      }),
      signal: requestSignal,
    });
  } catch (cause) {
    if (signal?.aborted) {
      const cancelled = httpError(499, 'La consulta de IA fue cancelada por el operador.');
      cancelled.code = 'QWEN_CANCELLED';
      throw cancelled;
    }
    throw httpError(503, cause.name === 'TimeoutError'
      ? 'El servicio de IA no respondió dentro de 90 segundos.'
      : 'No se pudo conectar con el servicio de IA.');
  }
  if (!response.ok) throw httpError(503, `El servicio de IA respondió ${response.status}.`);
  const result = await response.json();
  const review = result.decision === 'revision_humana' || result.requiere_revision === 1;
  const code = review ? null : String(result.codigo || '');
  if (!review && !item.candidates.some(candidate => candidate.codigo === code)) {
    throw httpError(422, 'El asistente de IA devolvió un código fuera de las propuestas del clasificador.');
  }
  return { result, review, code };
}


// Chat abierto con el mismo servicio remoto, sin el adaptador de clasificación.
// Solo se usa para preguntas de texto libre; nunca cambia una decisión de codificación.
export async function askQwenChat(config, { question, context = '' }) {
  if (config.r3Mode !== 'remote' || !config.r3BaseUrl) {
    throw httpError(503, 'El chat de IA requiere el servicio remoto de Colab.');
  }
  let response;
  try {
    response = await fetch(`${config.r3BaseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(config.r3ApiToken ? { Authorization: `Bearer ${config.r3ApiToken}` } : {}),
      },
      body: JSON.stringify({ pregunta: question, contexto: context }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (cause) {
    throw httpError(503, cause.name === 'TimeoutError'
      ? 'El chat de IA no respondió a tiempo.'
      : 'No se pudo conectar con el chat de IA.');
  }
  if (!response.ok) throw httpError(503, `El chat de IA respondió ${response.status}.`);
  const result = await response.json();
  return String(result.respuesta || '').trim();
}
