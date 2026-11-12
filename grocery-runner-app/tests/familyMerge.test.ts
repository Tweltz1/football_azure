import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSync, type FamilyRow } from '../src/lib/familyMerge';

const item = (id: string, name: string, checked = false) => ({ id, name, checked });
const m = (...items: ReturnType<typeof item>[]) => new Map(items.map((i) => [i.id, i]));

test('first sync: items on this phone go up, items from the family come down', () => {
  const rows: FamilyRow[] = [{ id: 'b', data: item('b', 'Eggs'), deleted: false, updated_at: 50 }];
  const r = planSync(new Map(), m(item('a', 'Milk')), new Map(), rows, 100);
  assert.deepEqual(r.up.map((u) => u.id), ['a']);
  assert.deepEqual(r.changed.map((c) => c.name), ['Eggs']);
  assert.deepEqual([...r.next.keys()].sort(), ['a', 'b']);
});

test('the newer side wins: a check-off in the store beats an older edit', () => {
  const snap = m(item('a', 'Milk'));
  // Someone checked Milk off at t=200; this phone renamed it at t=150.
  const rows: FamilyRow[] = [{ id: 'a', data: item('a', 'Milk', true), deleted: false, updated_at: 200 }];
  const r = planSync(snap, m(item('a', '2% milk')), new Map([['a', 150]]), rows, 300);
  assert.equal(r.up.length, 0);
  assert.deepEqual(r.changed, [item('a', 'Milk', true)]);
  // This phone's newer change goes up instead.
  const r2 = planSync(snap, m(item('a', '2% milk')), new Map([['a', 250]]), rows, 300);
  assert.deepEqual(r2.up.map((u) => [u.id, u.data?.name, u.updated_at]), [['a', '2% milk', 250]]);
  assert.equal(r2.changed.length, 0);
});

test('removals travel both ways, and unchanged items cause no traffic', () => {
  const snap = m(item('a', 'Milk'), item('b', 'Bread'), item('c', 'Jam'));
  const rows: FamilyRow[] = [
    { id: 'a', data: item('a', 'Milk'), deleted: false, updated_at: 10 },
    { id: 'b', data: null, deleted: true, updated_at: 90 },
    { id: 'c', data: item('c', 'Jam'), deleted: false, updated_at: 10 },
  ];
  // Another phone removed Bread; this phone removed Jam.
  const r = planSync(snap, m(item('a', 'Milk'), item('b', 'Bread')), new Map([['c', 80]]), rows, 100);
  assert.deepEqual(r.removed, ['b']);
  assert.deepEqual(r.up, [{ id: 'c', data: null, deleted: true, updated_at: 80 }]);
  assert.equal(r.changed.length, 0);
  assert.deepEqual([...r.next.keys()], ['a']);
});
