import test from 'node:test';
import assert from 'node:assert/strict';
import { canResolveAutomatically } from '../src/r2-jobs.js';

test('el cierre automático de BETO depende solo del umbral del trabajo', () => {
  assert.equal(canResolveAutomatically('beto-v2-experimental-no-calibrado+abc', 0.95, 0.95), true);
  assert.equal(canResolveAutomatically('beto-v2-experimental-no-calibrado+abc', 0.99, 0.95), true);
  assert.equal(canResolveAutomatically('beto-v2-experimental-no-calibrado+abc', 0.94, 0.95), false);
  assert.equal(canResolveAutomatically('beto-v2-experimental-no-calibrado+abc', 0.5, 0.9), false);
});

test('el umbral τ no es una constante: cada trabajo puede cambiarlo', () => {
  assert.equal(canResolveAutomatically('beto-v2-experimental-no-calibrado+abc', 0.92, 0.90), true);
  assert.equal(canResolveAutomatically('beto-v2-experimental-no-calibrado+abc', 0.92, 0.95), false);
  assert.equal(canResolveAutomatically('r2-tfidf-linearsvc-calibrado-0.5+abc', 0.95, 0.95), true);
  assert.equal(canResolveAutomatically('r2-tfidf-linearsvc-calibrado-0.5+abc', 0.94, 0.95), false);
});
