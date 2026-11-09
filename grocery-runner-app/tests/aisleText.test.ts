import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findAisles, matchAisles, nameMatches } from '../src/lib/aisleText';
import { parseAisleNumber } from '../src/lib/routing/layout';
import { ListItem } from '../src/lib/types';

const line = (text: string, y: number) => ({ text, x: 0.05, y, width: 0.8, height: 0.03 });
const item = (name: string): ListItem => ({ id: name, name, checked: false, location: { kind: 'unknown' } });

test('Walmart product page: aisle and section', () => {
  const found = findAisles([
    line('Great Value Whole Vitamin D Milk, 1 Gallon', 0.2),
    line('$3.12', 0.25),
    line('Aisle A38', 0.6),
    line('Section 3', 0.63),
  ]);
  assert.deepEqual(found.map((f) => [f.aisle, f.bay]), [['A38', 3]]);
  assert.ok(found[0].context.includes('Milk'));
});

test("Woodman's: letter aisle with shelf", () => {
  const found = findAisles([line('Crest Cavity Protection Toothpaste 5.7 oz', 0.3), line('Aisle U - Shelf A02', 0.4)]);
  assert.equal(found[0].aisle, 'U');
  assert.equal(found[0].bay, undefined);
});

test('ignores words that only look like aisles', () => {
  assert.deepEqual(findAisles([line('Aisle unavailable', 0.1), line('See aisle info', 0.2)]), []);
});

test('search results: each aisle goes with its own product card', () => {
  const lines = [
    line('Bananas, each', 0.1),
    line('Aisle A2', 0.15),
    line('Cheerios Cereal 18 oz', 0.3),
    line('Aisle A12 Section 4', 0.35),
    line('Whole Milk Gallon', 0.5),
    line('Aisle A38', 0.55),
  ];
  const found = findAisles(lines);
  const list = [item('milk'), item('banana'), item('cheerios'), item('bread')];
  const m = matchAisles(found, list);
  assert.deepEqual(
    m.map((x) => [x.item.name, x.aisle, x.bay]).sort(),
    [['banana', 'A2', undefined], ['cheerios', 'A12', 4], ['milk', 'A38', undefined]],
  );
});

test('opened from one item, the first aisle goes to that item even without a name match', () => {
  const found = findAisles([line('Crest 3D White', 0.2), line('Aisle U - Shelf A02', 0.3)]);
  const m = matchAisles(found, [], item('toothpaste'));
  assert.deepEqual(m.map((x) => [x.item.name, x.aisle]), [['toothpaste', 'U']]);
});

test('name matching handles plurals and extra words', () => {
  assert.ok(nameMatches('eggs', 'Great Value Large White Egg, 12 count'));
  assert.ok(nameMatches('peanut butter', 'Jif Creamy Peanut Butter 16 oz'));
  assert.ok(!nameMatches('almond milk', 'Whole Milk Gallon'));
});

test('letter aisles get a place on the map', () => {
  assert.equal(parseAisleNumber('U'), 21);
  assert.equal(parseAisleNumber('A38'), 38);
  assert.equal(parseAisleNumber('BB'), 28);
  assert.equal(parseAisleNumber('Front'), null);
});
