function detectDelimiter(text) {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
  return (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
}

function parseMatrix(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function numberOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function parseR2Csv(text) {
  const matrix = parseMatrix(text);
  if (matrix.length < 2) return { rows: [], errors: ['El archivo no contiene registros.'] };
  const headers = matrix[0].map(value => value.trim().toLowerCase());
  const required = ['id_registro', 'p309', 'candidatos'];
  const missing = required.filter(name => !headers.includes(name));
  if (missing.length) return { rows: [], errors: [`Faltan columnas obligatorias: ${missing.join(', ')}.`] };

  const parsedRows = [];
  const errors = [];
  const seen = new Set();
  matrix.slice(1).forEach((values, offset) => {
    const line = offset + 2;
    const record = Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]));
    if (!record.id_registro || !record.p309) { errors.push(`Fila ${line}: id_registro y p309 son obligatorios.`); return; }
    if (seen.has(record.id_registro)) { errors.push(`Fila ${line}: id_registro duplicado dentro del archivo.`); return; }
    seen.add(record.id_registro);
    let candidates;
    try { candidates = JSON.parse(record.candidatos); }
    catch { errors.push(`Fila ${line}: candidatos no contiene un JSON válido.`); return; }
    if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 5) { errors.push(`Fila ${line}: candidatos debe contener entre 1 y 5 elementos.`); return; }
    const normalized = candidates.map((item, index) => ({
      codigo: String(item.codigo || ''),
      descripcion: String(item.descripcion || ''),
      prob: numberOrNull(item.prob),
      rank: Number.isInteger(item.rank) ? item.rank : index + 1,
    }));
    if (normalized.some(item => !/^\d{4}$/.test(item.codigo))) { errors.push(`Fila ${line}: cada código candidato debe tener 4 dígitos.`); return; }
    if (normalized.some(item => Number.isNaN(item.prob) || (item.prob !== null && (item.prob < 0 || item.prob > 1)))) { errors.push(`Fila ${line}: las probabilidades deben estar entre 0 y 1.`); return; }
    const confidence = numberOrNull(record.confianza_ml);
    if (Number.isNaN(confidence) || (confidence !== null && (confidence < 0 || confidence > 1))) { errors.push(`Fila ${line}: confianza_ml debe estar entre 0 y 1.`); return; }
    parsedRows.push({
      id_registro: record.id_registro,
      p309: record.p309,
      p308: record.p308 || '',
      p308a: record.p308a || '',
      candidatos: normalized,
      confianza_ml: confidence ?? normalized[0]?.prob ?? 0,
      estado: 'pendiente',
      codigo_final: null,
      qwen: null,
    });
  });
  return { rows: parsedRows, errors };
}

export function parseRawEpenCsv(text, { maxRows = 50_000 } = {}) {
  const matrix = parseMatrix(text);
  if (matrix.length < 2) return { rows: [], errors: ['El archivo no contiene registros.'] };
  const headers = matrix[0].map(value => value.trim().toLowerCase());
  const missing = ['id_registro', 'p309'].filter(name => !headers.includes(name));
  if (missing.length) return { rows: [], errors: [`Faltan columnas obligatorias: ${missing.join(', ')}.`] };
  if (matrix.length - 1 > maxRows) return { rows: [], errors: [`El archivo supera el máximo de ${maxRows} registros por trabajo.`] };
  const rows = [];
  const errors = [];
  const seen = new Set();
  matrix.slice(1).forEach((values, offset) => {
    const line = offset + 2;
    const record = Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]));
    if (!record.id_registro || !record.p309) { errors.push(`Fila ${line}: id_registro y p309 son obligatorios.`); return; }
    if (record.id_registro.length > 120) { errors.push(`Fila ${line}: id_registro supera 120 caracteres.`); return; }
    if (seen.has(record.id_registro)) { errors.push(`Fila ${line}: id_registro duplicado.`); return; }
    seen.add(record.id_registro);
    rows.push({ id_registro: record.id_registro, p309: record.p309, p308: record.p308 || '', p308a: record.p308a || '' });
  });
  return { rows, errors };
}
