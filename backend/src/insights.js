const HELP_TOPICS = [
  { terms: ['importar', 'cargar', 'csv', 'base'], answer: 'Para cargar una base abre “Bases de datos”, indica nombre y periodo, selecciona el CSV original y configura el nivel mínimo de confianza. El sistema valida el archivo antes de iniciar.' },
  { terms: ['umbral', 'confianza', '0.95', '0,95'], answer: 'El nivel mínimo de confianza determina qué casos puede cerrar el clasificador automático. 0,95 prioriza precisión; 0,90 aumenta cobertura y debe validarse con el periodo correspondiente.' },
  { terms: ['exportar', 'descargar', 'resultado'], answer: 'En “Bases de datos” localiza la versión procesada y usa “Exportar”. Los casos pendientes conservan vacío el código final para no confundirlos con resultados validados.' },
  { terms: ['revision', 'revisión', 'codificar', 'confirmar'], answer: 'En “Codificación y revisión” selecciona una base, abre un registro, compara candidatos, antecedentes e IA y confirma un código oficial. Si ninguno corresponde, busca en todo el catálogo CIIU.' },
  { terms: ['asistente', 'ia', 'qwen'], answer: 'El asistente de IA apoya casos difíciles, pero no reemplaza la decisión humana ni puede inventar códigos fuera de las propuestas recibidas durante la clasificación automática.' },
];

export function normalizeQuestion(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function detectAssistantIntent(question, { compareDatasetId, caseExternalId } = {}) {
  const text = normalizeQuestion(question);
  if (/observacion|registro|caso|otros anos|histor|parecid|similar/.test(text)) return 'similar_cases';
  if (/compar|diferencia|cambio|variacion|versus| vs /.test(` ${text} `)) return 'compare_datasets';
  if (/codificador|persona|sesgo|calidad|error|correccion|desacuerdo/.test(text)) return 'quality_control';
  if (/resum|estadistic|cuantos|cantidad|porcentaje|frecuen|distribucion|pendiente|top/.test(text)) return 'dataset_summary';
  return 'help';
}

export function helpAnswer(question) {
  const text = normalizeQuestion(question);
  let best = null;
  for (const topic of HELP_TOPICS) {
    const score = topic.terms.filter(term => text.includes(normalizeQuestion(term))).length;
    if (!best || score > best.score) best = { score, answer: topic.answer };
  }
  return best?.score ? best.answer : 'Puedo ayudarte a cargar bases, interpretar el nivel de confianza, revisar códigos, exportar resultados y consultar estadísticas de una base. Indica qué tarea deseas realizar.';
}

export function compareCodeRows(leftRows, rightRows, limit = 10) {
  const left = new Map(leftRows.map(row => [row.code, row]));
  const right = new Map(rightRows.map(row => [row.code, row]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .map(code => {
      const a = left.get(code) || { count: 0, share: 0, description: right.get(code)?.description || '' };
      const b = right.get(code) || { count: 0, share: 0, description: a.description || '' };
      return { code, description: a.description || b.description, leftCount: a.count, rightCount: b.count, leftShare: a.share, rightShare: b.share, change: b.share - a.share };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.rightCount - a.rightCount)
    .slice(0, limit);
}
