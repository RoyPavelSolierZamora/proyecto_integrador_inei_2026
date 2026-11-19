// Reparto de casos por lotes. Funciones puras: no consultan la base de datos.
//
// Un lote es: una base, una fuente de casos y una persona.
//   ml      casos que cerró el clasificador automático: la persona los verifica (confirma o corrige).
//   llm     casos que cerró el asistente de IA: la persona los verifica.
//   review  casos derivados a revisión manual: la persona los codifica.
//   todas   todo lo pendiente de la base, sin distinguir fuente. No se combina con otros lotes de la misma base.
//
// Cada lote recibe un porcentaje de su grupo (base + fuente) o «resto», que toma lo que quede.
// Un caso nunca entra en dos lotes.
import { createHash } from 'node:crypto';

export const SOURCES = ['ml', 'llm', 'review', 'todas'];
export const SOURCE_LABELS = {
  ml: 'Clasificador automático',
  llm: 'Asistente de IA',
  review: 'Revisión manual',
  todas: 'Todas las fuentes',
};

const POOL_SOURCES = ['ml', 'llm', 'review'];

function stableKey(value) {
  return createHash('md5').update(String(value)).digest('hex');
}

export function groupKey(datasetId, fuente) {
  return `${datasetId}|${fuente}`;
}

// items: [{ datasetId, fuente, asignadoId, porcentaje }]. porcentaje null = resto.
// poolCounts: Map(groupKey -> cantidad de casos disponibles). Devuelve { errors, warnings }.
export function validatePlan(items, poolCounts) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(items) || items.length === 0) {
    return { errors: ['Agrega al menos una asignación.'], warnings };
  }
  const groups = new Map();
  items.forEach((item, index) => {
    const linea = index + 1;
    if (!SOURCES.includes(item.fuente)) errors.push(`Asignación ${linea}: fuente no válida.`);
    if (!Number.isSafeInteger(item.datasetId) || item.datasetId < 1) errors.push(`Asignación ${linea}: indica la base.`);
    if (item.asignadoId !== null && (!Number.isSafeInteger(item.asignadoId) || item.asignadoId < 1)) {
      errors.push(`Asignación ${linea}: codificador no válido.`);
    }
    if (item.porcentaje !== null && (!Number.isFinite(item.porcentaje) || item.porcentaje <= 0 || item.porcentaje > 100)) {
      errors.push(`Asignación ${linea}: el porcentaje debe estar entre 0 y 100.`);
    }
    const key = groupKey(item.datasetId, item.fuente);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  if (errors.length) return { errors, warnings };

  const byDataset = new Map();
  for (const item of items) {
    if (!byDataset.has(item.datasetId)) byDataset.set(item.datasetId, new Set());
    byDataset.get(item.datasetId).add(item.fuente);
  }
  for (const [datasetId, sources] of byDataset) {
    if (sources.has('todas') && sources.size > 1) {
      errors.push(`La base ${datasetId}: «Todas las fuentes» no puede combinarse con otras fuentes de la misma base.`);
    }
  }

  for (const [key, list] of groups) {
    const [datasetId, fuente] = key.split('|');
    const available = poolCounts.get(key) || 0;
    const label = `${SOURCE_LABELS[fuente]} de la base ${datasetId}`;
    if (available === 0) {
      errors.push(`No hay casos pendientes de ${label.toLowerCase()}.`);
      continue;
    }
    const restos = list.filter(item => item.porcentaje === null).length;
    if (restos > 1) errors.push(`${label}: solo puede haber un lote con «resto».`);
    const sum = list.reduce((total, item) => total + (item.porcentaje ?? 0), 0);
    if (sum > 100 + 1e-9) errors.push(`${label}: los porcentajes suman ${sum.toFixed(1).replace('.', ',')} % y no pueden pasar de 100 %.`);
    const personas = list.map(item => item.asignadoId).filter(id => id !== null);
    if (new Set(personas).size < personas.length) {
      warnings.push(`${label}: la misma persona aparece dos veces. Revisa si es intencional.`);
    }
    if (restos === 0 && sum < 100 - 1e-9) {
      const quedan = Math.round(available * (1 - sum / 100));
      warnings.push(`${label}: quedarán ${quedan} casos sin asignar.`);
    }
  }
  return { errors, warnings };
}

// Reparte los casos de cada grupo entre sus lotes. pools: Map(groupKey -> [{ id, externalId }]).
// Devuelve Map(índice de la asignación -> casos) y los casos que quedan sin asignar por grupo.
export function allocatePlan(items, pools) {
  const result = new Map();
  const leftovers = new Map();
  const groups = new Map();
  items.forEach((item, index) => {
    const key = groupKey(item.datasetId, item.fuente);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...item, index });
  });

  for (const [key, list] of groups) {
    const cases = [...(pools.get(key) || [])].sort((a, b) => stableKey(a.externalId).localeCompare(stableKey(b.externalId)));
    const total = cases.length;
    const explicit = list.filter(item => item.porcentaje !== null);
    const resto = list.find(item => item.porcentaje === null);
    const sum = explicit.reduce((acc, item) => acc + item.porcentaje, 0);
    const target = Math.min(total, Math.round((sum / 100) * total));

    // Reparto por el método del resto mayor: cada porcentaje recibe su parte entera y luego las unidades que faltan.
    const exact = explicit.map(item => ({ index: item.index, raw: (item.porcentaje / 100) * total }));
    const counts = new Map(exact.map(item => [item.index, Math.floor(item.raw)]));
    let remaining = target - [...counts.values()].reduce((acc, value) => acc + value, 0);
    [...exact].sort((a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw))).forEach(item => {
      if (remaining > 0) {
        counts.set(item.index, counts.get(item.index) + 1);
        remaining -= 1;
      }
    });
    if (resto) counts.set(resto.index, total - target);

    let cursor = 0;
    for (const item of list) {
      const n = counts.get(item.index) || 0;
      result.set(item.index, cases.slice(cursor, cursor + n));
      cursor += n;
    }
    leftovers.set(key, cases.slice(cursor));
  }
  return { assigned: result, leftovers };
}

// Sugerencia opcional: reparte un porcentaje más grande a quien tiene mejor precisión verificada.
// people: [{ id, accuracy }]. Sin datos de precisión se usa 0,5. Los porcentajes suman 100.
export function suggestByAccuracy(people) {
  if (people.length === 0) return [];
  const weights = people.map(person => {
    const value = person.accuracy === null || person.accuracy === undefined ? 0.5 : person.accuracy;
    return Math.min(1, Math.max(0.05, value));
  });
  const total = weights.reduce((acc, value) => acc + value, 0);
  const raw = weights.map(weight => (weight / total) * 100);
  const rounded = raw.map(value => Math.round(value * 10) / 10);
  const diff = Math.round((100 - rounded.reduce((acc, value) => acc + value, 0)) * 10) / 10;
  rounded[rounded.indexOf(Math.max(...rounded))] = Math.round((Math.max(...rounded) + diff) * 10) / 10;
  return people.map((person, index) => ({ id: person.id, percent: rounded[index] }));
}
