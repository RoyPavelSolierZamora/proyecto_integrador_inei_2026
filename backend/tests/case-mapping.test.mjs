import assert from 'node:assert/strict';
import test from 'node:test';
import { mapCase, mapR2Evidence } from '../src/data-routes.js';

test('expone antecedentes R2 válidos para la interfaz', () => {
  const evidence = mapR2Evidence({
    calibracion: 'provisional-no-productiva',
    calidad_entrada: { nivel: 'media', motivos: ['sin_contexto_p308'] },
    casos_similares: [
      { codigo: '5610', similitud: 0.91, p309: 'Venta de almuerzos', p308: 'Cocinera' },
      { codigo: 'ABC', similitud: 0.99, p309: 'Código inválido' },
      { codigo: '4922', similitud: 2, p309: 'Similitud inválida' },
    ],
  });
  assert.equal(evidence.casos_similares.length, 1);
  assert.equal(evidence.casos_similares[0].codigo, '5610');
  assert.equal(evidence.calidad_entrada.nivel, 'media');
});

test('incluye la evidencia R2 al mapear un caso operacional', () => {
  const item = mapCase({
    id: 8,
    dataset_id: 3,
    external_id: 'A-1',
    p309: 'Venta de almuerzos',
    p308: 'Cocinera',
    p308a: 'Prepara platos',
    candidates: [{ codigo: '5610', descripcion: 'Restaurantes', prob: 0.69, rank: 1 }],
    confianza_ml: '0.69',
    r2_evidence: { casos_similares: [{ codigo: '5610', similitud: 0.88, p309: 'Restaurante' }] },
    status: 'pending',
    final_code: null,
    updated_at: new Date('2026-01-01T00:00:00Z'),
    llm_decision: null,
    llm_code: null,
    llm_justification: null,
    llm_latency: null,
    human_decision: null,
    latest_source: 'ml',
  });
  assert.equal(item.evidencia_r2.casos_similares[0].codigo, '5610');
  assert.equal(item.confianza_ml, 0.69);
  assert.equal(item.origen_decision, 'r2');
});

test('identifica Qwen como origen de la decisión más reciente', () => {
  const item = mapCase({
    id: 9, dataset_id: 3, external_id: 'A-2', p309: 'Transporte en mototaxi', p308: '', p308a: '',
    candidates: [{ codigo: '4922', descripcion: 'Transporte', prob: 0.61, rank: 1 }],
    confianza_ml: '0.61', r2_evidence: {}, status: 'resolved', final_code: '4922',
    updated_at: new Date('2026-01-01T00:00:00Z'), llm_decision: 'selection', llm_code: '4922',
    llm_justification: 'Confirmó el candidato principal.', llm_latency: '21.4', human_decision: null,
    latest_source: 'llm',
  });
  assert.equal(item.origen_decision, 'qwen');
  assert.equal(item.estado, 'confirmado');
});
