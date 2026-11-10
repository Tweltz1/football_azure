import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DepartmentVoteRow, tallyDepartments } from '../supabase/functions/grocery-runner/votes';

const row = (item: string, department: string, at = '2026-11-01'): DepartmentVoteRow => ({
  item_key: item,
  department,
  updated_at: at,
});

test('one shopper alone never changes the guess', () => {
  assert.deepEqual(tallyDepartments([row('oat milk', 'dairy')]), {});
});

test('two shoppers who agree replace the guess', () => {
  const t = tallyDepartments([row('oat milk', 'dairy'), row('oat milk', 'dairy')]);
  assert.deepEqual(t['oat milk'], { department: 'dairy', votes: 2, total: 2 });
});

test('a split crowd is not used; a clear majority is', () => {
  assert.deepEqual(
    tallyDepartments([row('hummus', 'deli'), row('hummus', 'deli'), row('hummus', 'dairy'), row('hummus', 'dairy')]),
    {},
  );
  const t = tallyDepartments([row('hummus', 'deli'), row('hummus', 'deli'), row('hummus', 'deli'), row('hummus', 'dairy')]);
  assert.deepEqual(t.hummus, { department: 'deli', votes: 3, total: 4 });
});

test('two votes out of five is not a majority', () => {
  const rows = ['frozen', 'frozen', 'dairy', 'pantry', 'produce'].map((d) => row('tofu', d));
  assert.deepEqual(tallyDepartments(rows), {});
});

test('unknown departments are ignored, and items are tallied separately', () => {
  const t = tallyDepartments([
    row('salsa', 'garden'),
    row('salsa', 'produce'),
    row('salsa', 'produce'),
    row('naan', 'bakery'),
  ]);
  assert.deepEqual(Object.keys(t), ['salsa']);
  assert.equal(t.salsa.total, 2);
});
