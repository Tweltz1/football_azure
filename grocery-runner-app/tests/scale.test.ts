import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseServings, niceNumber, scaleAmount } from '../src/lib/scale';

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
