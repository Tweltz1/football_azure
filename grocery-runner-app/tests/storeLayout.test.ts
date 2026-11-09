import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyseFootprint, LatLon } from '../src/lib/footprint';
import { pickBuilding } from '../src/lib/osmBuilding';
import { astar } from '../src/lib/routing/astar';
import { buildGenericLayout } from '../src/lib/routing/layout';
import { planRoute } from '../src/lib/routing/planRoute';
import { buildProfile } from '../src/lib/storeProfile';
import { ListItem } from '../src/lib/types';

test('profile places a department when two of its items agree', () => {
  const p = buildProfile([
    { name: 'frozen peas', aisle: '30' },
    { name: 'ice cream', aisle: '31' },
    { name: 'milk', aisle: '32' },
    { name: 'yogurt', aisle: '32' },
    { name: 'pasta', aisle: '12' },
  ]);
  assert.equal(p.departmentAisle.frozen, 30);
  assert.equal(p.departmentAisle.dairy, 32);
  assert.equal(p.departmentAisle.pantry, undefined); // center aisles are never placed
  assert.equal(p.samples, 5);
});

test('profile ignores a single answer and scattered answers', () => {
  assert.deepEqual(buildProfile([{ name: 'ice cream', aisle: '7' }]).departmentAisle, {});
  const scattered = buildProfile([
    { name: 'milk', aisle: '2' },
    { name: 'cheese', aisle: '9' },
    { name: 'yogurt', aisle: '20' },
  ]);
  assert.equal(scattered.departmentAisle.dairy, undefined);
  // The same item twice counts once.
  assert.deepEqual(buildProfile([{ name: 'Milk', aisle: '4' }, { name: 'milk', aisle: '4' }]).departmentAisle, {});
});

test('profile reads letter aisles (Woodman\'s)', () => {
  const p = buildProfile([
    { name: 'frozen pizza', aisle: 'U' },
    { name: 'ice cream', aisle: 'U' },
  ]);
  assert.equal(p.departmentAisle.frozen, 21);
});

const item = (name: string, location: ListItem['location'] = { kind: 'unknown' }): ListItem => ({
  id: name,
  name,
  checked: false,
  location,
});

test('a guessed frozen item is routed to the aisle shoppers placed frozen in', () => {
  const profile = buildProfile([
    { name: 'frozen peas', aisle: '18' },
    { name: 'ice cream', aisle: '18' },
  ]);
  const r = planRoute([item('frozen waffles')], 20, { profile });
  assert.deepEqual(r.stops[0].cell, r.layout.aisleCell(18));
});

test('an aisle shoppers showed is frozen counts as cold for "cold last"', () => {
  const profile = buildProfile([
    { name: 'frozen peas', aisle: '3' },
    { name: 'ice cream', aisle: '3' },
  ]);
  const r = planRoute(
    [item('peas', { kind: 'aisle', aisle: '3', source: 'community' }), item('cereal', { kind: 'aisle', aisle: '15', source: 'community' })],
    20,
    { profile, coldLast: true },
  );
  assert.equal(r.stops.at(-1)!.items[0].name, 'peas');
});

test('a mirrored layout puts the entrance on the left and stays walkable', () => {
  const normal = buildGenericLayout(10);
  const L = buildGenericLayout(10, { mirror: true });
  assert.ok(L.entrance.x < L.grid.width / 2);
  assert.ok(normal.entrance.x > normal.grid.width / 2);
  for (let a = 1; a <= 10; a++) assert.ok(L.grid.isWalkable(L.aisleCell(a)) && astar(L.grid, L.entrance, L.aisleCell(a)));
  for (const cell of Object.values(L.departmentCell)) assert.ok(astar(L.grid, L.entrance, cell));
  assert.ok(astar(L.grid, L.entrance, L.checkout));
});

// A 100 m x 60 m box, front wall on the south side, around (43, -89).
const lat0 = 43;
const lon0 = -89;
const dLat = (m: number) => m / 110_540;
const dLon = (m: number) => m / (111_320 * Math.cos((lat0 * Math.PI) / 180));
const at = (east: number, north: number): LatLon => ({ lat: lat0 + dLat(north), lon: lon0 + dLon(east) });
const box = [at(0, 0), at(100, 0), at(100, 60), at(0, 60), at(0, 0)];

test('footprint: front wall from the parking lot, aisles from its width', () => {
  const parkingSouth = [at(0, -80), at(100, -80), at(100, -10), at(0, -10)];
  const info = analyseFootprint(box, [], parkingSouth)!;
  assert.equal(info.frontageM, 100);
  assert.equal(info.depthM, 60);
  assert.equal(info.entranceSide, null);
  assert.equal(info.aisleEstimate, 22); // (100 - 25) / 3.4

  // Parking on the east side makes the 60 m east wall the front.
  const parkingEast = [at(110, 0), at(180, 0), at(180, 60), at(110, 60)];
  assert.equal(analyseFootprint(box, [], parkingEast)!.frontageM, 60);
});

test('footprint: entrance side as seen from the parking lot', () => {
  // Facing north from the south lot, east is on the right.
  assert.equal(analyseFootprint(box, [at(90, 0)])!.entranceSide, 'right');
  assert.equal(analyseFootprint(box, [at(10, 0)])!.entranceSide, 'left');
  assert.equal(analyseFootprint(box, [at(50, 0)])!.entranceSide, 'center');
  // Front on the north wall (facing south): east is now on the left.
  assert.equal(analyseFootprint(box, [at(90, 60)])!.entranceSide, 'left');
});

test('pickBuilding takes the building the pin is in and its main entrance', () => {
  const shed = [at(120, 0), at(125, 0), at(125, 5), at(120, 5), at(120, 0)];
  const picked = pickBuilding(
    [
      { type: 'way', id: 1, tags: { building: 'retail' }, geometry: box },
      { type: 'way', id: 2, tags: { building: 'yes' }, geometry: shed },
      { type: 'node', id: 3, tags: { entrance: 'service' }, ...at(0, 30) },
      { type: 'node', id: 4, tags: { entrance: 'main' }, ...at(100, 0) },
      { type: 'node', id: 5, tags: { entrance: 'main' }, ...at(300, 300) }, // another building
    ],
    at(50, 30),
  )!;
  assert.equal(picked.outline, box);
  assert.equal(picked.entrances.length, 1);
  assert.equal(pickBuilding([], at(0, 0)), null);
});
