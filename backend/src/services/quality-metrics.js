// Funciones puras del control de calidad: bandas de confianza, veredicto de una verificación
// y estimación de la precisión con intervalo de Wilson (95 %). No consultan la base de datos.

export const CONFIDENCE_BANDS = ['>=0.99', '0.97-0.99', '0.95-0.97', '<0.95', 'sin_puntaje'];

// Banda de puntaje de la decisión automática o de la IA. Los límites coinciden con el análisis de septiembre.
export function confidenceBand(score) {
  const value = Number(score);
  if (score === null || score === undefined || !Number.isFinite(value)) return 'sin_puntaje';
  if (value >= 0.99) return '>=0.99';
  if (value >= 0.97) return '0.97-0.99';
  if (value >= 0.95) return '0.95-0.97';
  return '<0.95';
}

// Veredicto de una verificación frente a la decisión revisada.
// "no_clasificable" no cuenta como acierto ni como error: el caso no tiene un código verificable.
export function verdictFor(decisionCode, reviewedCode) {
  if (reviewedCode === 'no_clasificable') return 'uncertain';
  if (!/^[0-9]{4}$/.test(String(reviewedCode || ''))) throw new Error('Código revisado no válido.');
  if (!decisionCode) return 'incorrect';
  return String(reviewedCode) === String(decisionCode) ? 'correct' : 'incorrect';
}

// Intervalo de confianza de Wilson para una proporción. Con muestras pequeñas es más honesto que el
// error estándar normal: nunca da intervalos fuera de [0, 1] ni cero ancho con pocos casos.
export function wilsonInterval(successes, total, z = 1.96) {
  if (!total || total <= 0) return null;
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominator;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

// Resume una lista de veredictos: la precisión se calcula solo sobre los casos verificados (correctos e incorrectos).
export function summarizeVerdicts(verdicts) {
  let correct = 0;
  let incorrect = 0;
  let uncertain = 0;
  for (const verdict of verdicts) {
    if (verdict === 'correct') correct += 1;
    else if (verdict === 'incorrect') incorrect += 1;
    else if (verdict === 'uncertain') uncertain += 1;
  }
  const verified = correct + incorrect;
  return {
    reviewed: verdicts.length,
    correct,
    incorrect,
    uncertain,
    verified,
    accuracy: verified ? correct / verified : null,
    interval: wilsonInterval(correct, verified),
  };
}
