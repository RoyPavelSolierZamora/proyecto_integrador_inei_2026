import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseR2Csv } from '../src/services/csvImport.js';

test('la plantilla de R2 se importa sin observaciones', async () => {
  const csv = await readFile(new URL('../public/plantilla_importacion.csv', import.meta.url), 'utf8');
  const result = parseR2Csv(csv);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id_registro, 'EPEN-NUEVO-001');
  assert.equal(result.rows[0].candidatos[0].codigo, '0146');
});

test('rechaza candidatos que no cumplen el contrato', () => {
  const csv = 'id_registro,p309,candidatos\n1,Texto,"[{""codigo"":""14""}]"';
  const result = parseR2Csv(csv);
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0], /4 dígitos/);
});
