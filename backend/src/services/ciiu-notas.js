import { readFileSync } from 'node:fs';

// Notas explicativas oficiales CIIU Rev.4 (INEI), una entrada por clase de cuatro dígitos.
// Se generan con backend/scripts/extraer-notas-ciiu.py a partir del PDF oficial.
const NOTES = JSON.parse(readFileSync(new URL('../data/notas-ciiu-clases.json', import.meta.url), 'utf8'));
const byCode = new Map(NOTES.map(item => [item.codigo, item]));

export function notesFor(code) {
  return byCode.get(String(code)) || null;
}

// Contexto oficial para el chat: nombre del catálogo y notas de cada clase mencionada.
// Solo incluye códigos que existan en el catálogo activo, para no mezclar códigos inventados.
export function ciiuContext(catalogRows, maxNoteChars = 900) {
  return catalogRows.map(row => {
    const notes = notesFor(row.code);
    const body = notes?.notas ? notes.notas.slice(0, maxNoteChars) : 'Sin notas explicativas disponibles.';
    return `CIIU ${row.code} · ${row.description}\nNotas oficiales: ${body}`;
  }).join('\n\n');
}
