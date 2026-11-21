import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planWeek, prepSchedule, suggestMeals, weekShopping } from '../src/lib/mealPlan';
import { SUGGESTED } from '../src/lib/recipes';
import { matchesFilters } from '../src/lib/diet';

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

test('"Plan my week" picks different meals on each tap, even right after Clear', () => {
  const pick = (seed: number, avoid: string[] = []) => suggestMeals(SUGGESTED, { prefs: [], picked: [], avoid, count: 5, seed }).map((r) => r.id);
  // Seeds a tap apart (or a millisecond apart) used to give the same week.
  const weeks = new Set([1, 2, 3, 4, 5].map((n) => pick(Date.UTC(2026, 10, 21) + n).join()));
  assert.ok(weeks.size >= 4, `only ${weeks.size} different weeks`);
  // Meals suggested lately only come back when nothing else fits.
  const first = pick(7);
  const again = pick(8, first);
  assert.ok(again.every((id) => !first.includes(id)), `${again} repeats ${first}`);
  const vegan = suggestMeals(SUGGESTED, { prefs: ['vegan'], picked: [], avoid: first, count: 5, seed: 9 });
  assert.equal(vegan.length, 5);
  assert.ok(vegan.every((r) => matchesFilters(r, ['vegan'])));
});

test('prep day does each shared thing once for every meal that uses it', () => {
  const g = (id: string) => SUGGESTED.find((r) => r.id === `s-${id}`)!;
  const tasks = prepSchedule([
    { date: '2026-11-22', recipes: [] },
    { date: '2026-11-23', recipes: [g('tacos')] },
    { date: '2026-11-24', recipes: [g('stirfry')] },
    { date: '2026-11-25', recipes: [g('chili')] },
    { date: '2026-11-26', recipes: [g('curry')] },
    { date: '2026-11-27', recipes: [g('caesar')] },
  ]);
  const task = (id: string) => tasks.find((t) => t.id === id)!;
  // Jasmine and basmati rice: one pot.
  assert.deepEqual(task('grains').lines, [{ label: 'Rice, 4 cups', text: 'Chicken and Broccoli Stir-Fry and Chickpea Coconut Curry' }]);
  // Ground beef for tacos and chili browns once.
  const beef = task('protein').lines!.find((l) => l.label.startsWith('Ground beef'))!;
  assert.equal(beef.label, 'Ground beef, 2 1/2 lb');
  assert.match(beef.text, /^split: Ground Beef Tacos and Easy Beef Chili$/);
  assert.match(task('protein').detail, /Brown all the ground beef in one pan/);
  // Each vegetable once, the shared ones first, with what to do.
  const chop = task('chop').lines!;
  assert.equal(chop.filter((l) => l.label.startsWith('Yellow onion')).length, 1);
  assert.ok(chop.slice(0, 3).every((l) => / and /.test(l.text)));
  assert.ok(chop.some((l) => l.label === 'Garlic, 6 cloves · mince'));
  assert.ok(chop.some((l) => l.label === 'Green onions, 1 bunch · slice'));
  // Jarred sauces aren't a mixing job; a salad isn't frozen.
  assert.ok(!task('sauce').lines!.some((l) => /caesar|tomato/i.test(l.label)));
  assert.equal(task('pack-2026-11-27').icon, '📦');
  assert.equal(task('pack-2026-11-26').icon, '🧊');
});

test('linked recipes with no steps still get a prep plan from their ingredients', () => {
  const linked = {
    id: 'm1', title: 'Weeknight stew', servings: '4', source: 'mine' as const,
    items: [{ item: 'yellow onion', amount: '1', pantry: false, note: 'thinly sliced' }, { item: 'beef stew meat', amount: '2 lb', pantry: false }],
  };
  const tasks = prepSchedule([{ date: '2026-11-22', recipes: [linked] }]);
  assert.ok(tasks.find((t) => t.id === 'chop')!.lines!.some((l) => l.label === 'Yellow onion, 1 · thinly sliced'));
  assert.ok(tasks.some((t) => t.id === 'protein'));
});
