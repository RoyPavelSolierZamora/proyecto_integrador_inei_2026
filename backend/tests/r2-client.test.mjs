import assert from 'node:assert/strict';
import test from 'node:test';
import { validateR2Response } from '../src/r2-client.js';

test('valida el contrato de respuesta R2 v1.0', () => {
  const response = validateR2Response({
    contract_version: '1.0', model_version: 'r2-prueba-1',
    results: [{ id_registro: 'A-1', confianza_ml: 0.81, candidatos: [{ codigo: '5610', descripcion: 'Restaurantes', prob: 0.81, rank: 1 }] }],
  }, ['A-1']);
  assert.equal(response.modelVersion, 'r2-prueba-1');
  assert.equal(response.results[0].candidatos[0].codigo, '5610');
});

test('permite que R2 derive un caso sin candidatos a revisión manual', () => {
  const response = validateR2Response({
    contract_version: '1.0', model_version: 'r2-prueba-1',
    results: [{ id_registro: 'A-1', revision_manual: true, motivo: 'Texto insuficiente' }],
  }, ['A-1']);
  assert.equal(response.results[0].revision_manual, true);
});

test('rechaza códigos inventados o registros omitidos por R2', () => {
  assert.throws(() => validateR2Response({
    contract_version: '1.0', results: [{ id_registro: 'A-1', confianza_ml: 0.9, candidatos: [{ codigo: 'ABC', prob: 0.9 }] }],
  }, ['A-1']), /candidato inválido/);
  assert.throws(() => validateR2Response({ contract_version: '1.0', results: [] }, ['A-1']), /todos los registros/);
});

