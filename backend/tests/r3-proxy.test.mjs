import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { createDataRouter } from '../src/data-routes.js';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('el estado R3 pasa por el backend y expone el modo configurado', async () => {
  const r3 = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ estado: 'ok', ollama: 'Ollama OK', modelo: 'qwen-prueba' }));
  });
  const r3Port = await listen(r3);

  const app = express();
  app.use((req, _res, next) => {
    req.auth = { user: { role: 'admin' } };
    next();
  });
  app.use(createDataRouter({ qwenMode: 'real', r3BaseUrl: `http://127.0.0.1:${r3Port}` }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const backend = app.listen(0, '127.0.0.1');
  await new Promise(resolve => backend.once('listening', resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${backend.address().port}/api/system/r3-health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      estado: 'ok', ollama: 'Ollama OK', modelo: 'qwen-prueba', mode: 'real',
    });
  } finally {
    await close(backend);
    await close(r3);
  }
});

test('el estado R3 exige un administrador autenticado', async () => {
  const app = express();
  app.use(createDataRouter({ qwenMode: 'real', r3BaseUrl: 'http://127.0.0.1:9' }));
  const backend = app.listen(0, '127.0.0.1');
  await new Promise(resolve => backend.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${backend.address().port}/api/system/r3-health`);
    assert.equal(response.status, 401);
  } finally {
    await close(backend);
  }
});
