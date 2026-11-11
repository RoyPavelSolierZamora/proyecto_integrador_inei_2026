import assert from 'node:assert/strict';
import test from 'node:test';
import { qwenResolutionPolicy } from '../src/qwen-client.js';

const candidates = [{ codigo: '4922' }, { codigo: '4921' }, { codigo: '4930' }];

test('Qwen automático resuelve cuando selecciona el candidato Top-1 de R2', () => {
  assert.deepEqual(qwenResolutionPolicy(candidates, { review: false, code: '4922' }), {
    status: 'resolved', finalCode: '4922', reason: 'El asistente de IA confirmó la primera propuesta del clasificador.',
  });
});

test('Top-2 y Top-3 quedan en revisión hasta contar con una compuerta calibrada', () => {
  for (const code of ['4921', '4930']) {
    const policy = qwenResolutionPolicy(candidates, { review: false, code });
    assert.equal(policy.status, 'review');
    assert.equal(policy.finalCode, null);
    assert.match(policy.reason, /no permite automatizar/);
  }
});

test('un código fuera de los candidatos pasa a revisión humana', () => {
  const policy = qwenResolutionPolicy(candidates, { review: false, code: '9999' });
  assert.equal(policy.status, 'review');
  assert.equal(policy.finalCode, null);
  assert.match(policy.reason, /no pertenece/);
});

test('respeta la derivación explícita solicitada por Qwen', () => {
  assert.equal(qwenResolutionPolicy(candidates, { review: true, code: null }).status, 'review');
});

