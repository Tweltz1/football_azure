import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAmounts, baseServings, niceNumber, scaleAmount } from '../src/lib/scale';

test('reads the servings number', () => {
  assert.equal(baseServings('4 servings'), 4);
  assert.equal(baseServings('Serves 6'), 6);
  assert.equal(baseServings('5'), 5);
  assert.equal(baseServings(''), null);
});

test('kitchen-friendly numbers', () => {
  assert.equal(niceNumber(1.5), '1 1/2');
  assert.equal(niceNumber(1 / 3), '1/3');
  assert.equal(niceNumber(0.25), '1/4');
  assert.equal(niceNumber(3), '3');
  assert.equal(niceNumber(0.99), '1');
});

test('scales the leading amount only', () => {
  assert.equal(scaleAmount('2 (15 oz) cans', 2), '4 (15 oz) cans');
  assert.equal(scaleAmount('1 1/2 teaspoons', 2), '3 teaspoons');
  assert.equal(scaleAmount('1/2 cup', 0.5), '1/4 cup');
  assert.equal(scaleAmount('2-3 cloves', 2), '4-6 cloves');
  assert.equal(scaleAmount('a pinch', 3), '3 pinch');
  assert.equal(scaleAmount('1 lb', 1.5), '1 1/2 lb');
  assert.equal(scaleAmount('to taste', 2), 'to taste');
  assert.equal(scaleAmount('', 2), '');
});

test('addAmounts adds up the same thing across recipes', () => {
  assert.equal(addAmounts(['1.5 lb', '1 lb']), '2 1/2 lb');
  assert.equal(addAmounts(['1', '1', '']), '2');
  assert.equal(addAmounts(['3 cloves', '4 cloves']), '7 cloves');
  assert.equal(addAmounts(['2 cups', '1 can']), '2 cups + 1 can');
  assert.equal(addAmounts(['for serving', '']), 'for serving');
  assert.equal(addAmounts(['2', 'for garnish']), '2');
});
