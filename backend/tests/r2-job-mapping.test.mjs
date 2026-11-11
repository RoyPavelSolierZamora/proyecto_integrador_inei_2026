import assert from 'node:assert/strict';
import test from 'node:test';
import { mapJob } from '../src/r2-jobs.js';

test('calcula el tiempo restante de Qwen con la latencia observada', () => {
  const job = mapJob({
    id: 6, dataset_id: 10, dataset_name: 'prueba 1 -r2', period: '2026-1',
    status: 'qwen_running', threshold: '0.9', total_records: 1829, processed_records: 1829,
    automatic_count: 1240, qwen_pending_count: 589, manual_count: 0,
    qwen_mode: 'automatic', qwen_processed_count: 53, qwen_resolved_count: 39,
    qwen_review_count: 14, qwen_average_seconds: 30, cancel_requested: false,
  });
  assert.equal(job.estimatedSecondsRemaining, 536 * 30);
  assert.equal(job.qwenAverageSeconds, 30);
});

test('no anuncia tiempo restante cuando no hay una medición real', () => {
  const job = mapJob({
    id: 7, dataset_id: 11, status: 'qwen_running', threshold: '0.9', total_records: 2,
    processed_records: 2, automatic_count: 0, qwen_pending_count: 2, qwen_processed_count: 0,
    qwen_resolved_count: 0, qwen_review_count: 0, manual_count: 0, qwen_average_seconds: null,
  });
  assert.equal(job.estimatedSecondsRemaining, null);
});
