function safeCell(value) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  // Evita que Excel interprete respuestas abiertas como fórmulas al abrir el CSV.
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildCsv(headers, rows) {
  const lines = [headers.map(header => safeCell(header.label)).join(',')];
  for (const row of rows) lines.push(headers.map(header => safeCell(row[header.key])).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export const RESULT_HEADERS = [
  { key: 'id_registro', label: 'id_registro' },
  { key: 'p309', label: 'p309' },
  { key: 'p308', label: 'p308' },
  { key: 'p308a', label: 'p308a' },
  { key: 'codigo_ciiu_final', label: 'codigo_ciiu_final' },
  { key: 'descripcion_ciiu', label: 'descripcion_ciiu' },
  { key: 'estado', label: 'estado' },
  { key: 'origen_decision', label: 'origen_decision' },
  { key: 'decision', label: 'decision' },
  { key: 'confianza_r2', label: 'confianza_r2' },
  { key: 'candidatos_r2', label: 'candidatos_r2' },
  { key: 'modelo', label: 'modelo' },
  { key: 'justificacion', label: 'justificacion' },
  { key: 'actualizado_en', label: 'actualizado_en' },
];
