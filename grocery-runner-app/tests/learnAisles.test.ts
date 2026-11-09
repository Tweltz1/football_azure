import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Checkoff, learnFromTrip } from '../src/lib/learnAisles';
import { tallyVotes, VoteRow } from '../supabase/functions/grocery-runner/votes';

const t0 = Date.UTC(2026, 10, 9, 18, 0, 0);
const c = (name: string, sec: number, aisle?: string, inStore = true): Checkoff => ({
  itemId: name,
  name,
  at: t0 + sec * 1000,
  aisle,
  inStore,
});

test('learns an item checked off between two items in the same aisle', () => {
  const trip = [c('bananas', 0, undefined), c('cheerios', 120, '7'), c('oatmeal', 150), c('granola', 190, '7'), c('milk', 400, '30')];
  assert.deepEqual(learnFromTrip(trip), [{ itemId: 'oatmeal', name: 'oatmeal', aisle: '7' }]);
});

test('different aisles on each side teach nothing', () => {
  assert.deepEqual(learnFromTrip([c('a', 0, '7'), c('b', 60), c('c', 120, '8')]), []);
});

test('too long between check-offs teaches nothing', () => {
  assert.deepEqual(learnFromTrip([c('a', 0, '7'), c('b', 300), c('c', 330, '7')]), []);
});

test('checking everything off at once (checkout, home) is ignored', () => {
  const burst = [c('a', 0, '7'), c('b', 2), c('c', 4, '7'), c('d', 6), c('e', 8, '9'), c('f', 10)];
  assert.deepEqual(learnFromTrip(burst), []);
});

test('a quick trip with many items is ignored even with gaps over 10 seconds', () => {
  const quick = [c('a', 0, '7'), c('b', 15), c('c', 30, '7'), c('d', 45), c('e', 60, '9'), c('f', 75)];
  assert.deepEqual(learnFromTrip(quick), []);
});

test('check-offs away from the store are ignored', () => {
  const trip = [c('a', 0, '7', false), c('b', 60, undefined, false), c('c', 120, '7', false)];
  assert.deepEqual(learnFromTrip(trip), []);
});

test('a burst check-off is not used as a neighbour', () => {
  // "x" is checked 3 s after "a", so it is skipped; "b" sits between "a" and "c" (both aisle 7).
  const trip = [c('start', 0, '2'), c('a', 100, '7'), c('x', 103), c('b', 160), c('c', 220, '7'), c('end', 400, '12')];
  assert.deepEqual(learnFromTrip(trip).map((l) => l.name), ['b']);
});

const row = (aisle: string, kind: 'typed' | 'learned', at = '2026-11-09'): VoteRow => ({
  item_key: 'oatmeal',
  aisle,
  department: null,
  updated_at: at,
  kind,
});

test('one learned vote is not enough; two are', () => {
  assert.equal(tallyVotes([row('7', 'learned')]).oatmeal, undefined);
  assert.equal(tallyVotes([row('7', 'learned'), row('7', 'learned')]).oatmeal.aisle, '7');
});

test('a typed vote beats a learned one', () => {
  const t = tallyVotes([row('7', 'learned'), row('7', 'learned', '2026-11-10'), row('9', 'typed'), row('9', 'typed')]);
  assert.equal(t.oatmeal.aisle, '9');
  const tie = tallyVotes([row('7', 'learned'), row('7', 'learned'), row('9', 'typed')]);
  assert.equal(tie.oatmeal.aisle, '9'); // equal weight: the typed answer wins
});
