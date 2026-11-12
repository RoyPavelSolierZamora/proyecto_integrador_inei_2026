import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_R2_THRESHOLD, R2_THRESHOLD_GUIDANCE } from '../src/config/r2.js';

test('el umbral recomendado inicia en 0,95 y conserva la alternativa 0,90', () => {
  assert.equal(DEFAULT_R2_THRESHOLD, '0.95');
  assert.match(R2_THRESHOLD_GUIDANCE, /0,95/);
  assert.match(R2_THRESHOLD_GUIDANCE, /0,90/);
});
