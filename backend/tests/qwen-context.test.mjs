import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyWithQwen } from '../src/clients/qwen-client.js';

test('envía contexto ocupacional y antecedentes validados a Qwen', async () => {
  const originalFetch = global.fetch;
  let sent;
  global.fetch = async (_url, options) => {
    sent = { body: JSON.parse(options.body), authorization: options.headers.Authorization };
    return { ok: true, json: async () => ({ decision: 'seleccionar', codigo: '5610' }) };
  };
  try {
    const result = await classifyWithQwen({ r3BaseUrl: 'https://r3.example.test', r3ApiToken: 'token-de-prueba' }, {
      external_id: 'A-1', p309: 'vta d almuerzos', p308: 'cocinera', p308a: 'prepara platos',
      candidates: [{ codigo: '5610' }], confianza_ml: 0.69,
      r2_evidence: { casos_similares: [{ codigo: '5610', p309: 'Venta de almuerzos', similitud: 0.9 }] },
    });
    assert.equal(result.code, '5610');
    assert.equal(sent.body.p308, 'cocinera');
    assert.equal(sent.body.casos_similares[0].codigo, '5610');
    assert.equal(sent.authorization, 'Bearer token-de-prueba');
  } finally {
    global.fetch = originalFetch;
  }
});

test('interrumpe una consulta Qwen cuando el trabajo se cancela', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  const controller = new AbortController();
  try {
    const request = classifyWithQwen({ r3BaseUrl: 'https://r3.example.test', r3ApiToken: 'token-de-prueba' }, {
      external_id: 'A-2', p309: 'Actividad sintética', p308: '', p308a: '',
      candidates: [{ codigo: '5610' }], confianza_ml: 0.5, r2_evidence: {},
    }, { signal: controller.signal });
    controller.abort();
    await assert.rejects(request, error => error.code === 'QWEN_CANCELLED' && error.status === 499);
  } finally {
    global.fetch = originalFetch;
  }
});
