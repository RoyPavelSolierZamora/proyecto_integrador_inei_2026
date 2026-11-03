import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRawEpenCsv } from '../src/raw-csv.js';

test('acepta una base original sin candidatos R2', () => {
  const rows = parseRawEpenCsv('id_registro,p309,p308,p308a\nA-1,"Vende frutas, verduras y bebidas",Vendedora,Atiende clientes\n');
  assert.deepEqual(rows, [{ id_registro: 'A-1', p309: 'Vende frutas, verduras y bebidas', p308: 'Vendedora', p308a: 'Atiende clientes' }]);
});

test('rechaza identificadores duplicados en la carga original', () => {
  assert.throws(() => parseRawEpenCsv('id_registro,p309\nA-1,Texto uno\nA-1,Texto dos\n'), /duplicado/);
});

