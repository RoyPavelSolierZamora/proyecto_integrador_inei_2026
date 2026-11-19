// Genera frontend/src/demo/fixtures.json para la demostración en GitHub Pages.
// Usa solo datos sintéticos del repositorio (backend/seeds) y el catálogo CIIU oficial
// (motores/r3/datos/catalogo_ciiu.csv). No lee bases de la instalación local.
//
//   node scripts/generar-demo.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salida = join(raiz, 'frontend', 'src', 'demo', 'fixtures.json');

// CSV con comillas dobles (RFC 4180 básico), sin depender de librerías.
function leerCsv(texto) {
  const limpio = texto.replace(/^﻿/, '');
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i += 1) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i += 1; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i += 1;
      if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const [cabecera, ...cuerpo] = filas;
  return cuerpo.map(valores => Object.fromEntries(cabecera.map((k, i) => [k, valores[i] ?? ''])));
}

const catalogo = leerCsv(readFileSync(join(raiz, 'motores', 'r3', 'datos', 'catalogo_ciiu.csv'), 'utf8'))
  .map(r => ({ codigo: r.codigo, descripcion: r.descripcion }));

const semilla = JSON.parse(readFileSync(join(raiz, 'backend', 'seeds', 'epen-synthetic-2026.json'), 'utf8'));
const sintetica2027 = leerCsv(readFileSync(join(raiz, 'backend', 'seeds', 'epen-2027-t1-sintetica-r2.csv'), 'utf8'));

const sinOrigen = { origen_decision: 'pendiente', responsable_decision: null, tipo_decision: null, modelo_decision: null, justificacion_decision: null };

// Forma de un caso igual a la que devuelve mapCase() en backend/src/routes/data-routes.js.
function caso(datasetId, registro, indice, candidatos, base) {
  const top = candidatos[0]?.codigo || null;
  // Estados variados para que la demo muestre cada tipo de fila.
  const variante = indice % 4;
  const estado = variante === 0 ? 'confirmado' : variante === 1 ? 'revision' : 'pendiente';
  const origen = variante === 2 ? 'qwen' : 'r2';
  return {
    id: datasetId * 1000 + indice + 1,
    dataset_id: datasetId,
    id_registro: registro.id_registro,
    p309: registro.p309 || '',
    p308: registro.p308 || '',
    p308a: registro.p308a || '',
    c309_1: '', c310: '', c311: '', c366: '',
    candidatos,
    confianza_ml: base.confianza_ml == null || base.confianza_ml === '' ? null : Number(base.confianza_ml),
    evidencia_r2: null,
    estado,
    codigo_final: estado === 'confirmado' ? top : null,
    qwen: origen === 'qwen' && estado === 'pendiente'
      ? { decision: 'seleccionar', codigo: top, justificacion: 'Selección sugerida por el asistente (datos de demostración).', latencia_s: 1.2 }
      : null,
    origen_decision: estado === 'confirmado' ? 'r2' : origen === 'qwen' ? 'qwen' : 'r2',
    responsable_decision: estado === 'confirmado' ? 'Clasificador automático' : null,
    tipo_decision: estado === 'confirmado' ? 'confirmacion' : null,
    modelo_decision: estado === 'confirmado' ? 'demostración' : null,
    justificacion_decision: null,
    updated_at: '2026-11-18T12:00:00Z',
  };
}

const candidatosDe = fila => {
  try {
    const lista = typeof fila.candidatos === 'string' ? JSON.parse(fila.candidatos || '[]') : (fila.candidatos || []);
    return Array.isArray(lista) ? lista : [];
  } catch { return []; }
};

const casos2026 = semilla.cases.map((c, i) => caso(1, c, i, Array.isArray(c.candidatos) ? c.candidatos : [], c));
const casos2027 = sintetica2027.map((c, i) => caso(2, c, i, candidatosDe(c), c));

const datasets = [
  {
    id: 1,
    code: semilla.dataset.code,
    name: 'EPEN · Datos sintéticos 2026',
    period: semilla.dataset.period,
    version: 1,
    fileName: 'epen-synthetic-2026.json',
    records: casos2026.length,
    importedAt: '2026-11-01T00:00:00Z',
    importedBy: 'Demostración',
    active: false,
    status: 'archived',
    synthetic: true,
    notes: semilla.dataset.notes,
  },
  {
    id: 2,
    code: 'EPEN-SYN-2027T1',
    name: 'EPEN sintético 2027 · T1',
    period: '2027-T1',
    version: 1,
    fileName: 'epen-2027-t1-sintetica-r2.csv',
    records: casos2027.length,
    importedAt: '2026-11-15T00:00:00Z',
    importedBy: 'Demostración',
    active: true,
    status: 'active',
    synthetic: true,
    notes: 'Datos sintéticos de demostración. No representan registros reales del INEI.',
  },
];

mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, `${JSON.stringify({ datasets, cases: [...casos2026, ...casos2027], catalog: catalogo }, null, 2)}\n`, 'utf8');
console.log(`fixtures: ${casos2026.length + casos2027.length} casos, ${catalogo.length} clases CIIU -> ${salida}`);
