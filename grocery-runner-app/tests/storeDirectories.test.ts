import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { aisleTitle } from '../src/lib/routing/layout';
import { matchCategory, parseCsv } from '../supabase/functions/grocery-runner/partnerData';

const rows = parseCsv(readFileSync(new URL('../store/directories/woodmans-altoona.csv', import.meta.url), 'utf8'))
  .slice(1)
  .map(([category, aisle, department]) => ({ category, aisle, department }));
const where = (item: string) => {
  const r = matchCategory(item, rows);
  return r ? r.aisle || r.department : null;
};

test("Woodman's Altoona directory puts list items in its aisles", () => {
  const cases: [string, string | null][] = [
    ['paper towels', '2'],
    ['toilet paper', '2'],
    ['trash bags', '3'],
    ['laundry detergent', '18'],
    ['dish soap', '18'],
    ['diapers', '1'],
    ['dog food', '20'],
    ['cat litter', 'X'],
    ['toothpaste', 'U'],
    ['shampoo', 'R'],
    ['vitamins', 'L'],
    ['coffee', '16'],
    ['peanut butter', '5'],
    ['frozen pizza', '23'],
    ['canned tomatoes', '9'],
    ['spaghetti sauce', '10'],
    ['milk', 'Dairy'],
    ['cheese', 'Dairy'],
    ['butter', 'Dairy'],
    // fresh food is not sent to a canned or frozen aisle
    ['tomatoes', null],
    ['potatoes', null],
    ['salmon', null],
    ['oranges', null],
  ];
  for (const [item, aisle] of cases) assert.equal(where(item), aisle, item);
});

test('every directory line is a usable aisle or department', () => {
  for (const r of rows) assert.ok(/^[A-Z0-9][A-Z0-9 -]{0,11}$/.test(r.aisle) || r.department, r.category);
});

test('aisle titles', () => {
  assert.equal(aisleTitle('14'), 'Aisle 14');
  assert.equal(aisleTitle('J'), 'Aisle J');
  assert.equal(aisleTitle('A14'), 'Aisle A14');
  assert.equal(aisleTitle('SODA'), 'Soda');
  assert.equal(aisleTitle('Front'), 'Front');
});
