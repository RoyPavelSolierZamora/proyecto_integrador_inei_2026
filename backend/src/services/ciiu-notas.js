import { readFileSync } from 'node:fs';

// Notas explicativas oficiales CIIU Rev.4 (INEI), generadas con backend/scripts/extraer-notas-ciiu.py.
const NOTES = JSON.parse(readFileSync(new URL('../data/notas-ciiu.json', import.meta.url), 'utf8'));
// El PDF oficial parte algunas palabras con un espacio ("bebida s", "pro ductos"). Para mostrarlas se unen
// solo cuando la palabra completa aparece varias veces en las notas y sus partes casi nunca aparecen solas.
// El archivo oficial no se modifica.
const NOTE_WORDS = new Map();
for (const item of [...NOTES.divisiones, ...NOTES.grupos, ...NOTES.clases]) {
  for (const word of String(item.notas || '').split(' ')) {
    const key = wordKey(word);
    if (key) NOTE_WORDS.set(key, (NOTE_WORDS.get(key) || 0) + 1);
  }
}

const ONE_OFF_FIXES = [['coct elerías', 'coctelerías']];

function wordKey(word) {
  return word.toLowerCase().replace(/[^a-záéíóúñü]/g, '');
}

function shouldJoin(a, b) {
  const ka = wordKey(a);
  const kb = wordKey(b);
  if (!ka || !kb || ka.length > 8 || kb.length > 12) return false;
  const joined = NOTE_WORDS.get(ka + kb) || 0;
  return joined >= 2 && ((NOTE_WORDS.get(ka) || 0) <= 3 || (NOTE_WORDS.get(kb) || 0) <= 2);
}

function repairSplitWords(text) {
  const words = String(text || '').split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    if (i + 1 < words.length && shouldJoin(words[i], words[i + 1])) {
      out.push(words[i] + words[i + 1]);
      i += 1;
    } else {
      out.push(words[i]);
    }
  }
  // Casos que aparecen una sola vez en el PDF y no alcanzan la regla anterior.
  const fixed = out.join(' ');
  return ONE_OFF_FIXES.reduce((text, [from, to]) => text.split(from).join(to), fixed);
}

function withRepairedNotes(item) {
  return { ...item, notas: repairSplitWords(item.notas) };
}

const maps = {
  clases: new Map(NOTES.clases.map(item => [item.codigo, withRepairedNotes(item)])),
  grupos: new Map(NOTES.grupos.map(item => [item.codigo, withRepairedNotes(item)])),
  divisiones: new Map(NOTES.divisiones.map(item => [item.codigo, withRepairedNotes(item)])),
};

export function notesFor(kind, code) {
  return maps[kind]?.get(String(code)) || null;
}

// Texto oficial para el chat: nombre y notas de cada clase del catálogo activo,
// más divisiones y grupos que el usuario mencione. Solo usa texto del PDF oficial.
export function ciiuContext(catalogRows, { divisiones = [], grupos = [] } = {}, maxNoteChars = 900) {
  const parts = catalogRows.map(row => {
    const notes = notesFor('clases', row.code);
    const body = notes?.notas ? notes.notas.slice(0, maxNoteChars) : 'Sin notas explicativas disponibles.';
    return `CIIU ${row.code} · ${row.description}\nNotas oficiales: ${body}`;
  });
  for (const code of divisiones) {
    const item = notesFor('divisiones', code);
    if (item) parts.push(`División ${item.codigo} · ${item.nombre}\nNotas oficiales: ${item.notas.slice(0, maxNoteChars) || 'Sin notas.'}`);
  }
  for (const code of grupos) {
    const item = notesFor('grupos', code);
    if (item) parts.push(`Grupo ${item.codigo} · ${item.nombre}\nNotas oficiales: ${item.notas.slice(0, maxNoteChars) || 'Sin notas.'}`);
  }
  return parts.join('\n\n');
}

// Recorta una nota oficial en una frase completa cuando sea posible.
function shortNote(text, max = 650) {
  if (!text) return '';
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = cut.lastIndexOf('. ');
  return `${end > 200 ? cut.slice(0, end + 1) : cut} …`;
}

// Respuesta directa y verificable para las referencias CIIU de una pregunta: nombre oficial y notas.
export function codeAnswer(catalogRows, { clases = [], grupos = [], divisiones = [] } = {}) {
  const names = new Map(catalogRows.map(row => [row.code, row.description]));
  const blocks = [];
  for (const code of clases) {
    const note = notesFor('clases', code);
    const name = names.get(code) || note?.nombre;
    if (!name) { blocks.push(`No encuentro la clase ${code} en el catálogo CIIU Rev.4 oficial.`); continue; }
    blocks.push(`CIIU ${code} · ${name}${note ? `\n${shortNote(note.notas)}` : ''}`);
  }
  for (const code of grupos) {
    const note = notesFor('grupos', code);
    blocks.push(note ? `Grupo ${code} · ${note.nombre}\n${shortNote(note.notas)}` : `No encuentro el grupo ${code} en las notas oficiales.`);
  }
  for (const code of divisiones) {
    const note = notesFor('divisiones', code);
    blocks.push(note ? `División ${code} · ${note.nombre}\n${shortNote(note.notas)}` : `No encuentro la división ${code} en las notas oficiales.`);
  }
  return blocks.join('\n\n');
}

// Recorta un texto en una frase completa cuando sea posible.
function firstSentences(text, max) {
  const trimmed = String(text || '').trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const end = cut.lastIndexOf('. ');
  return `${end > 120 ? cut.slice(0, end + 1) : cut} …`;
}

// Compara dos o tres clases: qué comprende cada una y qué excluye, según las notas oficiales.
export function compareCodesAnswer(catalogRows, codes) {
  const names = new Map(catalogRows.map(row => [row.code, row.description]));
  const blocks = [];
  for (const code of codes) {
    const note = notesFor('clases', code);
    const name = names.get(code) || note?.nombre;
    if (!name) { blocks.push(`No encuentro la clase ${code} en el catálogo CIIU Rev.4 oficial.`); continue; }
    const [included, ...rest] = String(note?.notas || '').split(/No se incluyen? /i);
    const comprende = firstSentences(included.replace(/^Esta clase comprende /i, ''), 320);
    const excluded = rest.join(' ').trim();
    const lines = [`CIIU ${code} · ${name}`, `Comprende: ${comprende || 'sin notas adicionales.'}`];
    if (excluded) lines.push(`No incluye: ${firstSentences(excluded, 240)}`);
    blocks.push(lines.join('\n'));
  }
  const listed = codes.join(', ').replace(/, ([^,]*)$/, ' y $1');
  return `Comparación de las clases ${listed}.\n\n${blocks.join('\n\n')}\n\nPara decidir, compara la actividad principal de la respuesta con lo que comprende cada clase. Si ninguna encaja, busca la descripción en el catálogo.`;
}
