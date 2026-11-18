import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, hashPassword, hashToken, validatePassword, verifyPassword } from '../src/security/security.js';

test('scrypt valida la clave correcta sin guardar el texto original', async () => {
  const password = 'Clave temporal segura 2026!';
  const encoded = await hashPassword(password);
  assert.match(encoded, /^scrypt\$/);
  assert.equal(encoded.includes(password), false);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword('otra clave incorrecta', encoded), false);
});

test('la política exige claves de al menos 12 caracteres', () => {
  assert.match(validatePassword('muy-corta'), /12 caracteres/);
  assert.equal(validatePassword('Una Clave Segura #2026 y larga'), null);
  assert.match(validatePassword('solo-minusculas-123'), /mayúscula/);
  assert.match(validatePassword('Clave-Segura-2026', 'clave'), /nombre de usuario/);
  assert.match(validatePassword('Contraseña123!ABC'), /palabras comunes/);
  assert.match(validatePassword('Abcd1234!!ok'), /secuencias/);
  assert.match(validatePassword('Xaaa-Cdef-2026!'), /tres veces/);
  assert.equal(validatePassword('Xq7!mZ2#pLa9', 'aquispe'), null);
});

test('los tokens de sesión se almacenan como huellas SHA-256', () => {
  const token = createSessionToken();
  const digest = hashToken(token);
  assert.notEqual(token, digest);
  assert.match(digest, /^[a-f0-9]{64}$/);
});

