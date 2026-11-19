import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capFirst, titleCase } from '../src/lib/caps';

test('titleCase capitalizes words but keeps small ones and acronyms', () => {
  assert.equal(titleCase('Chicken and broccoli stir-fry'), 'Chicken and Broccoli Stir-Fry');
  assert.equal(titleCase('Spaghetti with meat sauce'), 'Spaghetti with Meat Sauce');
  assert.equal(titleCase('BLTs with avocado'), 'BLTs with Avocado');
  assert.equal(titleCase('the best mac and cheese'), 'The Best Mac and Cheese');
  assert.equal(titleCase("Mom's pot roast"), "Mom's Pot Roast");
});

test('capFirst only touches the first letter', () => {
  assert.equal(capFirst('olive oil'), 'Olive oil');
  assert.equal(capFirst('2% milk'), '2% milk');
  assert.equal(capFirst('"fresh" basil'), '"Fresh" basil');
  assert.equal(capFirst('iPhone charger'), 'iPhone charger');
});

test('names like Caesar and Parmesan get capitals anywhere', () => {
  assert.equal(capFirst('caesar dressing'), 'Caesar dressing');
  assert.equal(capFirst('grated parmesan cheese'), 'Grated Parmesan cheese');
  assert.equal(capFirst('dijon mustard and monterey jack'), 'Dijon mustard and Monterey Jack');
});
