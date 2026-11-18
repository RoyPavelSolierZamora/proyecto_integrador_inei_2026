import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv } from '../src/services/csv-export.js';

test('genera CSV UTF-8 con comillas y saltos escapados', () => {
  const csv = buildCsv([{ key: 'texto', label: 'texto' }], [{ texto: 'Venta, "al por menor"\nlocal' }]);
  assert.ok(csv.startsWith('\uFEFF"texto"\r\n'));
  assert.match(csv, /"Venta, ""al por menor""\nlocal"/);
});

test('neutraliza fórmulas de hoja de cálculo en texto abierto', () => {
  const csv = buildCsv([{ key: 'texto', label: 'texto' }], [{ texto: '=HYPERLINK("https://ejemplo")' }]);
  assert.match(csv, /"'=HYPERLINK/);
});
