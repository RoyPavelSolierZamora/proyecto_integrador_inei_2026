import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRawEpenCsv } from '../src/raw-csv.js';

test('acepta una base original sin candidatos R2', () => {
  const rows = parseRawEpenCsv('id_registro,p309,p308,p308a\nA-1,"Vende frutas, verduras y bebidas",Vendedora,Atiende clientes\n');
  assert.deepEqual(rows, [{ id_registro: 'A-1', p309: 'Vende frutas, verduras y bebidas', p308: 'Vendedora', p308a: 'Atiende clientes', c310: '', c311: '', c366: '' }]);
});

test('acepta variables EPEN nativas y descarta la etiqueta del archivo de entrada', () => {
  const rows = parseRawEpenCsv('ID_C200,C309,C308,C308A,C310,C311,C366,C309_COD\nA-2,Servicio de limpieza,Limpiadora,Limpia oficinas,3,5,6,8121\n');
  assert.deepEqual(rows[0], {
    id_registro: 'A-2', p309: 'Servicio de limpieza', p308: 'Limpiadora', p308a: 'Limpia oficinas',
    c310: '3', c311: '5', c366: '6',
  });
  assert.equal('codigo' in rows[0], false);
});

test('acepta etiquetas descriptivas reales en variables multivariadas', () => {
  const rows = parseRawEpenCsv('ID_C200,C309,C310,C311,C366\nA-3,Venta de abarrotes,Trabajador independiente,Empresa privada,Secundaria completa\n');
  assert.equal(rows[0].c310, 'Trabajador independiente');
  assert.equal(rows[0].c311, 'Empresa privada');
  assert.equal(rows[0].c366, 'Secundaria completa');
});

test('explica cuando una etiqueta multivariada supera el límite operativo', () => {
  const longValue = 'x'.repeat(161);
  assert.throws(() => parseRawEpenCsv(`ID_C200,C309,C310\nA-4,Venta,${longValue}\n`), /C310 supera 160 caracteres/);
});

test('rechaza identificadores duplicados en la carga original', () => {
  assert.throws(() => parseRawEpenCsv('id_registro,p309\nA-1,Texto uno\nA-1,Texto dos\n'), /duplicado/);
});

test('conserva P309 vacío para derivarlo sin bloquear todo el archivo', () => {
  const rows = parseRawEpenCsv('id_registro,p309,p308,p308a\nA-1,,Vendedora,Atiende clientes\n');
  assert.equal(rows[0].p309, '');
});

