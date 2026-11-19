import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_R2_THRESHOLD, R2_THRESHOLD_GUIDANCE } from '../frontend/src/shared/config/r2.js';

test('el umbral recomendado inicia en 0,92 e informa el efecto de cambiarlo', () => {
  assert.equal(DEFAULT_R2_THRESHOLD, '0.92');
  assert.match(R2_THRESHOLD_GUIDANCE, /0,92/);
  assert.match(R2_THRESHOLD_GUIDANCE, /revisión/);
});
