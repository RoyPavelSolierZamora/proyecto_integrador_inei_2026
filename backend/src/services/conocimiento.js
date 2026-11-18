import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeQuestion } from './insights.js';
import { notesFor } from './ciiu-notas.js';

// Índice de fragmentos oficiales (INEI/EPEN). Lo genera backend/scripts/indexar-documentos.py en
// .runtime/conocimiento/. Si no existe, el chat usa solo las notas CIIU ya incluidas en el repositorio.
const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = join(HERE, '..', '..', '..', '.runtime', 'conocimiento', 'fragmentos.json');
const STOPWORDS = new Set(('a al con de del el en es esta este estos esas eso la las lo los para por que se su sus un una uno unos y o u como ' +
  'cual cuales donde cuando sobre entre sin mas muy ser son hay ya le les me te nos cual que').split(' '));
// Palabras propias del tema. Una pregunta sin ninguna de ellas (ni un código CIIU) queda fuera de alcance,
// aunque comparta palabras comunes con los documentos.
const DOMAIN_TERMS = new Set(('ciiu rev clase clases grupo grupos division divisiones actividad actividades economica economicas ' +
  'codigo codigos codificar codificacion clasificacion clasificar ocupacion ocupaciones ocupacional inei epen cno notas ' +
  'base bases sistema asistente tabla catalogo listado sector cultivo cultivos').split(' '));
const K1 = 1.4;
const B = 0.75;

// Nombres populares que aparecen en la pregunta pero no en los documentos oficiales.
const SYNONYMS = new Map([['palta', ['aguacate', 'aguacates', 'cultivo']]]);

function tokens(text) {
  return normalizeQuestion(text).split(' ')
    .flatMap(word => [word, ...(SYNONYMS.get(word) || [])])
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
}

function loadFragments() {
  if (existsSync(INDEX_PATH)) {
    return JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  }
  return [];
}

const fragments = loadFragments().map(item => ({ ...item, terms: tokens(item.texto) }));
const docCount = fragments.length;
const avgLength = fragments.reduce((sum, item) => sum + item.terms.length, 0) / Math.max(1, docCount);
const docFrequency = new Map();
for (const item of fragments) {
  for (const term of new Set(item.terms)) docFrequency.set(term, (docFrequency.get(term) || 0) + 1);
}

export function indexStatus() {
  return { fragments: docCount, indexed: docCount > 0 };
}

// Búsqueda BM25 sobre los fragmentos. Un código mencionado en la pregunta da una ventaja extra.
export function searchKnowledge(question, { limit = 4, minScore = 2.5, codes = [] } = {}) {
  const query = [...new Set(tokens(question))];
  if (!query.length || !docCount) return [];
  const anchored = codes.length > 0 || query.some(term => DOMAIN_TERMS.has(term));
  if (!anchored) return [];
  // Sin código, la pregunta debe traer una palabra de contenido propia (no solo de dominio como "base" o "codigo").
  // Una palabra de contenido debe ser específica: las demasiado frecuentes en los documentos ("datos") no cuentan.
  const rareLimit = Math.max(3, Math.floor(docCount * 0.03));
  const contentTerms = query.filter(term => !DOMAIN_TERMS.has(term) && (docFrequency.get(term) || 0) <= rareLimit);
  const requireContent = codes.length === 0;
  if (requireContent && contentTerms.length === 0) return [];
  const scored = [];
  for (const item of fragments) {
    if (requireContent && !contentTerms.some(term => item.terms.includes(term))) continue;
    let score = 0;
    const length = item.terms.length || 1;
    for (const term of query) {
      const tf = item.terms.filter(word => word === term).length;
      if (!tf) continue;
      const df = docFrequency.get(term) || 1;
      const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (length / avgLength))));
    }
    if (item.codigo && codes.includes(String(item.codigo))) score += 3;
    if (score >= minScore) scored.push({ fuente: item.fuente, codigo: item.codigo, texto: item.texto, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Texto para el chat: notas CIIU de los códigos mencionados y los fragmentos más relevantes.
export function knowledgeContext(question, codes = []) {
  const parts = [];
  for (const code of codes) {
    const note = notesFor('clases', code);
    if (note) parts.push(`CIIU ${note.codigo} · ${note.nombre}\nNotas oficiales: ${note.notas.slice(0, 900)}`);
  }
  for (const item of searchKnowledge(question, { codes })) {
    parts.push(`[${item.fuente}${item.codigo ? ` · ${item.codigo}` : ''}]\n${item.texto.slice(0, 900)}`);
  }
  return parts.join('\n\n');
}
