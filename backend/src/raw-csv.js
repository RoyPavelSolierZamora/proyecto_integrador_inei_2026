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
    } else field += char;
  }
  if (quoted) throw new Error('El CSV contiene una comilla sin cerrar.');
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

export function parseRawEpenCsv(text, { maxRows = 50_000 } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('El archivo CSV está vacío.');
  const matrix = parseMatrix(text);
  if (matrix.length < 2) throw new Error('El archivo no contiene registros.');
  const headers = matrix[0].map(value => value.trim().toLowerCase());
  const aliases = {
    id_registro: ['id_registro', 'id_c200'], p309: ['p309', 'c309'],
    p308: ['p308', 'c308'], p308a: ['p308a', 'c308a'],
    c310: ['c310'], c311: ['c311'], c366: ['c366'],
  };
  const missing = ['id_registro', 'p309'].filter(name => !aliases[name].some(alias => headers.includes(alias)));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}.`);
  if (matrix.length - 1 > maxRows) throw new Error(`El archivo supera el máximo de ${maxRows} registros por trabajo.`);

  const seen = new Set();
  const records = matrix.slice(1).map((values, offset) => {
    const line = offset + 2;
    const record = Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]));
    const value = name => aliases[name].map(alias => record[alias]).find(item => item !== undefined && item !== '') || '';
    const identifier = value('id_registro');
    if (!identifier) throw new Error(`Fila ${line}: id_registro es obligatorio.`);
    if (identifier.length > 120) throw new Error(`Fila ${line}: id_registro supera 120 caracteres.`);
    if (seen.has(identifier)) throw new Error(`Fila ${line}: id_registro duplicado.`);
    seen.add(identifier);
    const multivariate = Object.fromEntries(['c310', 'c311', 'c366'].map(name => [name, value(name)]));
    for (const [name, content] of Object.entries(multivariate)) {
      if (content.length > 160) throw new Error(`Fila ${line}: ${name.toUpperCase()} supera 160 caracteres.`);
    }
    return {
      id_registro: identifier,
      p309: value('p309'), p308: value('p308'), p308a: value('p308a'),
      ...multivariate,
    };
  });
  return records;
}

