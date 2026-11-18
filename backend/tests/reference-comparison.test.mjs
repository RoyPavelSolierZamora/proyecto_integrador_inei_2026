import assert from 'node:assert/strict';
import test from 'node:test';
import { compareWithReference, validateReferenceRows } from '../src/services/reference-comparison.js';

const catalog = new Set(['5630', '5610', '4721']);

test('la importación valida código de catálogo, identificador repetido y código de analista', () => {
  const ok = validateReferenceRows([{ externalId: '1', p309: 'JUGOS', code: '5630', analyst: 'ANALISTA001' }, { externalId: '2', p309: 'ABARROTES', code: '4721', analyst: '' }], catalog);
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.rows[1].analyst, null);
  const bad = validateReferenceRows([
    { externalId: '1', p309: 'A', code: '9999' },
    { externalId: '1', p309: 'B', code: '5630' },
    { externalId: '3', p309: 'C', code: '5630', analyst: 'con espacios' },
  ], catalog);
  assert.equal(bad.rows.length, 0);
  assert.equal(bad.errorCount, 3);
  assert.match(bad.errors[0], /no existe en el catálogo/);
});

test('la comparación separa aciertos, errores y casos sin código del sistema', () => {
  const system = [
    { external_id: '1', final_code: '5630', confianza_ml: 0.99, origin: 'ml', p309: 'JUGOS' },
    { external_id: '2', final_code: '5610', confianza_ml: 0.96, origin: 'ml', p309: 'COMIDA' },
    { external_id: '3', final_code: null, confianza_ml: 0.7, origin: 'pendiente', p309: 'X' },
    { external_id: '9', final_code: '4721', confianza_ml: 0.5, origin: 'ml', p309: 'solo sistema' },
  ];
  const reference = [
    { external_id: '1', final_code: '5630', analyst_code: 'ANALISTA001' },
    { external_id: '2', final_code: '5630', analyst_code: 'ANALISTA002' },
    { external_id: '3', final_code: '4721', analyst_code: 'ANALISTA002' },
  ];
  const result = compareWithReference(system, reference);
  assert.equal(result.matched, 3);
  assert.equal(result.compared, 2);
  assert.equal(result.pending, 1);
  assert.equal(result.onlySystem, 1);
  assert.equal(result.overall.correct, 1);
  assert.equal(result.overall.incorrect, 1);
  assert.equal(result.byAnalyst.ANALISTA002.incorrect, 1);
  assert.equal(result.discrepancies.length, 1);
  assert.equal(result.discrepancies[0].systemCode, '5610');
  assert.equal(result.discrepancies[0].referenceCode, '5630');
});
