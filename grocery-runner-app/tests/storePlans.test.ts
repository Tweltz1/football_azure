import assert from 'node:assert/strict';
import { test } from 'node:test';
import { astar } from '../src/lib/routing/astar';
import { StoreGrid } from '../src/lib/routing/grid';
import { buildBlockLayout, TARGET_EAU_CLAIRE, WALMART_CHIPPEWA_FALLS } from '../src/lib/routing/blockPlan';
import { buildPlanLayout, planFor, WOODMANS_ALTOONA } from '../src/lib/routing/plan';
import { cellForLocation } from '../src/lib/routing/layout';
import { planRoute } from '../src/lib/routing/planRoute';
import { buildProfile } from '../src/lib/storeProfile';
import { ListItem } from '../src/lib/types';

const it = (name: string, location: ListItem['location'] = { kind: 'unknown' }): ListItem => ({ id: name, name, checked: false, location });
const aisle = (a: string): ListItem['location'] => ({ kind: 'aisle', aisle: a, source: 'store' });

test("finds a store's own plan by chain and position or town, and never lends one to another store", () => {
  assert.equal(planFor({ chain: 'woodmans', lat: 44.8161, lon: -91.4569 }), WOODMANS_ALTOONA);
  assert.equal(planFor({ chain: 'woodmans', lat: 43.07, lon: -89.4 }), null);
  assert.equal(planFor({ chain: 'walmart', lat: 44.92, lon: -91.38 }), WALMART_CHIPPEWA_FALLS);
  assert.equal(planFor({ chain: 'walmart', address: '2786 Commercial Blvd, Chippewa Falls, WI' }), WALMART_CHIPPEWA_FALLS);
  assert.equal(planFor({ chain: 'walmart', lat: 44.86, lon: -91.45 }), null, 'a north Eau Claire Walmart is a different store');
  assert.equal(planFor({ chain: 'walmart', lat: 41.9, lon: -87.6 }), null);
  assert.equal(planFor({ chain: 'target', lat: 44.778, lon: -91.438 }), TARGET_EAU_CLAIRE);
  assert.equal(planFor({ chain: 'target', name: 'Target', address: 'Eau Claire, WI' }), TARGET_EAU_CLAIRE);
  assert.equal(planFor({ chain: 'target' }), null);
  assert.equal(planFor({ chain: 'target', lat: 44.97, lon: -93.27 }), null);
  assert.equal(planFor({ chain: 'kroger', lat: 1, lon: 1 }), null);
});

test('Walmart Chippewa Falls: grocery on the right, departments in their own blocks', () => {
  const l = buildBlockLayout(WALMART_CHIPPEWA_FALLS);
  const d = l.departmentCell;
  for (const c of [l.entrance, l.checkout, ...Object.values(d)]) assert.ok(l.grid.isWalkable(c), JSON.stringify(c));
  assert.deepEqual(l.unmapped, []);
  assert.ok(d.produce.x > 40 && d.meat.x > 50 && d.dairy.y > l.grid.height - 5, 'produce/meat right, dairy at the back');
  assert.ok(d.pet.x < 45 && d.household.x < 45, 'paper and pets on the general merchandise back wall');
  assert.ok(d.health.x < 20 && d.health.y < 8, 'pharmacy at the front left');
  assert.ok(l.zones!.some((z) => z.text === 'Fresh Produce'));
});

test('Target Eau Claire: grocery block, departments the map does not show are listed off the map', () => {
  const items = [it('bananas'), it('milk'), it('paper towels'), it('dog food'), it('shampoo'), it('pasta', aisle('G12'))];
  const r = planRoute(items, 16, { plan: TARGET_EAU_CLAIRE, coldLast: true });
  const off = r.stops.filter((s) => s.offMap);
  assert.equal(off.length, 1);
  assert.deepEqual(off[0].items.map((i) => i.name).sort(), ['dog food', 'shampoo']);
  assert.equal(r.stops.at(-1)!.offMap, true, 'listed last');
  assert.equal(r.stops.flatMap((s) => s.items).length, items.length, 'nothing dropped');
  const g = buildBlockLayout(TARGET_EAU_CLAIRE).departmentCell.pantry;
  const pasta = r.stops.find((s) => s.items.some((i) => i.name === 'pasta'))!;
  assert.deepEqual(pasta.cell, g, 'an aisle number Target does not map walks to the grocery block');
});

