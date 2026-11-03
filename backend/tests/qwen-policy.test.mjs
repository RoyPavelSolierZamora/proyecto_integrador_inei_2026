import assert from 'node:assert/strict';
import test from 'node:test';
import { qwenResolutionPolicy } from '../src/qwen-client.js';

const candidates = [{ codigo: '4922' }, { codigo: '4921' }];

test('Qwen automático resuelve solo si confirma el candidato principal de R2', () => {
  assert.deepEqual(qwenResolutionPolicy(candidates, { review: false, code: '4922' }), {
    status: 'resolved', finalCode: '4922', reason: 'Qwen confirmó el candidato principal de R2.',
  });
});

test('una discrepancia entre Qwen y R2 pasa a revisión humana', () => {
  const policy = qwenResolutionPolicy(candidates, { review: false, code: '4921' });
  assert.equal(policy.status, 'review');
  assert.match(policy.reason, /no coincidió/);
});

test('respeta la derivación explícita solicitada por Qwen', () => {
  assert.equal(qwenResolutionPolicy(candidates, { review: true, code: null }).status, 'review');
});

