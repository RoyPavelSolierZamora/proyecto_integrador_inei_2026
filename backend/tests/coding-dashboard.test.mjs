import assert from 'node:assert/strict';
import test from 'node:test';
import { accuracyByDivision, buildCodingDashboard, coderProgress, dailyProgress, topConfusions } from '../src/services/coding-dashboard.js';

const decisions = [
  { id: 1, case_id: 1, user_id: 7, full_name: 'Ana', username: 'ana', analyst_code: 'ANALISTA001', decision: 'confirmation', created_at: '2026-11-10T09:00:00Z' },
  { id: 2, case_id: 2, user_id: 7, full_name: 'Ana', username: 'ana', analyst_code: 'ANALISTA001', decision: 'correction', created_at: '2026-11-10T10:00:00Z' },
  { id: 3, case_id: 1, user_id: 8, full_name: 'Luis', username: 'luis', analyst_code: null, decision: 'derivation', created_at: '2026-11-11T09:00:00Z' },
];

test('el avance por codificador cuenta decisiones y marca quién completó la base', () => {
  const progress = coderProgress(decisions, 2);
  const ana = progress.find(item => item.username === 'ana');
  assert.equal(ana.decisions, 2);
  assert.equal(ana.corrections, 1);
  assert.equal(ana.casesCovered, 2);
  assert.equal(ana.completedBase, true);
  assert.equal(progress.find(item => item.username === 'luis').completedBase, false);
  assert.equal(ana.daily.length, 1);
});

test('la serie diaria agrupa las decisiones por fecha', () => {
  assert.deepEqual(dailyProgress(decisions), [{ day: '2026-11-10', count: 2 }, { day: '2026-11-11', count: 1 }]);
});

test('la precisión por división usa los dos primeros dígitos de la referencia', () => {
  const items = [
    { referenceCode: '5630', verdict: 'correct' },
    { referenceCode: '5610', verdict: 'incorrect' },
    { referenceCode: '4721', verdict: 'correct' },
  ];
  const byDivision = accuracyByDivision(items);
  const div56 = byDivision.find(item => item.division === '56');
  assert.equal(div56.verified, 2);
  assert.equal(div56.accuracy, 0.5);
});

test('las confusiones listan los pares más frecuentes entre sistema y referencia', () => {
  const items = [
    { systemCode: '5610', referenceCode: '5630', verdict: 'incorrect' },
    { systemCode: '5610', referenceCode: '5630', verdict: 'incorrect' },
    { systemCode: '4721', referenceCode: '4711', verdict: 'incorrect' },
    { systemCode: '4721', referenceCode: '4721', verdict: 'correct' },
  ];
  const top = topConfusions(items);
  assert.deepEqual(top[0], { systemCode: '5610', referenceCode: '5630', count: 2 });
  assert.equal(top.length, 2);
});

test('el bloque de codificadores solo se muestra con referencia activa o con una base completada', () => {
  const none = buildCodingDashboard({ records: 5, reference: null, comparison: null, comparedItems: [], humanDecisions: [decisions[2]], activeReference: false });
  assert.equal(none.coderSectionVisible, false);
  const comparison = { matched: 2, compared: 2, pending: 0, onlySystem: 0, overall: { correct: 2, incorrect: 0, verified: 2, accuracy: 1, interval: null, reviewed: 2, uncertain: 0 }, byBand: {}, byOrigin: {}, byAnalyst: {}, discrepancies: [] };
  const withRef = buildCodingDashboard({ records: 5, reference: { id: 9, name: 'Ref', period: '2026-09', records: 5 }, comparison, comparedItems: [], humanDecisions: [], activeReference: true });
  assert.equal(withRef.coderSectionVisible, true);
  assert.equal(withRef.coderSectionReason, 'referencia-activa');
  const completed = buildCodingDashboard({ records: 2, reference: null, comparison: null, comparedItems: [], humanDecisions: decisions, activeReference: false });
  assert.equal(completed.coderSectionVisible, true);
  assert.equal(completed.coderSectionReason, 'base-completada');
  // Sin referencia activa, aunque un codificador haya completado la base, no hay exactitud ni confusiones.
  assert.equal(completed.referenceVisible, false);
  assert.equal(completed.byOrigin.length, 0);
  assert.equal(completed.confusions.length, 0);
  assert.equal(withRef.referenceVisible, true);
});
