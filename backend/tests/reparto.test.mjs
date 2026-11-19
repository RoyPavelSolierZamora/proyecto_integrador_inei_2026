import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocatePlan, suggestByAccuracy, validatePlan } from '../src/services/reparto.js';

function pool(total, prefijo = 'R') {
  return Array.from({ length: total }, (_, i) => ({ id: i + 1, externalId: `${prefijo}${String(i + 1).padStart(5, '0')}` }));
}

test('dos lotes con 50 % y resto reparten la fuente sin repetir casos', () => {
  const items = [
    { datasetId: 1, fuente: 'ml', asignadoId: 11, porcentaje: 50 },
    { datasetId: 1, fuente: 'ml', asignadoId: 12, porcentaje: null },
  ];
  const { assigned, leftovers } = allocatePlan(items, new Map([['1|ml', pool(101)]]));
  const a = assigned.get(0);
  const b = assigned.get(1);
  assert.equal(a.length + b.length, 101);
  assert.equal(leftovers.get('1|ml').length, 0);
  const ids = [...a, ...b].map(c => c.id);
  assert.equal(new Set(ids).size, 101);
});

test('porcentajes sin resto dejan casos sin asignar y la validación lo avisa', () => {
  const items = [{ datasetId: 1, fuente: 'review', asignadoId: 11, porcentaje: 30 }];
  const pools = new Map([['1|review', pool(100)]]);
  const { assigned, leftovers } = allocatePlan(items, pools);
  assert.equal(assigned.get(0).length, 30);
  assert.equal(leftovers.get('1|review').length, 70);
  const { errors, warnings } = validatePlan(items, new Map([['1|review', 100]]));
  assert.deepEqual(errors, []);
  assert.match(warnings[0], /quedarán 70 casos sin asignar/);
});

test('las fuentes no se mezclan: cada grupo usa solo sus casos', () => {
  const items = [
    { datasetId: 1, fuente: 'ml', asignadoId: 11, porcentaje: null },
    { datasetId: 1, fuente: 'llm', asignadoId: 12, porcentaje: null },
    { datasetId: 1, fuente: 'review', asignadoId: 13, porcentaje: null },
  ];
  const pools = new Map([
    ['1|ml', pool(10, 'M')],
    ['1|llm', pool(5, 'L')],
    ['1|review', pool(4, 'V')],
  ]);
  const { assigned } = allocatePlan(items, pools);
  assert.equal(assigned.get(0).length, 10);
  assert.equal(assigned.get(1).length, 5);
  assert.equal(assigned.get(2).length, 4);
  assert.ok(assigned.get(0).every(c => c.externalId.startsWith('M')));
});

test('la validación rechaza sumas mayores que 100 y dos restos en el mismo grupo', () => {
  const counts = new Map([['1|ml', 100]]);
  const suma = validatePlan([
    { datasetId: 1, fuente: 'ml', asignadoId: 11, porcentaje: 70 },
    { datasetId: 1, fuente: 'ml', asignadoId: 12, porcentaje: 40 },
  ], counts);
  assert.match(suma.errors[0], /no pueden pasar de 100/);
  const dos = validatePlan([
    { datasetId: 1, fuente: 'ml', asignadoId: 11, porcentaje: null },
    { datasetId: 1, fuente: 'ml', asignadoId: 12, porcentaje: null },
  ], counts);
  assert.match(dos.errors[0], /solo puede haber un lote con «resto»/);
});

test('«todas las fuentes» no puede combinarse con otras fuentes de la misma base', () => {
  const { errors } = validatePlan([
    { datasetId: 1, fuente: 'todas', asignadoId: 11, porcentaje: 50 },
    { datasetId: 1, fuente: 'ml', asignadoId: 12, porcentaje: null },
  ], new Map([['1|todas', 100], ['1|ml', 40]]));
  assert.match(errors[0], /no puede combinarse/);
});

test('un grupo sin casos disponibles es un error', () => {
  const { errors } = validatePlan([{ datasetId: 1, fuente: 'llm', asignadoId: 11, porcentaje: null }], new Map());
  assert.match(errors[0], /No hay casos pendientes/);
});

test('la sugerencia por precisión da menos a quien acierta menos y suma 100', () => {
  const sugerido = suggestByAccuracy([
    { id: 11, accuracy: 0.95 },
    { id: 12, accuracy: 0.80 },
    { id: 13, accuracy: 0.60 },
  ]);
  const suma = sugerido.reduce((acc, item) => acc + item.percent, 0);
  assert.ok(Math.abs(suma - 100) < 0.01, `suma ${suma}`);
  assert.ok(sugerido[0].percent > sugerido[1].percent && sugerido[1].percent > sugerido[2].percent);
});

test('sin datos de precisión la sugerencia reparte por igual', () => {
  const sugerido = suggestByAccuracy([{ id: 11, accuracy: null }, { id: 12, accuracy: null }]);
  assert.deepEqual(sugerido.map(item => item.percent), [50, 50]);
});

test('una línea sin codificador es válida: la parte queda pendiente de asignar', () => {
  const { errors } = validatePlan([
    { datasetId: 1, fuente: 'review', asignadoId: null, porcentaje: 50 },
    { datasetId: 1, fuente: 'review', asignadoId: null, porcentaje: null },
  ], new Map([['1|review', 100]]));
  assert.deepEqual(errors, []);
});

test('un codificador inválido sí es un error', () => {
  const { errors } = validatePlan([
    { datasetId: 1, fuente: 'review', asignadoId: -3, porcentaje: null },
  ], new Map([['1|review', 100]]));
  assert.match(errors[0], /codificador no válido/);
});
