import assert from 'node:assert/strict';
import test from 'node:test';
import { validateR2Response } from '../src/clients/r2-client.js';

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

test('conserva solo antecedentes válidos pertenecientes al Top-K', () => {
  const response = validateR2Response({
    contract_version: '1.0', model_version: 'r2-prueba-2',
    results: [{
      id_registro: 'A-1', confianza_ml: 0.69,
      candidatos: [{ codigo: '5610', descripcion: 'Restaurantes', prob: 0.69, rank: 1 }],
      calidad_entrada: { nivel: 'media', motivos: ['sin_contexto_p308'] },
      reglas_estructurales: ['c310_trabajador_hogar_sugiere_9700'],
      casos_similares: [
        { codigo: '5610', p309: 'Venta de almuerzos', similitud: 0.91 },
        { codigo: '6201', p309: 'Programación', similitud: 0.85 },
      ],
    }],
  }, ['A-1']);
  assert.equal(response.results[0].evidencia_r2.casos_similares.length, 1);
  assert.equal(response.results[0].evidencia_r2.casos_similares[0].codigo, '5610');
  assert.deepEqual(response.results[0].evidencia_r2.reglas_estructurales, ['c310_trabajador_hogar_sugiere_9700']);
});

