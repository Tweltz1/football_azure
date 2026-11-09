import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MapStore } from '../src/lib/mergeStores';
import { newItems, SUGGESTED } from '../src/lib/recipes';
import { candidates, estimate, missing, rankOptions, StockCheck } from '../src/lib/storePick';

test('suggested recipes have unique ids and something to buy', () => {
  assert.equal(new Set(SUGGESTED.map((r) => r.id)).size, SUGGESTED.length);
  for (const r of SUGGESTED) assert.ok(r.items.some((i) => !i.pantry), r.title);
});

test('recipe items skip what is already on the list and repeats', () => {
  assert.deepEqual(newItems(['Ground beef', 'milk', 'ground  beef!', 'eggs', ' '], ['MILK']), ['Ground beef', 'eggs']);
});

const sc = (item: string, stock: StockCheck['stock'], price: number | null = null): StockCheck => ({
  item,
  product: item,
  stock,
  price,
  aisle: stock === 'unknown' ? null : '7',
});

const store = (key: string, chain: MapStore['chain'], lat: number, coverage: MapStore['coverage'] = 'shared'): MapStore => ({
  key,
  chain,
  name: key,
  address: '',
  lat,
  lon: -89.4,
  coverage,
  items: 0,
});

test('a nearby Kroger with everything in stock beats a closer store without stock data', () => {
  const ranked = rankOptions([
    { store: store('walmart:1', 'walmart', 43), miles: 0.5, items: 3, mapped: 3 },
    { store: store('kroger:1', 'kroger', 43, 'kroger'), miles: 2, items: 3, mapped: 3, stock: [sc('a', 'high'), sc('b', 'low'), sc('c', 'high')] },
  ]);
  assert.equal(ranked[0].store.key, 'kroger:1');
});

test('a Kroger missing most items loses to a closer store', () => {
  const ranked = rankOptions([
    { store: store('kroger:1', 'kroger', 43, 'kroger'), miles: 3, items: 4, mapped: 1, stock: [sc('a', 'high'), sc('b', 'out'), sc('c', 'out'), sc('d', 'out')] },
    { store: store('aldi:1', 'aldi', 43), miles: 1, items: 4, mapped: 0 },
  ]);
  assert.equal(ranked[0].store.key, 'aldi:1');
  assert.deepEqual(missing(ranked[1].stock!), ['b', 'c', 'd']);
});

test('estimate adds known prices of items that are not out of stock', () => {
  assert.deepEqual(estimate([sc('a', 'high', 2.5), sc('b', 'out', 9), sc('c', 'low', 1.25), sc('d', 'high')]), { total: 3.75, priced: 2 });
  assert.equal(estimate([sc('a', 'high')]), null);
});

test('compares the closest official Kroger stores and the closest store of each other chain', () => {
  const at = { lat: 43, lon: -89.4 };
  const stores = [
    store('kroger:a', 'kroger', 43.01, 'kroger'),
    store('kroger:b', 'kroger', 43.02, 'kroger'),
    store('kroger:c', 'kroger', 43.03, 'kroger'),
    store('kroger:d', 'kroger', 43.04, 'kroger'),
    store('kroger:g1', 'kroger', 43.001), // Apple Maps only: no stock check, counts as a shared store
    store('walmart:near', 'walmart', 43.005),
    store('walmart:far', 'walmart', 43.05),
    store('target:way-off', 'target', 44), // ~69 miles
  ];
  const { kroger, others } = candidates(stores, at);
  assert.deepEqual(kroger.map((s) => s.store.key), ['kroger:a', 'kroger:b', 'kroger:c']);
  assert.deepEqual(others.map((s) => s.store.key), ['kroger:g1', 'walmart:near']);
});
