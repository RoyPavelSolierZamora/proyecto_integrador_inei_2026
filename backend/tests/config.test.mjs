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

test('exige HTTPS y token largo para R3 remoto', () => {
  const previous = { password: process.env.PGPASSWORD, mode: process.env.R3_MODE, url: process.env.R3_BASE_URL, token: process.env.R3_API_TOKEN };
  process.env.PGPASSWORD = 'solo-para-prueba';
  process.env.R3_MODE = 'remote';
  process.env.R3_BASE_URL = 'http://r3.example.test';
  process.env.R3_API_TOKEN = 'corto';
  try {
    assert.throws(() => getConfig(), /URL HTTPS/);
    process.env.R3_BASE_URL = 'https://r3.example.test';
    assert.throws(() => getConfig(), /al menos 24 caracteres/);
    process.env.R3_API_TOKEN = 'token-seguro-de-prueba-123456789';
    const config = getConfig();
    assert.equal(config.r3Mode, 'remote');
    assert.equal(config.r3BaseUrl, 'https://r3.example.test');
  } finally {
    for (const [key, value] of Object.entries({ PGPASSWORD: previous.password, R3_MODE: previous.mode, R3_BASE_URL: previous.url, R3_API_TOKEN: previous.token })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

