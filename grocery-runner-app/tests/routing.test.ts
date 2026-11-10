import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guessDepartment } from '../src/lib/departments';
import { astar } from '../src/lib/routing/astar';
import { StoreGrid } from '../src/lib/routing/grid';
import { buildGenericLayout, parseAisleNumber } from '../src/lib/routing/layout';
import { planRoute } from '../src/lib/routing/planRoute';
import { ListItem } from '../src/lib/types';

const item = (name: string, location: ListItem['location'] = { kind: 'unknown' }): ListItem => ({
  id: name,
  name,
  checked: false,
  location,
});
const aisle = (n: string): ListItem['location'] => ({ kind: 'aisle', aisle: n, source: 'user' });

test('A* walks around a wall instead of through it', () => {
  const g = new StoreGrid(5, 5);
  g.blockRect(2, 0, 2, 3); // wall with a gap at the bottom
  const r = astar(g, { x: 0, y: 0 }, { x: 4, y: 0 })!;
  assert.equal(r.distance, 12); // down 4, across 4, up 4
  assert.ok(r.path.every((c) => g.isWalkable(c)));
});

test('A* returns null for an unreachable goal', () => {
  const g = new StoreGrid(3, 3);
  g.blockRect(1, 0, 1, 2);
  assert.equal(astar(g, { x: 0, y: 0 }, { x: 2, y: 2 }), null);
});

test('generic layout keeps every aisle and department reachable from the entrance', () => {
  const L = buildGenericLayout(20);
  for (let a = 1; a <= 20; a++) {
    for (const bay of [1, 6, 12]) assert.ok(astar(L.grid, L.entrance, L.aisleCell(a, bay)), `aisle ${a} bay ${bay}`);
  }
  for (const [dept, cell] of Object.entries(L.departmentCell)) assert.ok(astar(L.grid, L.entrance, cell), dept);
  assert.ok(astar(L.grid, L.entrance, L.checkout));
});

test('parses Kroger-style aisle labels', () => {
  assert.equal(parseAisleNumber('14'), 14);
  assert.equal(parseAisleNumber('A14'), 14);
  assert.equal(parseAisleNumber('Aisle 7'), 7);
  assert.equal(parseAisleNumber('Front'), null);
});

test('guesses departments from item names', () => {
  assert.equal(guessDepartment('Bananas'), 'produce');
  assert.equal(guessDepartment('frozen peas'), 'frozen');
  assert.equal(guessDepartment('2% milk'), 'dairy');
  assert.equal(guessDepartment('ground beef'), 'meat');
  assert.equal(guessDepartment('peanut butter'), 'pantry');
  assert.equal(guessDepartment('butter'), 'dairy');
  assert.equal(guessDepartment('paper towels'), 'pantry');
});

test('route visits aisles in walking order, not list order', () => {
  const route = planRoute([item('a', aisle('9')), item('b', aisle('2')), item('c', aisle('5'))], 10);
  const order = route.stops.map((s) => s.items[0].name);
  // Entrance is front-right, checkout front-left: high aisles first, then down.
  assert.deepEqual(order, ['a', 'c', 'b']);
  assert.ok(route.distance > 0);
  assert.ok(route.path.every((c) => route.layout.grid.isWalkable(c)));
});

test('items in the same spot share one stop; checked items are skipped', () => {
  const done = { ...item('done', aisle('3')), checked: true };
  const route = planRoute([item('x', aisle('4')), item('y', aisle('4')), done], 10);
  assert.equal(route.stops.length, 1);
  assert.equal(route.stops[0].items.length, 2);
});

test('coldLast picks up frozen and dairy after everything else', () => {
  const list = [item('ice cream'), item('milk'), item('bananas'), item('cereal', aisle('8')), item('steak')];
  const route = planRoute(list, 12, { coldLast: true });
  const names = route.stops.flatMap((s) => s.items.map((i) => i.name));
  const lastTwo = names.slice(-2).sort();
  assert.deepEqual(lastTwo, ['ice cream', 'milk']);
});

test('route grows the layout for aisle numbers above the store aisle count', () => {
  const route = planRoute([item('a', aisle('30'))], 10);
  assert.equal(route.layout.aisleCount, 30);
});

test('department guesses: shelf-stable forms, spices and plurals', () => {
  const cases: [string, string][] = [
    ['celery seed', 'pantry'],
    ['chicken bouillon paste', 'pantry'],
    ['chicken broth', 'pantry'],
    ['garlic powder', 'pantry'],
    ['ground cumin', 'pantry'],
    ['black pepper', 'pantry'],
    ['onion soup mix', 'pantry'],
    ['tomato sauce', 'pantry'],
    ['diced tomatoes', 'pantry'],
    ['coconut milk', 'pantry'],
    ['egg noodles', 'pantry'],
    ['tortilla chips', 'pantry'],
    ['sliced almonds', 'pantry'],
    ['tomatoes', 'produce'],
    ['blueberries', 'produce'],
    ['sweet potatoes', 'produce'],
    ['zucchini', 'produce'],
    ['fresh parsley', 'produce'],
    ['salad mix', 'produce'],
    ['sliced mushrooms', 'produce'],
    ['celery', 'produce'],
    ['flour tortillas', 'bakery'],
    ['hamburger buns', 'bakery'],
    ['rotisserie chicken', 'deli'],
    ['deli turkey', 'deli'],
    ['pepperoni', 'deli'],
    ['chuck roast', 'meat'],
    ['boneless skinless chicken breasts', 'meat'],
    ['unsalted butter', 'dairy'],
    ['pizza dough', 'dairy'],
    ['frozen broccoli', 'frozen'],
  ];
  for (const [name, dept] of cases) assert.equal(guessDepartment(name), dept, name);
});
