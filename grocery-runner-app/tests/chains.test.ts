import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chainOf, metresBetween, placeStoreKey } from '../src/lib/chainMatch';
import { mergeStores } from '../src/lib/mergeStores';
import { cleanStoreKey } from '../supabase/functions/grocery-runner/votes';

test('recognises supported chains from Apple Maps place names', () => {
  assert.equal(chainOf('Walmart Supercenter'), 'walmart');
  assert.equal(chainOf("Woodman's Market"), 'woodmans');
  assert.equal(chainOf('Woodmans Food Market'), 'woodmans');
  assert.equal(chainOf('ALDI'), 'aldi');
  assert.equal(chainOf('Hy-Vee'), 'hyvee');
  assert.equal(chainOf('Target'), 'target');
  assert.equal(chainOf('Costco Wholesale'), 'costco');
  assert.equal(chainOf('Pick ’n Save'), 'kroger');
  assert.equal(chainOf("Mariano's"), 'kroger');
  assert.equal(chainOf("Sam's Club"), null);
  assert.equal(chainOf('Costco Gas Station'), null);
  assert.equal(chainOf('Walmart Pharmacy'), null);
  assert.equal(chainOf('Joe’s Corner Market'), null);
});

test('place store keys are stable and pass the server key check', () => {
  const key = placeStoreKey('woodmans', 43.07312, -89.40118);
  assert.equal(key, 'woodmans:g43073xm89401');
  assert.equal(placeStoreKey('woodmans', 43.07349, -89.40101), key); // same store, slightly different pin
  assert.equal(cleanStoreKey(key), key);
});

test('distance helper', () => {
  const d = metresBetween({ lat: 43, lon: -89 }, { lat: 43.01, lon: -89 });
  assert.ok(d > 1100 && d < 1120, String(d));
});

test('official Kroger and Walmart stores replace the matching Apple Maps place', () => {
  const places = [
    { name: "Pick 'n Save", latitude: 43.0700, longitude: -89.4000, address: '1 Main' },
    { name: 'Walmart Supercenter', latitude: 43.1000, longitude: -89.3000, address: '2 Main' },
    { name: 'Aldi', latitude: 43.0500, longitude: -89.4500, address: '3 Main' },
    { name: 'ALDI', latitude: 43.0501, longitude: -89.4501, address: '3 Main' }, // same store, second search
    { name: 'Shell', latitude: 43.0, longitude: -89.0, address: '' },
  ];
  const official = [
    { key: 'kroger:00100123', chain: 'kroger' as const, name: "Pick 'n Save", address: '1 Main St', lat: 43.0701, lon: -89.4001 },
  ];
  const stores = mergeStores(places, official);
  assert.deepEqual(stores.map((s) => s.key).sort(), ['aldi:g43050xm89450', 'kroger:00100123', 'walmart:g43100xm89300']);
  assert.equal(stores.find((s) => s.chain === 'kroger')!.coverage, 'kroger');
});
