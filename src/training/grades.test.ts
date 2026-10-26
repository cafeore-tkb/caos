import assert from 'node:assert/strict';
import test from 'node:test';
import { parseScenario, startGame } from './engine';
import { absoluteGrade, assessGrade } from './grades';
import { createResult, readHistory, saveResult } from './history';

test('point-only grades stop at A without cohort confirmation and step down through D', () => {
  for (const [score, grade] of [
    [100, 'A'],
    [95, 'A'],
    [94, 'A'],
    [80, 'A'],
    [79, 'B'],
    [70, 'B'],
    [69, 'C'],
    [60, 'C'],
    [59, 'D'],
    [0, 'D'],
  ] as const)
    assert.equal(absoluteGrade(score), grade, String(score));
  assert.equal(absoluteGrade(Number.NaN), 'D');
});
test('the relative A+ quota is strictly less than ten percent and includes the full tie group', () => {
  assert.equal(
    assessGrade(95, [
      { score: 95, count: 1 },
      { score: 80, count: 9 },
    ]).grade,
    'A'
  );
  assert.equal(
    assessGrade(95, [
      { score: 95, count: 1 },
      { score: 80, count: 10 },
    ]).grade,
    'A+'
  );
  assert.equal(
    assessGrade(95, [
      { score: 95, count: 2 },
      { score: 80, count: 18 },
    ]).grade,
    'A'
  );
  assert.equal(
    assessGrade(95, [
      { score: 95, count: 2 },
      { score: 80, count: 19 },
    ]).grade,
    'A+'
  );
  assert.equal(assessGrade(95, [{ score: 95, count: 1 }]).grade, 'A');
  assert.equal(assessGrade(95, []).grade, 'A');
});
test('A+ requires BOTH 95 points and a strictly qualifying cohort', () => {
  assert.equal(assessGrade(95, []).grade, 'A');
  assert.equal(
    assessGrade(94, [
      { score: 94, count: 1 },
      { score: 0, count: 20 },
    ]).grade,
    'A'
  );
  assert.equal(assessGrade(100, [{ score: 100, count: 1 }]).grade, 'A');
  assert.equal(
    assessGrade(95, [
      { score: 100, count: 50 },
      { score: 95, count: 50 },
    ]).grade,
    'A'
  );
  assert.equal(
    assessGrade(79, [
      { score: 79, count: 1 },
      { score: 0, count: 20 },
    ]).grade,
    'B'
  );
  assert.equal(assessGrade(0, [{ score: 0, count: 11 }]).grade, 'D');
});

test('browser history preserves the shared grade snapshot and ignores damaged grade metadata', () => {
  const state = startGame(
    parseScenario({
      schemaVersion: 1,
      kind: 'synthetic',
      mode: 'fast',
      title: '履歴',
      durationSec: 600,
      orders: [{ orderId: 1, atSec: 0, items: [{ name: '余音ブレンド', quantity: 1 }] }],
    })
  );
  const entry = createResult(state, '2026-10-26T10:00:00Z', 'grade-history');
  assert.ok(entry.detail);
  entry.detail.assessment = assessGrade(0, [{ score: 0, count: 2 }]);
  const data = new Map<string, string>();
  const store = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  saveResult(entry, store);
  assert.deepEqual(readHistory(store)[0].detail?.assessment, entry.detail.assessment);
  const damaged = { ...entry, detail: { ...entry.detail, assessment: { grade: { bad: true } } } };
  store.setItem('caos-training-results-v2', JSON.stringify([damaged]));
  assert.equal(readHistory(store)[0].detail?.assessment, undefined);
  assert.equal(readHistory(store)[0].score, 0);
  store.setItem(
    'caos-training-results-v2',
    JSON.stringify([
      {
        ...entry,
        detail: { ...entry.detail, assessment: { ...entry.detail.assessment, policy: 'old-or-rule', grade: 'A+' } },
      },
    ])
  );
  assert.equal(
    readHistory(store)[0].detail?.assessment,
    undefined,
    'old OR-based grades must not survive the policy correction'
  );
});
