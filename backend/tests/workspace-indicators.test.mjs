import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeWorkspaceIndicators } from '../src/services/workspace-indicators.js';

const candidate = (codigo, rank) => ({ codigo, rank });

test('evalúa pares por modelo y promedia F1 sobre códigos reales y predichos', () => {
  const indicators = summarizeWorkspaceIndicators([
    { candidates: [candidate('2222', 2), candidate('1111', 1)], human_code: '1111', r3_code: '2222' },
    { candidates: [candidate('1111')], human_code: '1111', r3_code: '1111' },
    { candidates: [candidate('3333')], human_code: '2222' },
    { candidates: [candidate('2222')], ml_decision: true, ml_automatic: true },
    { ml_decision: true }, // R2 procesó y derivó el registro sin producir candidatos.
    { human_code: '1111' },
  ], { r2_threshold: '0.90000', r3_queries: '4', r3_resolved: '1' });

  assert.deepEqual(indicators, {
    global: { evaluated: 2, accuracy: .5, macroF1: 1 / 3, total: 6, withReference: 4, withoutReference: 2, withoutPrediction: 2, coverage: .5 },
    r2: { evaluated: 3, accuracy: 2 / 3, macroF1: 1 / 3, automaticApproval: 1 / 5, threshold: .9 },
    r3: { evaluated: 2, accuracy: .5, macroF1: 1 / 3, automaticApproval: .25 },
  });
});

test('distingue cero cierres de denominadores ausentes', () => {
  const empty = summarizeWorkspaceIndicators([]);
  assert.equal(empty.r2.automaticApproval, null);
  assert.equal(empty.r3.automaticApproval, null);
  assert.equal(empty.r2.evaluated, 0);
  assert.equal(empty.r2.accuracy, null);
  assert.equal(empty.r3.macroF1, null);

  const manual = summarizeWorkspaceIndicators([{ candidates: [candidate('0123')], human_code: '0123', r3_code: '0123' }]);
  assert.equal(manual.r2.automaticApproval, 0);
  assert.equal(manual.r3.automaticApproval, null);
  assert.equal(manual.r3.accuracy, 1);
  assert.equal(summarizeWorkspaceIndicators([], { r3_queries: '2', r3_resolved: '0' }).r3.automaticApproval, 0);
});


test('el global evalúa una predicción por registro según su ruta, sin promediar métricas ni usar decisiones humanas como predicción', () => {
  const result = summarizeWorkspaceIndicators([
    { human_code: '1111', candidates: [candidate('9999')], ml_automatic: true, ml_code: '1111', r3_code: '9999' },
    { human_code: '1111', candidates: [candidate('9999')], r3_code: '1111' },
    { human_code: '2222', candidates: [candidate('2222')], r3_code: '1111' },
    { human_code: '2222', candidates: [candidate('2222')] },
    { candidates: [candidate('1111')], ml_automatic: true },
  ]);
  assert.deepEqual(result.global, {
    evaluated: 3, accuracy: 2 / 3, macroF1: .4,
    total: 5, withReference: 4, withoutReference: 1, withoutPrediction: 1, coverage: .75,
  });
  assert.notEqual(result.global.accuracy, (result.r2.accuracy + result.r3.accuracy) / 2);
});

test('el global sin predicciones o referencia no presenta ceros como exactitud o F1', () => {
  assert.deepEqual(summarizeWorkspaceIndicators([]).global, {
    evaluated: 0, accuracy: null, macroF1: null, total: 0,
    withReference: 0, withoutReference: 0, withoutPrediction: 0, coverage: null,
  });
  const global = summarizeWorkspaceIndicators([{ human_code: '1111', candidates: [candidate('1111')] }]).global;
  assert.equal(global.evaluated, 0);
  assert.equal(global.withoutPrediction, 1);
  assert.equal(global.accuracy, null);
  assert.equal(global.macroF1, null);
});
