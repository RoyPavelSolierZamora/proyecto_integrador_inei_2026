import assert from 'node:assert/strict';
import test from 'node:test';
import { generateStrongPassword, passwordChecks, passwordIsValid } from '../frontend/src/shared/lib/passwordPolicy.js';

test('la verificación de la interfaz coincide con las reglas del servidor', () => {
  assert.equal(passwordIsValid('Una Clave Segura #2026 y larga'), true);
  assert.equal(passwordIsValid('muy-corta'), false);
  assert.equal(passwordIsValid('solo-minusculas-123'), false);
  assert.equal(passwordIsValid('Clave-Segura-2026', 'clave'), false);
  assert.equal(passwordIsValid('Contraseña123!ABC'), false);
  assert.equal(passwordIsValid('Abcd1234!!ok'), false);
  assert.equal(passwordIsValid('Xaaa-Cdef-2026!'), false);
  assert.equal(passwordIsValid('Xq7!mZ2#pLa9', 'aquispe'), true);
});

test('una clave vacía no cumple ninguna regla', () => {
  assert.ok(passwordChecks('').every(check => check.ok === false));
});

test('el generador entrega claves que cumplen todas las reglas', () => {
  for (let index = 0; index < 50; index += 1) {
    const password = generateStrongPassword('mquispe');
    assert.equal(password.length, 24);
    assert.equal(passwordIsValid(password, 'mquispe'), true, password);
  }
});
