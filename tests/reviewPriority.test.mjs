import assert from 'node:assert/strict';
import test from 'node:test';
import { confidencePercent, reviewPriority } from '../frontend/src/shared/lib/reviewPriority.js';

test('prioriza todos los límites, incluido el cero y el cien por ciento', () => {
  for (const [score, key] of [[0, 'urgente'], [.2, 'urgente'], [.21, 'prioritaria'], [.4, 'prioritaria'], [.41, 'detallada'], [.6, 'detallada'], [.61, 'regular'], [.8, 'regular'], [.81, 'final'], [1, 'final']]) {
    assert.equal(reviewPriority(score).key, key, `puntaje ${score}`);
  }
});

test('las prioridades coinciden con el porcentaje mostrado sin huecos entre rangos', () => {
  for (const [score, displayed, key] of [[.204, 20, 'urgente'], [.206, 21, 'prioritaria'], [.404, 40, 'prioritaria'], [.406, 41, 'detallada'], [.604, 60, 'detallada'], [.606, 61, 'regular'], [.804, 80, 'regular'], [.806, 81, 'final']]) {
    assert.equal(confidencePercent(score), displayed);
    assert.equal(reviewPriority(score).key, key);
  }
});

test('distingue confianza ausente o inválida de un cero válido', () => {
  for (const score of [null, undefined, NaN, Infinity, -.01, 1.01, '', '0']) {
    assert.equal(confidencePercent(score), null);
    assert.equal(reviewPriority(score).key, 'sin_confianza');
  }
  assert.equal(confidencePercent(0), 0);
});
