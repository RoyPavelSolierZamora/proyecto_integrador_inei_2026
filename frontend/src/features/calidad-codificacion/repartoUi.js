// Lógica pura de la página de reparto: porcentajes, validación de texto y sugerencias.
// No importa nada del navegador, para poder probarla con node --test.

export const SOURCE_SHORT = { ml: 'Clasificador', llm: 'IA', review: 'Manual', todas: 'Todas' };
export const SOURCE_HELP = {
  ml: 'Casos que cerró el clasificador automático. La persona los confirma o corrige.',
  llm: 'Casos que cerró el asistente de IA. La persona los confirma o corrige.',
  review: 'Casos que el sistema derivó a revisión manual. La persona los codifica.',
  todas: 'Todo lo pendiente de la base, sin separar fuentes. No se combina con otras fuentes de la misma base.',
};

// Convierte el texto de una parte en número. Vacío = resto (null). Acepta coma o punto.
export function parsePercent(text) {
  const clean = String(text ?? '').trim();
  if (clean === '') return null;
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(clean)) return NaN;
  return Number(clean.replace(',', '.'));
}

// Mensaje para una parte inválida, o null si está bien.
export function percentError(text) {
  const value = parsePercent(text);
  if (value === null) return null;
  if (Number.isNaN(value)) return 'Usa números, por ejemplo 40 o 33,5.';
  if (value <= 0) return 'La parte debe ser mayor que cero.';
  if (value > 100) return 'La parte no puede pasar de 100.';
  return null;
}

export function formatPercentText(value, decimals = 1) {
  return `${Number(value || 0).toFixed(decimals).replace('.', ',')} %`;
}

// Partes iguales con un decimal que suman exactamente 100. La última absorbe el redondeo.
export function equalShares(count) {
  if (count < 1) return [];
  const share = Math.floor((100 / count) * 10) / 10;
  const shares = Array.from({ length: count }, () => share);
  shares[count - 1] = Math.round((100 - share * (count - 1)) * 10) / 10;
  return shares;
}

// Partes según precisión verificada: quien acierta menos recibe menos. Sin dato se usa 0,5.
// Los valores suman 100 con un decimal.
export function accuracyShares(accuracies) {
  if (accuracies.length === 0) return [];
  const weights = accuracies.map(value => {
    const number = value === null || value === undefined || !Number.isFinite(value) ? 0.5 : value;
    return Math.min(1, Math.max(0.05, number));
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  const shares = weights.map(weight => Math.round((weight / total) * 1000) / 10);
  const diff = Math.round((100 - shares.reduce((sum, value) => sum + value, 0)) * 10) / 10;
  const top = shares.indexOf(Math.max(...shares));
  shares[top] = Math.round((shares[top] + diff) * 10) / 10;
  return shares;
}

// Estado de la línea de reparto según sus casos disponibles. Devuelve null si está bien.
export function sourceWarning(pending) {
  return pending > 0 ? null : 'No hay casos pendientes en esta fuente.';
}