test("Woodman's Altoona: aisle 1 by produce, frozen wall aisles, letters in front, soda front-left", () => {
  const l = buildPlanLayout(WOODMANS_ALTOONA);
  const w = l.grid.width;
  assert.ok(l.aisleCell(1).x > l.aisleCell(23).x, 'aisle 1 is on the right');
  assert.ok(l.departmentCell.produce.x > w / 2);
  assert.equal(l.aisleCell(25).x, 1, 'aisle 25 is the left (frozen) wall');
  const a = cellForLocation(l, { kind: 'aisle', aisle: 'A', source: 'store' })!;
  const z = cellForLocation(l, { kind: 'aisle', aisle: 'Z', source: 'store' })!;
  assert.equal(a.y, 1);
  assert.ok(a.x > z.x, 'A is on the right');
  const soda = cellForLocation(l, { kind: 'aisle', aisle: 'SODA', source: 'store' })!;
  assert.ok(soda.x < w / 3 && soda.y === 0);
  for (const c of [a, z, soda, l.entrance, l.checkout, ...Object.values(l.departmentCell)]) assert.ok(l.grid.isWalkable(c), JSON.stringify(c));
  assert.ok(l.zones!.some((zn) => zn.text === 'Dairy'));
});

test('every plan routes a mixed list to walkable stops with cold last', () => {
  const items = [it('bananas'), it('bread'), it('soap', aisle('N')), it('pasta', aisle('10')), it('paper towels'), it('dog food'), it('milk'), it('ice cream', aisle('25')), it('soda', aisle('SODA'))];
  for (const plan of [WOODMANS_ALTOONA, WALMART_CHIPPEWA_FALLS, TARGET_EAU_CLAIRE]) {
    const r = planRoute(items, 20, { coldLast: true, plan });
    assert.equal(r.stops.flatMap((s) => s.items).length, items.length, plan.name);
    for (const s of r.stops.filter((x) => !x.offMap)) assert.ok(r.layout.grid.isWalkable(s.cell), plan.name);
    assert.ok(r.path.length > 0 && r.distance > 0);
  }
});

test("a store's own map is not moved by shoppers' answers", () => {
  const w = buildPlanLayout(WOODMANS_ALTOONA, { profile: buildProfile([{ name: 'milk', aisle: '3' }, { name: 'yogurt', aisle: '3' }]) });
  assert.notDeepEqual(w.departmentCell.dairy, w.aisleCell(3));
});

test('Walmart route keeps to the walkways: no cutting across clothing, frozen and dairy last, ends at checkout', () => {
  const items = [it('bread'), it('bananas'), it('shampoo'), it('paper towels'), it('dog food'), it('diapers'), it('cereal'), it('chicken'), it('milk'), it('ice cream')];
  const r = planRoute(items, 20, { coldLast: true, plan: WALMART_CHIPPEWA_FALLS });
  const H = WALMART_CHIPPEWA_FALLS.height;
  // Clothing & Shoes is c25-43, rows 10-24 (Baby, c35-43 rows 10-14, is its own stop).
  const inClothing = r.path.filter((c) => c.x >= 26 && c.x <= 42 && H - 1 - c.y >= 15 && H - 1 - c.y <= 23);
  assert.equal(inClothing.length, 0, JSON.stringify(inClothing.slice(0, 5)));
  const names = r.stops.map((s) => s.items.map((i) => i.name).join('/'));
  assert.deepEqual(names.slice(-2).sort(), ['ice cream', 'milk']);
  assert.deepEqual(r.path.at(-1), r.layout.checkout);
});

test('A* goes straight when it can instead of in stair-steps', () => {
  const p = astar(new StoreGrid(12, 12), { x: 0, y: 0 }, { x: 10, y: 8 })!.path;
  let turns = 0;
  for (let i = 2; i < p.length; i++) {
    const a = [p[i - 1].x - p[i - 2].x, p[i - 1].y - p[i - 2].y];
    const b = [p[i].x - p[i - 1].x, p[i].y - p[i - 1].y];
    if (a[0] !== b[0] || a[1] !== b[1]) turns++;
  }
  assert.equal(turns, 1);
  assert.equal(p.length - 1, 18);
});

test('shopping order: non-food first and fresh food late when the layout allows, frozen and dairy always last', () => {
  const names = ['bread', 'bananas', 'shampoo', 'paper towels', 'dog food', 'cereal', 'chicken breast', 'milk', 'ice cream'];
  const r = planRoute(names.map((n) => it(n)), 20, { coldLast: true, plan: WALMART_CHIPPEWA_FALLS });
  const order = r.stops.map((s) => s.items.map((i) => i.name).join('/'));
  const pos = (n: string) => order.findIndex((o) => o.split('/').includes(n));
  for (const nonFood of ['shampoo', 'paper towels', 'dog food']) assert.ok(pos(nonFood) < pos('bananas') && pos(nonFood) < pos('chicken breast'), order.join(' > '));
  assert.deepEqual(order.slice(-2).sort(), ['ice cream', 'milk']);
  // Without the option it is just the shortest walk.
  const plain = planRoute(names.map((n) => it(n)), 20, { plan: WALMART_CHIPPEWA_FALLS });
  assert.ok(plain.distance <= r.distance);
  // Every store ends the walk at its checkout.
  for (const plan of [WOODMANS_ALTOONA, WALMART_CHIPPEWA_FALLS, TARGET_EAU_CLAIRE, null]) {
    const x = planRoute(names.map((n) => it(n)), 20, { coldLast: true, plan });
    assert.deepEqual(x.path.at(-1), x.layout.checkout);
  }
});
