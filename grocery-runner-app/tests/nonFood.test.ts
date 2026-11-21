import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEPARTMENT_LABEL, DEPARTMENT_ORDER, departmentFromKrogerCategory, guessDepartment } from '../src/lib/departments';
import { groupList } from '../src/lib/listGroups';
import { buildGenericLayout } from '../src/lib/routing/layout';
import { planRoute } from '../src/lib/routing/planRoute';
import { buildProfile } from '../src/lib/storeProfile';
import { Department, ListItem } from '../src/lib/types';
import { departmentFrom } from '../supabase/functions/grocery-runner/partnerData';
import { DEPARTMENTS, forApp } from '../supabase/functions/grocery-runner/votes';

const item = (name: string, checked = false): ListItem => ({ id: name, name, checked, location: { kind: 'unknown' } });

test('non-food grocery-run items get their own departments', () => {
  const cases: [string, Department][] = [
    ['paper towels', 'household'],
    ['toilet paper', 'household'],
    ['trash bags', 'household'],
    ['aluminum foil', 'household'],
    ['Ziploc bags', 'household'],
    ['laundry detergent', 'household'],
    ['dish soap', 'household'],
    ['dishwasher pods', 'household'],
    ['Clorox wipes', 'household'],
    ['sponges', 'household'],
    ['AA batteries', 'household'],
    ['light bulbs', 'household'],
    ['napkins', 'household'],
    ['toothpaste', 'health'],
    ['shampoo', 'health'],
    ['shaving cream', 'health'],
    ['cough syrup', 'health'],
    ['ibuprofen', 'health'],
    ['vitamins', 'health'],
    ['band-aids', 'health'],
    ['deodorant', 'health'],
    ['sunscreen', 'health'],
    ['diapers', 'baby'],
    ['baby wipes', 'baby'],
    ['baby food', 'baby'],
    ['infant formula', 'baby'],
    ['baby shampoo', 'baby'],
    ['dog food', 'pet'],
    ['cat litter', 'pet'],
    ['dog treats', 'pet'],
    ['bird seed', 'pet'],
    ['fish food', 'pet'],
  ];
  for (const [name, dept] of cases) assert.equal(guessDepartment(name), dept, name);
});

test('food that shares a word with non-food stays food', () => {
  const cases: [string, Department][] = [
    ['baby spinach', 'produce'],
    ['baby carrots', 'produce'],
    ['baby back ribs', 'meat'],
    ['hot dogs', 'meat'],
    ['hot dog buns', 'bakery'],
    ['sour cream', 'dairy'],
    ['vitamin D milk', 'dairy'],
    ['coconut oil', 'pantry'],
    ['strawberries', 'produce'],
    ['rice paper', 'pantry'],
    ['coffee filters', 'pantry'],
    ['salmon', 'meat'],
    ['sunflower seeds', 'pantry'],
    ['maple syrup', 'pantry'],
    ['bacon', 'meat'],
    ['ice cream', 'frozen'],
  ];
  for (const [name, dept] of cases) assert.equal(guessDepartment(name), dept, name);
});

test('every department has a label and a place on the generic map', () => {
  for (const n of [1, 2, 5, 16, 24, 40]) {
    const layout = buildGenericLayout(n);
    for (const d of DEPARTMENT_ORDER) {
      assert.ok(DEPARTMENT_LABEL[d], d);
      const cell = layout.departmentCell[d];
      assert.ok(cell && layout.grid.isWalkable(cell), `${d} @ ${n} aisles`);
    }
  }
  // Non-food is not dumped in the frozen aisle on a normal store.
  const layout = buildGenericLayout(20);
  for (const d of ['household', 'health', 'baby', 'pet'] as Department[]) {
    assert.notDeepEqual(layout.departmentCell[d], layout.aisleCell(1), d);
  }
});

test('the list groups non-food in its own sections, cold items still last', () => {
  const sections = groupList([item('paper towels'), item('milk'), item('bananas'), item('dog food'), item('toothpaste'), item('frozen peas')]);
  const titles = sections.map((s) => s.title);
  assert.deepEqual(titles, ['Produce', 'Health & beauty', 'Paper & cleaning', 'Pet supplies', 'Frozen', 'Dairy']);
});

test('the route visits non-food stops and still gets cold items last', () => {
  const items = [item('ice cream'), item('paper towels'), item('diapers'), item('apples'), item('cat food')];
  const route = planRoute(items, 20, { coldLast: true });
  const names = route.stops.flatMap((s) => s.items.map((i) => i.name));
  assert.equal(names.length, 5);
  assert.equal(names[names.length - 1], 'ice cream');
});

test("a store's own answers move a non-food department to its real aisle", () => {
  const profile = buildProfile([
    { name: 'paper towels', aisle: 'A31' },
    { name: 'toilet paper', aisle: '31' },
    { name: 'trash bags', aisle: '32' },
  ]);
  assert.equal(profile.departmentAisle.household, 31);
  const layout = buildGenericLayout(40, { profile });
  assert.deepEqual(layout.departmentCell.household, layout.aisleCell(31));
});

test('Kroger categories and partner store sections map to the new departments', () => {
  assert.equal(departmentFromKrogerCategory('Cleaning Products'), 'household');
  assert.equal(departmentFromKrogerCategory('Paper Products'), 'household');
  assert.equal(departmentFromKrogerCategory('Health'), 'health');
  assert.equal(departmentFromKrogerCategory('Beauty'), 'health');
  assert.equal(departmentFromKrogerCategory('Baby'), 'baby');
  assert.equal(departmentFromKrogerCategory('Pet Care'), 'pet');
  assert.equal(departmentFromKrogerCategory('Canned & Packaged'), 'pantry');
  assert.equal(departmentFrom('Pharmacy'), 'health');
  assert.equal(departmentFrom('Paper Goods'), 'household');
  assert.equal(departmentFrom('Pet Supplies'), 'pet');
  assert.equal(departmentFrom('Baby'), 'baby');
});

test('server and app know the same departments', () => {
  assert.deepEqual([...DEPARTMENTS].sort(), [...DEPARTMENT_ORDER].sort());
});

test('apps before 1.1 never get a department they cannot show', () => {
  const answers = {
    'paper towels': { department: 'household', votes: 2, total: 2 },
    'dog food': { aisle: '14', department: 'pet', votes: 1, total: 1 },
    milk: { department: 'dairy', votes: 3, total: 3 },
  };
  const old = forApp(answers, undefined);
  assert.deepEqual(Object.keys(old).sort(), ['dog food', 'milk']);
  assert.equal(old['dog food'].aisle, '14');
  assert.equal(old['dog food'].department, undefined);
  assert.deepEqual(forApp(answers, 2), answers);
});
