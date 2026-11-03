import assert from 'node:assert/strict';
import test from 'node:test';
import { getConfig } from '../src/config.js';

test('acepta las variables nativas de PostgreSQL sin construir una URL', () => {
  const previous = process.env.PGPASSWORD;
  process.env.PGPASSWORD = 'solo-para-prueba';
  try {
    const config = getConfig();
    assert.equal(config.database.host, '127.0.0.1');
    assert.equal(config.database.database, 'epen_codificacion');
    assert.equal(config.database.user, 'epen_app');
    assert.equal(config.database.password, 'solo-para-prueba');
  } finally {
    if (previous === undefined) delete process.env.PGPASSWORD;
    else process.env.PGPASSWORD = previous;
  }
});

test('rechaza modos Qwen desconocidos', () => {
  const previousPassword = process.env.PGPASSWORD;
  const previousMode = process.env.QWEN_MODE;
  process.env.PGPASSWORD = 'solo-para-prueba';
  process.env.QWEN_MODE = 'inseguro';
  try {
    assert.throws(() => getConfig(), /QWEN_MODE debe ser real/);
  } finally {
    if (previousPassword === undefined) delete process.env.PGPASSWORD;
    else process.env.PGPASSWORD = previousPassword;
    if (previousMode === undefined) delete process.env.QWEN_MODE;
    else process.env.QWEN_MODE = previousMode;
  }
});

