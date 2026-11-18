import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planWeek, prepSchedule, suggestMeals, weekShopping } from '../src/lib/mealPlan';
import { SUGGESTED } from '../src/lib/recipes';

test('the plan week starts on the prep day, this week or the last one', () => {
  // Wed 2026-11-18, prep day Sunday → Sun 15th .. Sat 21st
  const w = planWeek(0, new Date(2026, 10, 18));
  assert.equal(w[0], '2026-11-15');
  assert.equal(w[6], '2026-11-21');
  // Prep day today counts as this week's; next week is 7 days on.
  assert.equal(planWeek(3, new Date(2026, 10, 18))[0], '2026-11-18');
  assert.equal(planWeek(3, new Date(2026, 10, 18), 1)[0], '2026-11-25');
  // Crosses month ends.
  assert.equal(planWeek(0, new Date(2026, 10, 30))[6], '2026-12-05');
});

test('suggestions fit the preferences, never repeat, and fill up to the count', () => {
  const quick = suggestMeals(SUGGESTED, { prefs: ['quick'], picked: [], count: 4, seed: 3 });
  assert.equal(quick.length, 4);
  assert.ok(quick.every((r) => r.minutes! <= 30));
  assert.equal(new Set(quick.map((r) => r.id)).size, 4);
  const picked = [SUGGESTED[0]];
  const more = suggestMeals(SUGGESTED, { prefs: [], picked, count: 5, seed: 7 });
  assert.equal(more.length, 4);
  assert.ok(!more.some((r) => r.id === SUGGESTED[0].id));
  assert.ok(!more.some((r) => r.tags?.includes('breakfast')));
});

test('week shopping merges the same ingredient across meals and skips staples', () => {
  const a = { ...SUGGESTED[0], id: 'a', title: 'A', items: [{ item: 'yellow onion', amount: '1', pantry: false }, { item: 'salt', amount: '', pantry: true }] };
  const b = { ...SUGGESTED[0], id: 'b', title: 'B', items: [{ item: 'Yellow onions', amount: '2', pantry: false }, { item: 'rice', amount: '1 cup', pantry: false }] };
  const list = weekShopping([a, b]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { name: 'yellow onion', amount: '1 + 2', meals: ['A', 'B'] });
});

test('prep schedule batches grains, meat and chopping, then packs each day', () => {
  const tacos = SUGGESTED.find((r) => r.id === 's-tacos')!;
  const stir = SUGGESTED.find((r) => r.id === 's-stirfry')!;
  const tasks = prepSchedule([
    { date: '2026-11-15', recipes: [] },
    { date: '2026-11-16', recipes: [tacos] },
    { date: '2026-11-20', recipes: [stir] },
  ]);
  const ids = tasks.map((t) => t.id);
  assert.ok(ids.includes('protein'));
  assert.ok(ids.includes('chop'));
  assert.deepEqual(ids.slice(-2), ['pack-2026-11-16', 'pack-2026-11-20']);
  assert.equal(tasks.at(-1)!.icon, '🧊'); // 5 days after prep: freeze
  assert.equal(tasks.at(-2)!.icon, '📦');
});
