function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function qwenResolutionPolicy(candidates, { review, code }) {
  if (review) return { status: 'review', finalCode: null, reason: 'Qwen solicitó revisión humana.' };
  const firstCode = String(candidates?.[0]?.codigo || '');
  if (!firstCode || code !== firstCode) {
    return { status: 'review', finalCode: null, reason: `Qwen propuso ${code || 'sin código'} y no coincidió con el candidato principal de R2 ${firstCode || 'ausente'}.` };
  }
  return { status: 'resolved', finalCode: code, reason: 'Qwen confirmó el candidato principal de R2.' };
}

export async function classifyWithQwen(config, item, { allowDemo = true } = {}) {
  let result;
  if (config.qwenMode === 'demo') {
    if (!allowDemo || !item.demo_qwen) throw httpError(409, 'Qwen automático requiere QWEN_MODE=real; no se fabrican respuestas para bases nuevas.');
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
  if (!review && !item.candidates.some(candidate => candidate.codigo === code)) {
    throw httpError(422, 'Qwen devolvió un código fuera de los candidatos de R2.');
  }
  return { result, review, code };
}

