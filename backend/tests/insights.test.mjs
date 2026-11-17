import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCodeRows, detectAssistantIntent, helpAnswer, normalizeQuestion } from '../src/insights.js';

test('normaliza preguntas en español sin depender de tildes', () => {
  assert.equal(normalizeQuestion('¿Cómo revisó la clasificación?'), 'como reviso la clasificacion');
});

test('enruta consultas estadísticas sin permitir SQL libre', () => {
  assert.equal(detectAssistantIntent('Compara enero con febrero', { compareDatasetId: 2 }), 'compare_datasets');
  assert.equal(detectAssistantIntent('¿Qué codificador tiene más correcciones?'), 'quality_control');
  assert.equal(detectAssistantIntent('Dame un resumen estadístico'), 'dataset_summary');
  assert.equal(detectAssistantIntent('Resume esta base'), 'dataset_summary');
  assert.equal(detectAssistantIntent('¿Cómo cargo un CSV?'), 'help');
});

test('usa el contexto sin desviar otras preguntas del asistente', () => {
  assert.equal(detectAssistantIntent('¿Qué estadísticas tiene?', { caseExternalId: 'EPEN-1' }), 'dataset_summary');
  assert.equal(detectAssistantIntent('¿Hay casos parecidos en otros años?', { caseExternalId: 'EPEN-1' }), 'similar_cases');
  assert.equal(detectAssistantIntent('¿Cómo exporto?', { compareDatasetId: 2 }), 'help');
});

test('calcula variaciones comparables por proporción', () => {
  const rows = compareCodeRows(
    [{ code: '5610', description: 'Restaurantes', count: 40, share: 0.4 }, { code: '4922', description: 'Taxi', count: 20, share: 0.2 }],
    [{ code: '5610', description: 'Restaurantes', count: 25, share: 0.25 }, { code: '4922', description: 'Taxi', count: 35, share: 0.35 }],
  );
  assert.equal(rows[0].code, '5610');
  assert.ok(Math.abs(rows[0].change + 0.15) < 1e-9);
});

test('la ayuda explica el umbral sin inventar métricas', () => {
  assert.match(helpAnswer('¿Qué es el umbral 0,95?'), /prioriza precisión/i);
});
