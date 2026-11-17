import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseR2Csv, parseRawEpenCsv } from '../src/services/csvImport.js';

test('la plantilla de R2 se importa sin observaciones', async () => {
  const csv = await readFile(new URL('../public/plantilla_importacion.csv', import.meta.url), 'utf8');
  const result = parseR2Csv(csv);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id_registro, 'EPEN-NUEVO-001');
  assert.equal(result.rows[0].candidatos[0].codigo, '0146');
});

test('la carga original acepta nombres EPEN nativos y variables multivariadas', () => {
  const csv = 'ID_C200,C309,C308,C308A,C310,C311,C366,C309_COD\nA-1,Venta de comida,Cocinera,Prepara menús,2,,6,5610\n';
  const result = parseRawEpenCsv(csv);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows[0], {
    id_registro: 'A-1', p309: 'Venta de comida', p308: 'Cocinera', p308a: 'Prepara menús',
    c309_1: '', c310: '2', c311: '', c366: '6',
  });
});

test('rechaza candidatos que no cumplen el contrato', () => {
  const csv = 'id_registro,p309,candidatos\n1,Texto,"[{""codigo"":""14""}]"';
  const result = parseR2Csv(csv);
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0], /4 dígitos/);
});
