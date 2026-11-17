import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeWorkspaceIndicators } from '../src/workspace-indicators.js';

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
