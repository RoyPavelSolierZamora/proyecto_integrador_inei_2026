import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accuracyShares, equalShares, parsePercent, percentError, sourceWarning } from '../../frontend/src/features/calidad-codificacion/repartoUi.js';

test('parsePercent acepta coma o punto y trata vacío como resto', () => {
  assert.equal(parsePercent(''), null);
  assert.equal(parsePercent('   '), null);
  assert.equal(parsePercent('40'), 40);
  assert.equal(parsePercent('33,5'), 33.5);
  assert.equal(parsePercent('33.5'), 33.5);
  assert.ok(Number.isNaN(parsePercent('abc')));
  assert.ok(Number.isNaN(parsePercent('1,2,3')));
  assert.ok(Number.isNaN(parsePercent('-5')));
});

test('percentError explica el problema de cada parte', () => {
  assert.equal(percentError(''), null);
  assert.equal(percentError('50'), null);
  assert.match(percentError('abc'), /números/);
  assert.match(percentError('0'), /mayor que cero/);
  assert.match(percentError('101'), /no puede pasar de 100/);
});

test('equalShares suma exactamente 100 con un decimal', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 9]) {
    const shares = equalShares(n);
    assert.equal(shares.length, n);
    const total = shares.reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(total - 100) < 1e-9, `n=${n} total=${total}`);
    assert.ok(shares.every(value => value > 0));
  }
  assert.deepEqual(equalShares(2), [50, 50]);
  assert.deepEqual(equalShares(0), []);
});

test('accuracyShares suma 100 y da menos a quien acierta menos', () => {
  const shares = accuracyShares([0.97, 0.9, 0.6]);
  const total = shares.reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total - 100) < 1e-9, `total=${total}`);
  assert.ok(shares[0] > shares[1] && shares[1] > shares[2]);
});

test('accuracyShares sin datos reparte por igual', () => {
  assert.deepEqual(accuracyShares([null, null]), [50, 50]);
  assert.deepEqual(accuracyShares([]), []);
});

test('sourceWarning avisa cuando la fuente no tiene casos', () => {
  assert.equal(sourceWarning(0), 'No hay casos pendientes en esta fuente.');
  assert.equal(sourceWarning(12), null);
});
