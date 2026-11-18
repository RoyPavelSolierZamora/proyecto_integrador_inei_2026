import { readFileSync } from 'node:fs';

// Notas explicativas oficiales CIIU Rev.4 (INEI), generadas con backend/scripts/extraer-notas-ciiu.py.
const NOTES = JSON.parse(readFileSync(new URL('../data/notas-ciiu.json', import.meta.url), 'utf8'));
const maps = {
  clases: new Map(NOTES.clases.map(item => [item.codigo, item])),
  grupos: new Map(NOTES.grupos.map(item => [item.codigo, item])),
  divisiones: new Map(NOTES.divisiones.map(item => [item.codigo, item])),
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
