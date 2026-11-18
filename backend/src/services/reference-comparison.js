// Funciones puras para la base codificada de referencia: validación de filas importadas y comparación
// entre la decisión del sistema y el código de referencia. No consultan la base de datos.
import { confidenceBand, summarizeVerdicts } from './quality-metrics.js';

const CODE = /^[0-9]{4}$/;
const ANALYST = /^[A-Za-z0-9_-]{1,20}$/;

// Valida las filas de una base de referencia. Devuelve las filas normalizadas o los primeros errores.
export function validateReferenceRows(rows, catalogCodes) {
  const errors = [];
  const seen = new Set();
  const clean = [];
  rows.forEach((row, index) => {
    const line = index + 1;
    const externalId = String(row?.externalId ?? '').trim();
    const p309 = String(row?.p309 ?? '').trim();
    const code = String(row?.code ?? '').trim();
    const analyst = String(row?.analyst ?? '').trim();
    if (!externalId || externalId.length > 120) { errors.push(`Fila ${line}: id_registro obligatorio (máximo 120 caracteres).`); return; }
    if (!p309) { errors.push(`Fila ${line}: p309 obligatorio.`); return; }
    if (seen.has(externalId)) { errors.push(`Fila ${line}: id_registro repetido.`); return; }
    seen.add(externalId);
    if (!CODE.test(code) || !catalogCodes.has(code)) { errors.push(`Fila ${line}: código ${code || '(vacío)'} no existe en el catálogo CIIU activo.`); return; }
    if (analyst && !ANALYST.test(analyst)) { errors.push(`Fila ${line}: código de analista no válido.`); return; }
    clean.push({ externalId, p309, p308: String(row?.p308 ?? '').trim(), p308a: String(row?.p308a ?? '').trim(), code, analyst: analyst || null });
  });
  return { rows: clean, errors: errors.slice(0, 10), errorCount: errors.length };
}

// Compara las decisiones del sistema con la referencia. Un caso sin código final del sistema queda como pendiente.
// Los puntajes sin valor cuentan como "sin puntaje" y no se mezclan con las bandas.
export function compareWithReference(systemCases, referenceCases) {
  const reference = new Map(referenceCases.map(row => [row.external_id, row]));
  const matched = [];
  let onlySystem = 0;
  for (const row of systemCases) {
    const ref = reference.get(row.external_id);
    if (!ref) { onlySystem += 1; continue; }
    const pending = !row.final_code;
    const verdict = pending ? 'pending' : (String(row.final_code) === String(ref.final_code) ? 'correct' : 'incorrect');
    matched.push({
      externalId: row.external_id,
      p309: row.p309,
      systemCode: row.final_code ? String(row.final_code) : null,
      referenceCode: String(ref.final_code),
      analyst: ref.analyst_code || 'SIN_CODIGO',
      origin: row.origin || 'pendiente',
      band: confidenceBand(row.confianza_ml),
      verdict,
    });
  }
  const compared = matched.filter(item => item.verdict !== 'pending');
  const verdicts = compared.map(item => item.verdict);
  const byBand = {};
  const byOrigin = {};
  const byAnalyst = {};
  for (const item of compared) {
    (byBand[item.band] ??= []).push(item.verdict);
    (byOrigin[item.origin] ??= []).push(item.verdict);
    (byAnalyst[item.analyst] ??= []).push(item.verdict);
  }
  const mapSummaries = source => Object.fromEntries(Object.entries(source).map(([key, list]) => [key, summarizeVerdicts(list)]));
  return {
    matched: matched.length,
    compared: compared.length,
    pending: matched.length - compared.length,
    onlySystem,
    overall: summarizeVerdicts(verdicts),
    byBand: mapSummaries(byBand),
    byOrigin: mapSummaries(byOrigin),
    byAnalyst: mapSummaries(byAnalyst),
    discrepancies: compared.filter(item => item.verdict === 'incorrect').slice(0, 200),
    // Todos los casos comparados: alimentan los agregados del tablero; la ruta no los envía al cliente.
    items: compared,
  };
}
