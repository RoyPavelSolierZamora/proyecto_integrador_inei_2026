import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCodeRows, detectAssistantIntent, greetingAnswer, helpAnswer, normalizeQuestion } from '../src/services/insights.js';

test('normaliza preguntas en español sin depender de tildes', () => {
  assert.equal(normalizeQuestion('¿Cómo revisó la clasificación?'), 'como reviso la clasificacion');
});

test('responde a los saludos cortos sin confundirlos con preguntas', () => {
  assert.equal(detectAssistantIntent('Hola'), 'greeting');
  assert.equal(detectAssistantIntent('¡Buenos días!'), 'greeting');
  assert.equal(detectAssistantIntent('hola, ¿cómo cargo un CSV?'), 'help');
  assert.match(greetingAnswer('Ana María Quispe'), /^Hola, Ana\./);
  assert.match(greetingAnswer(''), /^Hola\./);
});

test('enruta consultas estadísticas sin permitir SQL libre', () => {
  assert.equal(detectAssistantIntent('Compara enero con febrero', { compareDatasetId: 2 }), 'compare_datasets');
  assert.equal(detectAssistantIntent('¿Qué codificador tiene más correcciones?'), 'quality_control');
  assert.equal(detectAssistantIntent('Cruza ocupación, tareas y P309'), 'variable_profile');
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

test('separa los temas de ayuda conocidos de las preguntas abiertas', async () => {
  const { hasHelpTopic, codesInQuestion } = await import('../src/services/insights.js');
  assert.equal(hasHelpTopic('¿Cómo cargo un CSV?'), true);
  assert.equal(hasHelpTopic('Explica en palabras sencillas el grupo 7223'), false);
  assert.deepEqual(codesInQuestion('Qué es la 7223 y diferencia entre 2310 y 2320').clases, ['7223', '2310', '2320']);
  assert.deepEqual(codesInQuestion('Qué es la división 47 y el grupo 471').divisiones, ['47']);
  assert.deepEqual(codesInQuestion('Qué es la división 47 y el grupo 471').grupos, ['471']);
});

test('el contexto del chat usa las notas oficiales de cada clase mencionada', async () => {
  const { ciiuContext, notesFor } = await import('../src/services/ciiu-notas.js');
  assert.ok(notesFor('clases', '4711').notas.length > 100);
  assert.equal(notesFor('clases', '9999'), null);
  assert.match(notesFor('divisiones', '20').nombre, /Fabricaci/);
  const text = ciiuContext([{ code: '4711', description: 'Venta al por menor en comercios no especializados' }], { divisiones: ['47'] });
  assert.match(text, /División 47 · Comercio al por menor/);
  assert.match(text, /^CIIU 4711 · Venta al por menor/);
  assert.match(text, /Notas oficiales: Esta clase comprende/);
});
