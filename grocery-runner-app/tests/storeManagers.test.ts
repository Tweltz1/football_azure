import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outText, shortDate } from '../src/lib/deals';
import {
  cleanEmail,
  cleanNotice,
  cleanPhone,
  isWorkEmail,
  matchOuts,
} from '../supabase/functions/grocery-runner/partnerData';

test('work email: chain domain and its subdomains only', () => {
  assert.equal(isWorkEmail('walmart', 'jane@walmart.com'), true);
  assert.equal(isWorkEmail('walmart', 'jane@store1234.walmart.com'), true);
  assert.equal(isWorkEmail('walmart', 'jane@notwalmart.com'), false);
  assert.equal(isWorkEmail('walmart', 'jane@gmail.com'), false);
  assert.equal(isWorkEmail('target', 'jane@walmart.com'), false);
  assert.equal(isWorkEmail('woodmans', 'mgr@woodmans-food.com'), true);
});

test('emails and phone numbers are cleaned', () => {
  assert.equal(cleanEmail(' Jane@Walmart.COM '), 'jane@walmart.com');
  assert.equal(cleanEmail('not an email'), null);
  assert.equal(cleanPhone('(715) 555-0100'), '715-555-0100');
  assert.equal(cleanPhone('+1 715 555 0100'), '715-555-0100');
  assert.equal(cleanPhone('555-0100'), null);
});

test('notice keeps up to 3 lines and 280 characters', () => {
  assert.equal(cleanNotice('  Open 7-9 on Thanksgiving \r\n\r\n Pharmacy closed  \n'), 'Open 7-9 on Thanksgiving\nPharmacy closed');
  assert.equal(cleanNotice('a\nb\nc\nd'), 'a\nb\nc');
  assert.equal(cleanNotice('x'.repeat(400)).length, 280);
  assert.equal(cleanNotice(42), '');
});

test('out of stock only matches the same item, not a related one', () => {
  const outs = [{ item: 'Milk' }, { item: 'Cheerios 12 oz' }, { item: 'eggs' }];
  const got = matchOuts(['milk', 'almond milk', 'cheerios', 'egg', 'bread'], outs);
  assert.deepEqual(Object.keys(got).sort(), ['cheerios', 'egg', 'milk']);
  assert.equal(got.milk.item, 'Milk');
  assert.deepEqual(matchOuts(['milk'], [{ item: 'Almond milk' }]), {});
});

test('out of stock wording for the list', () => {
  assert.equal(shortDate('2026-11-30'), 'Nov 30');
  assert.equal(shortDate(undefined), null);
  assert.equal(outText({ item: 'Milk', until: '2026-12-02' }), 'Out of stock here · back by Dec 2');
  assert.equal(outText({ item: 'Milk' }), 'Out of stock here');
});
