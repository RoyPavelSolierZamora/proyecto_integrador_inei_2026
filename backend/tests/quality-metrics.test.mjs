import assert from 'node:assert/strict';
import test from 'node:test';
import { confidenceBand, summarizeVerdicts, verdictFor, wilsonInterval } from '../src/services/quality-metrics.js';

test('las bandas de confianza usan los mismos límites que el análisis de septiembre', () => {
  assert.equal(confidenceBand(0.99), '>=0.99');
  assert.equal(confidenceBand(0.989), '0.97-0.99');
  assert.equal(confidenceBand(0.97), '0.97-0.99');
  assert.equal(confidenceBand(0.95), '0.95-0.97');
  assert.equal(confidenceBand(0.9499), '<0.95');
  assert.equal(confidenceBand(null), 'sin_puntaje');
});

test('el veredicto compara el código ciego con la decisión registrada', () => {
  assert.equal(verdictFor('5630', '5630'), 'correct');
  assert.equal(verdictFor('5630', '5610'), 'incorrect');
  assert.equal(verdictFor('5630', 'no_clasificable'), 'uncertain');
  assert.throws(() => verdictFor('5630', 'abc'));
});

test('el intervalo de Wilson coincide con valores de referencia y nunca sale de [0, 1]', () => {
  assert.equal(wilsonInterval(0, 0), null);
  const half = wilsonInterval(50, 100);
  assert.ok(Math.abs(half.low - 0.4038) < 0.001);
  assert.ok(Math.abs(half.high - 0.5962) < 0.001);
  const none = wilsonInterval(0, 10);
  assert.equal(none.low, 0);
  assert.ok(Math.abs(none.high - 0.2775) < 0.001);
  const all = wilsonInterval(10, 10);
  assert.equal(all.high, 1);
  assert.ok(all.low > 0.6);
});

test('el resumen calcula la precisión solo sobre casos verificados', () => {
  const summary = summarizeVerdicts(['correct', 'correct', 'incorrect', 'uncertain']);
  assert.equal(summary.reviewed, 4);
  assert.equal(summary.verified, 3);
  assert.ok(Math.abs(summary.accuracy - 2 / 3) < 1e-9);
  assert.ok(summary.interval.low < summary.accuracy && summary.accuracy < summary.interval.high);
  assert.equal(summarizeVerdicts([]).accuracy, null);
});
