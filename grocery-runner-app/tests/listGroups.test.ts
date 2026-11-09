import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupList } from '../src/lib/listGroups';
import { planRoute } from '../src/lib/routing/planRoute';
import { parseRecipePage } from '../src/lib/recipeText';
import { ListItem } from '../src/lib/types';

const item = (name: string, aisle?: string, checked = false): ListItem => ({
  id: name,
  name,
  checked,
  location: aisle ? { kind: 'aisle', aisle, source: 'user' } : { kind: 'unknown' },
});

test('list groups: fresh departments, then aisles in number order, then cold, then checked off', () => {
  const sections = groupList([
    item('milk'),
    item('cereal', '12'),
    item('bananas'),
    item('soup', '3'),
    item('frozen peas'),
    item('ground beef'),
    item('crackers', '12'),
    item('bread', undefined, true),
  ]);
  assert.deepEqual(
    sections.map((s) => [s.title, s.data.map((i) => i.name)]),
    [
      ['Produce', ['bananas']],
      ['Meat & Seafood', ['ground beef']],
      ['Aisle 3', ['soup']],
      ['Aisle 12', ['cereal', 'crackers']],
      ['Frozen', ['frozen peas']],
      ['Dairy', ['milk']],
      ['Checked off', ['bread']],
    ],
  );
});

test('a typo aisle number does not blow up the store map', () => {
  const small = planRoute([item('soup', '3')], 20);
  const typo = planRoute([item('soup', '3'), item('jam', '2026')], 20);
  assert.equal(typo.layout.aisleCount, small.layout.aisleCount);
});

test('page titles keep hyphenated words', () => {
  const r = parseRecipePage('<title>Chicken Stir-Fry - Easy Dinners | Site</title><ul><li>1 lb chicken</li></ul>');
  assert.equal(r.title, 'Chicken Stir-Fry');
});
