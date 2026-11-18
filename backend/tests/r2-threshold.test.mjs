import assert from 'node:assert/strict';
import test from 'node:test';
import { planR2Simulation } from '../src/routes/data-routes.js';

const rows = [
  { id: 1, confianza_ml: 0.74, candidates: [{ codigo: '5610' }] },
  { id: 2, confianza_ml: 0.46, candidates: [{ codigo: '4922' }] },
  { id: 3, confianza_ml: 0.70, candidates: [{ codigo: '4100' }] },
];

test('el umbral R2 incluye la igualdad y separa pendientes', () => {
  const plan = planR2Simulation(rows, 0.70);
  assert.deepEqual(plan.automatic, [{ id: 1, code: '5610' }, { id: 3, code: '4100' }]);
  assert.deepEqual(plan.pending, [2]);
});

test('rechaza un umbral fuera del intervalo de probabilidad', () => {
  assert.throws(() => planR2Simulation(rows, 1.01), /entre 0 y 1/);
});
