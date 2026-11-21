import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPlanLayout, planFor, TARGET_TYPICAL, WALMART_TYPICAL, WOODMANS_ALTOONA } from '../src/lib/routing/plan';
import { cellForLocation } from '../src/lib/routing/layout';
import { planRoute } from '../src/lib/routing/planRoute';
import { buildProfile } from '../src/lib/storeProfile';
import { ListItem } from '../src/lib/types';

const it = (name: string, location: ListItem['location'] = { kind: 'unknown' }): ListItem => ({ id: name, name, checked: false, location });
const aisle = (a: string): ListItem['location'] => ({ kind: 'aisle', aisle: a, source: 'store' });

test('finds the store plan by chain and position, else the chain layout', () => {
  assert.equal(planFor({ chain: 'woodmans', lat: 44.8161, lon: -91.4569 }), WOODMANS_ALTOONA);
  assert.equal(planFor({ chain: 'woodmans', lat: 43.07, lon: -89.4 }), null);
  assert.equal(planFor({ chain: 'walmart', lat: 44.9, lon: -91.4 }), WALMART_TYPICAL);
  assert.equal(planFor({ chain: 'target' }), TARGET_TYPICAL);
  assert.equal(planFor({ chain: 'kroger', lat: 1, lon: 1 }), null);
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
  for (const plan of [WOODMANS_ALTOONA, WALMART_TYPICAL, TARGET_TYPICAL]) {
    const r = planRoute(items, 20, { coldLast: true, plan });
    assert.equal(r.stops.flatMap((s) => s.items).length, items.length, plan.name);
    for (const s of r.stops) assert.ok(r.layout.grid.isWalkable(s.cell), plan.name);
    assert.ok(r.path.length > 0 && r.distance > 0);
  }
});

test("a chain's typical layout gives way to what shoppers taught it", () => {
  const profile = buildProfile([{ name: 'paper towels', aisle: '14' }, { name: 'toilet paper', aisle: '14' }]);
  const l = buildPlanLayout(WALMART_TYPICAL, { profile });
  assert.deepEqual(l.departmentCell.household, l.aisleCell(14));
  assert.ok(!l.zones!.some((z) => z.text.startsWith('Paper')));
  // A store's own map is not moved by answers.
  const w = buildPlanLayout(WOODMANS_ALTOONA, { profile: buildProfile([{ name: 'milk', aisle: '3' }, { name: 'yogurt', aisle: '3' }]) });
  assert.notDeepEqual(w.departmentCell.dairy, w.aisleCell(3));
});
