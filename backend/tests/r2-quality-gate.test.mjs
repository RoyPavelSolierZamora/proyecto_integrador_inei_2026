import assert from 'node:assert/strict';
import test from 'node:test';
import { requiresDirectHumanReview } from '../src/r2-jobs.js';

test('la barrera de calidad evita enviar entradas vacías o sin sentido a Qwen', () => {
  for (const reason of ['p309_vacio', 'respuesta_no_informativa', 'texto_sin_sentido']) {
    assert.equal(requiresDirectHumanReview({
      revision_manual: false,
      evidencia_r2: { calidad_entrada: { nivel: 'baja', motivos: [reason] } },
    }), true);
  }
});

test('respeta la derivación manual explícita de R2', () => {
  assert.equal(requiresDirectHumanReview({ revision_manual: true }), true);
});

test('permite pasar a Qwen una respuesta clasificable de calidad media o alta', () => {
  assert.equal(requiresDirectHumanReview({
    revision_manual: false,
    evidencia_r2: { calidad_entrada: { nivel: 'media', motivos: ['sin_contexto_p308'] } },
  }), false);
  assert.equal(requiresDirectHumanReview({
    revision_manual: false,
    evidencia_r2: { calidad_entrada: { nivel: 'alta', motivos: [] } },
  }), false);
});
