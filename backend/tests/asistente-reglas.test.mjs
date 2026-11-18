import assert from 'node:assert/strict';
import test from 'node:test';
import { detectAssistantIntent, hasHelpTopic, isNonsense, socialAnswer } from '../src/services/insights.js';
import { codeAnswer, compareCodesAnswer } from '../src/services/ciiu-notas.js';
import { searchKnowledge, indexStatus } from '../src/services/conocimiento.js';

test('las preguntas sin sentido se reconocen sin confundirlas con temas', () => {
  for (const question of ['asdfgh qwerty', 'jajajaja', '???', 'xkcd zzzz']) {
    assert.equal(detectAssistantIntent(question), 'nonsense', question);
  }
  assert.equal(isNonsense('cuanto es 2 mas 2'), false);
});

test('gracias e identidad se responden como conversación, no como ayuda técnica', () => {
  assert.equal(detectAssistantIntent('gracias'), 'social');
  assert.equal(detectAssistantIntent('quien eres'), 'social');
  assert.match(socialAnswer('gracias'), /^De nada/);
  assert.match(socialAnswer('quien eres'), /codificación EPEN/);
});

test('las coincidencias de ayuda son de palabra completa', () => {
  assert.equal(hasHelpTopic('capital de Francia'), false);
  assert.equal(hasHelpTopic('como cargo un csv'), true);
});

test('una referencia CIIU concreta recibe respuesta directa', () => {
  assert.equal(detectAssistantIntent('que es la clase 4711'), 'code');
  assert.equal(detectAssistantIntent('diferencia entre 2310 y 2320'), 'code_compare');
  assert.equal(detectAssistantIntent('explica eso', { previousCodes: ['5630'] }), 'code');
  assert.equal(detectAssistantIntent('explica eso'), 'help');
});

test('los conceptos no se responden con datos de la base', () => {
  assert.equal(detectAssistantIntent('que es un error de clasificacion'), 'help');
  assert.equal(detectAssistantIntent('que es un caso de codificacion'), 'help');
  assert.equal(detectAssistantIntent('que es el control de calidad'), 'help');
});

test('las preguntas de datos siguen yendo a su función', () => {
  assert.equal(detectAssistantIntent('resume esta base'), 'dataset_summary');
  assert.equal(detectAssistantIntent('cuantos registros pendientes hay'), 'dataset_summary');
  assert.equal(detectAssistantIntent('compara enero con febrero', { compareDatasetId: 2 }), 'compare_datasets');
  assert.equal(detectAssistantIntent('que codificador tiene mas correcciones'), 'quality_control');
});

test('la respuesta de código incluye nombre oficial y notas, o avisa si no existe', () => {
  const text = codeAnswer([{ code: '5630', description: 'Actividades de servicio de bebidas' }], { clases: ['5630', '9999'] });
  assert.match(text, /^CIIU 5630 · Actividades de servicio de bebidas/);
  assert.match(text, /No encuentro la clase 9999/);
});

test('el índice oficial no responde temas ajenos ni por palabras de dominio genéricas', async () => {
  if (!indexStatus().indexed) return;
  assert.equal(searchKnowledge('capital de Francia y receta de cocina').length, 0);
  assert.equal(searchKnowledge('cual es la base de datos mas grande').length, 0);
  assert.equal(searchKnowledge('cultivo de marihuana').length, 0);
  assert.ok(searchKnowledge('que es el cultivo de palta').some(hit => /aguacate/i.test(hit.texto)));
});

test('la comparación de las últimas clases no se confunde con la comparación de bases', () => {
  const previousCodes = ['4722', '5630'];
  assert.equal(detectAssistantIntent('me explicas la diferencia entre las 2?', { compareDatasetId: 2, previousCodes }), 'code_compare');
  assert.equal(detectAssistantIntent('que diferencia hay entre las dos bases', { compareDatasetId: 2, previousCodes }), 'compare_datasets');
  assert.equal(detectAssistantIntent('compara enero con febrero', { compareDatasetId: 2 }), 'compare_datasets');
  assert.equal(detectAssistantIntent('diferencia entre la 5630 y la 4722 y la 5610'), 'code_compare');
});

test('la comparación de clases explica qué comprende cada una y qué excluye', () => {
  const text = compareCodesAnswer([{ code: '5630', description: 'Actividades de servicio de bebidas' }, { code: '4722', description: 'Venta al por menor de bebidas en comercios especializados' }], ['5630', '4722']);
  assert.match(text, /^Comparación de las clases 5630 y 4722/);
  assert.match(text, /CIIU 5630 · Actividades de servicio de bebidas/);
  assert.match(text, /No incluye:/);
  assert.match(text, /CIIU 4722 · Venta al por menor de bebidas/);
});
