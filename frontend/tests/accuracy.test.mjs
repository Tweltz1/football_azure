// Accuracy card numbers: `node --test frontend/tests/accuracy.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAccuracy } from '../src/data/accuracy.js';

const row = (id, position, projected, actual) => [id, `P ${id}`, position, projected, projected - 1, projected - 2, actual, actual - 1, actual - 2];

test('average miss per position, close calls, and the biggest surprises', () => {
  const data = {
    weeks: [
      { week: 1, source: 'sleeper', rows: [row('a', 'WR', 15, 20), row('b', 'WR', 12, 6), row('c', 'WR', 2, 0), row('q', 'QB', 20, 26)] },
      { week: 2, source: 'saved', rows: [row('a', 'WR', 14, 9), row('b', 'WR', 13, 11), row('k', 'K', 8, 8)] },
    ],
  };
  const s = summarizeAccuracy(data, 'ppr');
  assert.deepEqual(s.weeks, [1, 2]);
  assert.deepEqual(s.savedWeeks, [2]);
  assert.equal(s.players, 7);
  const wr = s.positions.find((p) => p.position === 'WR');
  assert.equal(wr.count, 5);
  assert.equal(wr.averageMiss, (5 + 6 + 2 + 5 + 2) / 5);
  assert.deepEqual(s.positions.map((p) => p.position), ['QB', 'WR', 'K']);

  // Week 1: a (15) over b (12), a scored more: right. c is too small to be a start/sit question.
  // Week 2: a (14) over b (13), b scored more: wrong.
  assert.deepEqual(s.calls, { right: 0.5, count: 2 });
  assert.equal(s.buckets.reduce((n, b) => n + b.count, 0), 2);
  assert.equal(s.bigMisses[0].id, 'b');
  assert.equal(s.bigMisses[0].diff, -6);

  // Half-PPR columns are used when the league is half-PPR.
  assert.equal(summarizeAccuracy(data, 'half').positions.find((p) => p.position === 'QB').averageMiss, 6);
});

test('no data gives an empty summary', () => {
  const s = summarizeAccuracy(null);
  assert.deepEqual(s.weeks, []);
  assert.equal(s.calls, null);
  assert.equal(s.clearCalls, null);
});
