import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeStoreKey } from '../src/lib/chainMatch';
import {
  cleanDealRows,
  cleanLayoutRows,
  findPartner,
  keyPosition,
  matchCategory,
  matchDeals,
  parseDate,
  parseDeals,
  parseLayout,
} from '../supabase/functions/grocery-runner/partnerData';

const TODAY = '2026-11-09';

test('layout: header row with category and aisle', () => {
  const { rows, skipped } = parseLayout('Category,Aisle\nCereal,7\n"Peanut butter, jelly",4\nBananas,Produce\n');
  assert.deepEqual(rows, [
    { category: 'Cereal', aisle: '7' },
    { category: 'Peanut butter, jelly', aisle: '4' },
    { category: 'Bananas', department: 'produce' },
  ]);
  assert.deepEqual(skipped, []);
});

test('layout: one aisle per line, many categories', () => {
  const { rows } = parseLayout('Aisle 7: cereal, oatmeal, Pop-Tarts\n12 - frozen pizza; ice cream\nProduce: apples');
  assert.deepEqual(rows, [
    { category: 'cereal', aisle: '7' },
    { category: 'oatmeal', aisle: '7' },
    { category: 'Pop-Tarts', aisle: '7' },
    { category: 'frozen pizza', aisle: '12' },
    { category: 'ice cream', aisle: '12' },
    { category: 'apples', department: 'produce' },
  ]);
});

test('layout: category then aisle, letter aisles, skipped lines', () => {
  const { rows, skipped } = parseLayout('Soup,A14\nRice,U\nIce cream,Frozen,12\nhello there');
  assert.deepEqual(rows, [
    { category: 'Soup', aisle: 'A14' },
    { category: 'Rice', aisle: 'U' },
    { category: 'Ice cream', aisle: '12', department: 'frozen' },
  ]);
  assert.deepEqual(skipped, ['hello there']);
});

test('deals: with and without a header, default one week', () => {
  const a = parseDeals('Item,Price,Ends\nCheerios 12 oz,$2.99,11/15\nBananas,49¢/lb,', TODAY);
  assert.deepEqual(a.rows, [
    { item: 'Cheerios 12 oz', price: '$2.99', ends: '2026-11-15' },
    { item: 'Bananas', price: '49¢/lb', ends: '2026-11-15' },
  ]);
  const b = parseDeals('Chicken breast,"2 for $5",Nov 20\nMilk,$3,not a date', TODAY);
  assert.deepEqual(b.rows, [{ item: 'Chicken breast', price: '2 for $5', ends: '2026-11-20' }]);
  assert.equal(b.skipped.length, 1);
  assert.equal(parseDate('2/30', TODAY), null);
  assert.equal(parseDate('2026-12-01', TODAY), '2026-12-01');
});

test('category matching prefers the most specific full match', () => {
  const rows = [
    { category: 'Pizza', aisle: '3' },
    { category: 'Frozen pizza', aisle: '12' },
    { category: 'Peanut butter & jelly', aisle: '4' },
    { category: 'Tomatoes', department: 'produce' },
  ];
  assert.equal(matchCategory('DiGiorno frozen pizza', rows)?.aisle, '12');
  assert.equal(matchCategory('pizza', rows)?.aisle, '3');
  assert.equal(matchCategory('peanut butter', rows)?.aisle, '4');
  assert.equal(matchCategory('butter', rows), null);
  assert.equal(matchCategory('tomato', rows)?.department, 'produce');
});

test('deals match list items both ways, ignoring sizes', () => {
  const deals = [{ item: 'Cheerios 12 oz' }, { item: 'Boneless chicken breasts' }, { item: 'Eggs' }];
  const m = matchDeals(['cheerios', 'chicken breast', 'a dozen eggs', 'soap'], deals);
  assert.deepEqual(Object.keys(m).sort(), ['a dozen eggs', 'cheerios', 'chicken breast']);
  assert.equal(m['chicken breast'].item, 'Boneless chicken breasts');
});

test('a partner store is found from the app store key', () => {
  const key = placeStoreKey('woodmans', 44.8121, -91.4472);
  assert.deepEqual(keyPosition(key), { chain: 'woodmans', lat: 44.812, lon: -91.447 });
  const partners = [
    { id: 'a', name: "Woodman's Altoona", chain: 'woodmans', lat: 44.8125, lon: -91.4468, store_key: null },
    { id: 'b', name: 'Aldi', chain: 'aldi', lat: 44.8121, lon: -91.4472, store_key: null },
    { id: 'c', name: 'Kroger 1', chain: 'kroger', lat: null, lon: null, store_key: 'kroger:01400943' },
  ];
  assert.equal(findPartner(key, partners)?.id, 'a');
  assert.equal(findPartner(placeStoreKey('woodmans', 44.83, -91.4472), partners), null);
  assert.equal(findPartner('kroger:01400943', partners)?.id, 'c');
});

test('JSON rows are checked like CSV', () => {
  assert.deepEqual(cleanLayoutRows([{ category: 'Cereal', aisle: 'Aisle 7' }, { category: 'Bread', department: 'Bakery' }]), [
    { category: 'Cereal', aisle: '7' },
    { category: 'Bread', department: 'bakery' },
  ]);
  assert.equal(cleanLayoutRows([{ category: 'Cereal' }]), null);
  assert.equal(cleanLayoutRows([{ category: 'Cereal', aisle: '<script>' }]), null);
  assert.deepEqual(cleanDealRows([{ item: 'Milk', price: 2.5, ends: '11/12' }], TODAY), [
    { item: 'Milk', price: '2.5', ends: '2026-11-12' },
  ]);
});
