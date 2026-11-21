import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cellForLocation } from '../src/lib/routing/layout';
import { buildPlanLayout, planFor } from '../src/lib/routing/plan';
import { planRoute } from '../src/lib/routing/planRoute';
import { WOODMANS_APPLETON, WOODMANS_MADISON_EAST, WOODMANS_PLANS } from '../src/lib/routing/woodmans';
import { ListItem } from '../src/lib/types';
import { matchCategory, parseCsv } from '../supabase/functions/grocery-runner/partnerData';

type Entry = { file: string; name: string; chain: string; lat: number; lon: number; aisles: number; pdf: string };
const stores: Entry[] = JSON.parse(readFileSync(new URL('../store/directories/stores.json', import.meta.url), 'utf8'));
const rowsOf = (file: string) =>
  parseCsv(readFileSync(new URL(`../store/directories/${file}`, import.meta.url), 'utf8'))
    .slice(1)
    .map(([category, aisle, department]) => ({ category, aisle, department }));
const at = (aisle: string): ListItem['location'] => ({ kind: 'aisle', aisle, source: 'store' });

test("every Woodman's store has its own directory, published source and floor plan", () => {
  assert.equal(stores.length, 21);
  assert.equal(WOODMANS_PLANS.length, 21);
  for (const s of stores) {
    assert.match(s.pdf, /^https:\/\/www\.woodmans-food\.com\/wp-content\/uploads\/.+\.pdf$/, s.name);
    const plan = WOODMANS_PLANS.find((p) => p.name === s.name);
    assert.ok(plan, s.name);
    assert.equal(plan.aisles, s.aisles, s.name);
    // Found by its own position (a shopper's store pin is within a block or two), and only there.
    assert.equal(planFor({ chain: 'woodmans', lat: s.lat + 0.001, lon: s.lon - 0.001 }), plan, s.name);
    assert.equal(planFor({ chain: 'kroger', lat: s.lat, lon: s.lon }), null);
  }
});

test("every Woodman's directory line is usable and everyday items find an aisle", () => {
  for (const s of stores) {
    const rows = rowsOf(s.file);
    assert.ok(rows.length > 200, `${s.name}: ${rows.length}`);
    for (const r of rows) assert.ok(/^[A-Z0-9][A-Z0-9 -]{0,11}$/.test(r.aisle) || r.department, `${s.name}: ${r.category}`);
    const where = (item: string) => {
      const r = matchCategory(item, rows);
      return r ? r.aisle || r.department : null;
    };
    for (const item of ['paper towels', 'coffee', 'peanut butter', 'cereal', 'shampoo']) assert.ok(where(item), `${s.name}: ${item}`);
    assert.equal(where('milk'), 'Dairy', s.name);
    assert.equal(where('bananas'), null, `${s.name}: fresh fruit is not sent to an aisle`);
  }
});

test("every Woodman's layout: aisle 1 on the produce side, frozen on the left wall, soda front-left, all walkable", () => {
  for (const plan of WOODMANS_PLANS) {
    const l = buildPlanLayout(plan);
    const w = l.grid.width;
    assert.ok(l.aisleCell(1).x > l.aisleCell(plan.aisles).x, plan.name);
    const firstFrozen = Number(Object.keys(plan.wallAisles!)[0]);
    assert.equal(cellForLocation(l, at(String(firstFrozen)))!.x, 1, `${plan.name}: frozen aisle ${firstFrozen}`);
    const a = cellForLocation(l, at('A'))!;
    const z = cellForLocation(l, at('Z'))!;
    assert.ok(a.x > z.x, `${plan.name}: A on the right`);
    const cells = [a, z, l.entrance, l.checkout, ...Object.values(l.departmentCell), ...Object.values(l.wallAisles ?? {}), ...Object.values(l.named ?? {})];
    for (const c of cells) assert.ok(l.grid.isWalkable(c), `${plan.name} ${JSON.stringify(c)}`);
    if (plan !== WOODMANS_MADISON_EAST) assert.ok(cellForLocation(l, at('33'))!.x < w / 3, `${plan.name}: soda aisles front-left`);
    const items = ['bananas', 'bread', 'milk', 'chicken'].map((n): ListItem => ({ id: n, name: n, checked: false, location: { kind: 'unknown' } }));
    items.push({ id: 'pasta', name: 'pasta', checked: false, location: at('10') }, { id: 'soap', name: 'soap', checked: false, location: at('N') });
    const r = planRoute(items, plan.aisles, { plan, coldLast: true });
    assert.equal(r.stops.flatMap((s) => s.items).length, items.length, plan.name);
    assert.deepEqual(r.path.at(-1), r.layout.checkout, plan.name);
  }
});

test('stores whose maps differ from the usual Woodman\'s plan', () => {
  const ap = buildPlanLayout(WOODMANS_APPLETON);
  assert.ok(ap.departmentCell.produce.y === 0, 'Appleton produce is up front by the checkouts');
  const me = buildPlanLayout(WOODMANS_MADISON_EAST);
  assert.ok(me.departmentCell.bakery.y > me.departmentCell.produce.y, 'Madison East bakery is at the back, produce in front');
  assert.ok(me.departmentCell.meat.x === me.grid.width - 2, 'Madison East meat is on the right wall');
});
