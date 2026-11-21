import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aisleChoices, needsAisle } from '../src/lib/aisleChoices';
import { ListItem } from '../src/lib/types';

const at = (name: string, aisle?: string): ListItem => ({
  id: name,
  name,
  checked: false,
  location: aisle ? { kind: 'aisle', aisle, source: 'community', votes: 2 } : { kind: 'unknown' },
});

test('only guessed places ask for an aisle', () => {
  assert.equal(needsAisle(at('paper towels')), true);
  assert.equal(needsAisle(at('milk', '3')), false);
  assert.equal(needsAisle({ ...at('dog food'), location: { kind: 'department', department: 'pet', source: 'guess' } }), true);
  assert.equal(needsAisle({ ...at('apples'), location: { kind: 'department', department: 'produce', source: 'user' } }), false);
});

test('offers the aisles around the neighbouring stops', () => {
  const stops = [{ items: [at('pasta', '7')] }, { items: [at('paper towels')] }, { items: [at('soap', '10')] }];
  assert.deepEqual(aisleChoices(stops, 1), ['6', '7', '8', '9', '10']);
});

test('one known neighbour gives it and the aisles on either side', () => {
  const stops = [{ items: [at('bananas')] }, { items: [at('dog food')] }, { items: [at('cat litter', 'A14')] }];
  assert.deepEqual(aisleChoices(stops, 1), ['13', '14', '15']);
});

test('no known neighbours, no choices', () => {
  assert.deepEqual(aisleChoices([{ items: [at('a')] }, { items: [at('b')] }], 0), []);
});
