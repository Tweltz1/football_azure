import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chainOf } from '../src/lib/chainMatch';
import { isKrogerStore, remember, splitFresh, stockFor, stockText } from '../src/lib/stock';
import type { StockCheck } from '../src/lib/storePick';

const check = (item: string, stock: StockCheck['stock'], price: number | null = null): StockCheck => ({
  item,
  product: null,
  stock,
  price,
  aisle: null,
});

test('Wisconsin Kroger banners count as Kroger stores', () => {
  assert.equal(chainOf("Pick 'n Save"), 'kroger');
  assert.equal(chainOf('Metro Market'), 'kroger');
  assert.equal(chainOf("Mariano's"), 'kroger');
});

test('stock is only checked at official Kroger store ids', () => {
  assert.equal(isKrogerStore({ id: 'kroger:01400943', chain: 'kroger', name: "Pick 'n Save", aisleCount: 24 }), true);
  assert.equal(isKrogerStore({ id: 'woodmans:g1', chain: 'woodmans', name: "Woodman's", aisleCount: 30 }), false);
  assert.equal(isKrogerStore(null), false);
});

test('stock wording', () => {
  assert.deepEqual(stockText(check('milk', 'high', 3.49)), { text: 'In stock · $3.49', tone: 'good' });
  assert.deepEqual(stockText(check('milk', 'low')), { text: 'Running low here', tone: 'warn' });
  assert.deepEqual(stockText(check('milk', 'out', 2)), { text: 'Out of stock at this store', tone: 'bad' });
  assert.equal(stockText(check('milk', 'unknown')), null);
  assert.equal(stockText(undefined), null);
});

test('saved answers are reused for a while, per store, and each item is asked once', () => {
  const store = 'kroger:test1';
  const now = 1_000_000;
  remember(store, [check('Milk', 'high')], now);
  const fresh = splitFresh(store, ['milk', 'eggs', 'Eggs'], now + 60_000);
  assert.deepEqual(fresh.ask, ['eggs']);
  assert.equal(stockFor(fresh.have, 'MILK')?.stock, 'high');
  assert.deepEqual(splitFresh('kroger:other', ['milk'], now).ask, ['milk']);
  assert.deepEqual(splitFresh(store, ['milk'], now + 60 * 60_000).ask, ['milk']);
});
