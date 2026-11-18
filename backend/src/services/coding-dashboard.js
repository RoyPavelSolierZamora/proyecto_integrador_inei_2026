// Agregados del tablero de codificación. Funciones puras: reciben filas ya leídas de la base y devuelven
// lo que muestra Métricas. No consultan la base de datos.
import { summarizeVerdicts } from './quality-metrics.js';

// Avance por codificador a partir de las decisiones humanas registradas en esta base.
// "Completó la base" = registró una decisión en todos los registros de la base.
export function coderProgress(humanDecisions, totalRecords) {
  const byUser = new Map();
  for (const row of humanDecisions) {
    if (!row.user_id) continue;
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, { userId: row.user_id, name: row.full_name || row.username, username: row.username, analystCode: row.analyst_code || null, decisions: 0, confirmations: 0, corrections: 0, derivations: 0, cases: new Set(), days: new Map() });
    }
    const entry = byUser.get(row.user_id);
    entry.decisions += 1;
    entry.cases.add(row.case_id);
    if (row.decision === 'confirmation') entry.confirmations += 1;
    else if (row.decision === 'correction') entry.corrections += 1;
    else if (row.decision === 'derivation') entry.derivations += 1;
    const day = String(row.created_at).slice(0, 10);
    entry.days.set(day, (entry.days.get(day) || 0) + 1);
  }
  return [...byUser.values()]
    .map(entry => ({
      userId: entry.userId,
      name: entry.name,
      username: entry.username,
      analystCode: entry.analystCode,
      decisions: entry.decisions,
      confirmations: entry.confirmations,
      corrections: entry.corrections,
      derivations: entry.derivations,
      casesCovered: entry.cases.size,
      completedBase: totalRecords > 0 && entry.cases.size >= totalRecords,
      daily: [...entry.days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, count]) => ({ day, count })),
    }))
    .sort((a, b) => b.decisions - a.decisions);
}

// Precisión por división CIIU (dos primeros dígitos del código de referencia).
export function accuracyByDivision(comparedItems) {
  const groups = {};
  for (const item of comparedItems) {
    const division = String(item.referenceCode || '').slice(0, 2);
    if (!division) continue;
    (groups[division] ??= []).push(item.verdict);
  }
  return Object.entries(groups)
    .map(([division, verdicts]) => ({ division, ...summarizeVerdicts(verdicts) }))
    .sort((a, b) => b.reviewed - a.reviewed);
}

// Pares de confusión: lo que dijo el sistema frente a la referencia, en los casos donde no coinciden.
export function topConfusions(comparedItems, limit = 8) {
  const counts = new Map();
  for (const item of comparedItems) {
    if (item.verdict !== 'incorrect') continue;
    const key = `${item.systemCode}|${item.referenceCode}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [systemCode, referenceCode] = key.split('|');
      return { systemCode, referenceCode, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// Serie diaria de decisiones humanas de la base (todos los codificadores).
export function dailyProgress(humanDecisions) {
  const days = new Map();
  for (const row of humanDecisions) {
    const day = String(row.created_at).slice(0, 10);
    days.set(day, (days.get(day) || 0) + 1);
  }
  return [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, count]) => ({ day, count }));
}

// Une todo en el payload del tablero. Solo muestra el bloque de codificadores cuando hay una referencia
// activa con coincidencias o cuando algún codificador completó la base.
export function buildCodingDashboard({ records, reference, comparison, comparedItems, humanDecisions, activeReference }) {
  const progress = coderProgress(humanDecisions, records);
  const completed = progress.filter(item => item.completedBase);
  const referenceActive = Boolean(activeReference) && comparison && comparison.matched > 0;
  const coderSectionVisible = referenceActive || completed.length > 0;
  const compared = comparison?.compared ?? 0;
  const byBand = comparison ? Object.entries(comparison.byBand).map(([band, summary]) => ({ band, ...summary })) : [];
  return {
    kpis: {
      records,
      matchedWithReference: comparison?.matched ?? 0,
      compared,
      accuracy: comparison?.overall?.accuracy ?? null,
      interval: comparison?.overall?.interval ?? null,
      incorrect: comparison?.overall?.incorrect ?? 0,
      pending: comparison?.pending ?? 0,
      coders: progress.length,
      humanDecisions: humanDecisions.length,
    },
    // Exactitud, comparación y confusiones solo existen con una referencia activa con coincidencias.
    referenceVisible: referenceActive,
    coderSectionVisible,
    coderSectionReason: referenceActive ? 'referencia-activa' : completed.length ? 'base-completada' : null,
    reference: reference ? { id: reference.id, name: reference.name, period: reference.period, records: reference.records } : null,
    coders: progress,
    analystsReference: comparison ? Object.entries(comparison.byAnalyst).map(([analyst, summary]) => ({ analyst, ...summary })) : [],
    byBand,
    byOrigin: comparison ? Object.entries(comparison.byOrigin).map(([origin, summary]) => ({ origin, ...summary })) : [],
    byDivision: accuracyByDivision(comparedItems || []),
    confusions: topConfusions(comparedItems || []),
    daily: dailyProgress(humanDecisions),
  };
}

