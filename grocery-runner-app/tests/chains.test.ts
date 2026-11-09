import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chainOf, osmStoreKey } from '../supabase/functions/grocery-runner/chains';
import { cleanStoreKey } from '../supabase/functions/grocery-runner/votes';

test('recognises supported chains from OpenStreetMap tags', () => {
  assert.equal(chainOf({ brand: 'Walmart', name: 'Walmart Supercenter' }), 'walmart');
  assert.equal(chainOf({ name: "Woodman's Market" }), 'woodmans');
  assert.equal(chainOf({ name: 'Woodmans Food Market' }), 'woodmans');
  assert.equal(chainOf({ brand: 'Aldi', name: 'ALDI' }), 'aldi');
  assert.equal(chainOf({ brand: 'Hy-Vee' }), 'hyvee');
  assert.equal(chainOf({ name: 'Target' }), 'target');
  assert.equal(chainOf({ brand: 'Costco' }), 'costco');
  assert.equal(chainOf({ name: 'Pick ’n Save' }), 'kroger');
  assert.equal(chainOf({ name: "Mariano's" }), 'kroger');
  assert.equal(chainOf({ name: "Sam's Club" }), null);
  assert.equal(chainOf({ name: 'Joe’s Corner Market' }), null);
});

test('OSM store keys pass the server key check', () => {
  const key = osmStoreKey('woodmans', 'way', 123456789);
  assert.equal(key, 'woodmans:osm-w123456789');
  assert.equal(cleanStoreKey(key), key);
});
