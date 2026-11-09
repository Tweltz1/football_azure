import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemKey as appItemKey } from '../src/lib/sharedAisles';
import { cleanAisle, cleanStoreKey, itemKey, tallyVotes, VoteRow } from '../supabase/functions/grocery-runner/votes';

const row = (item: string, aisle: string | null, department: string | null = null, at = '2026-11-01'): VoteRow => ({
  item_key: item,
  aisle,
  department,
  updated_at: at,
});

test('app and server normalise item names the same way', () => {
  for (const name of ['Peanut Butter!', '  2% milk ', 'Ben & Jerry’s', 'eggs (dozen)']) {
    assert.equal(appItemKey(name), itemKey(name));
  }
  assert.equal(itemKey('Peanut  Butter!'), 'peanut butter');
});

test('majority aisle wins', () => {
  const t = tallyVotes([row('milk', '12'), row('milk', '12'), row('milk', '4')]);
  assert.deepEqual(t.milk, { aisle: '12', department: undefined, votes: 2, total: 3 });
});

test('an aisle beats a department-only answer on a tie, and newer beats older', () => {
  assert.equal(tallyVotes([row('eggs', null, 'dairy'), row('eggs', '9')]).eggs.aisle, '9');
  const t = tallyVotes([row('rice', '3', null, '2026-10-01'), row('rice', '5', null, '2026-11-05')]);
  assert.equal(t.rice.aisle, '5');
});

test('aisle and store key validation', () => {
  assert.equal(cleanAisle('aisle 14'), '14');
  assert.equal(cleanAisle('a14'), 'A14');
  assert.equal(cleanAisle('<script>'), null);
  assert.equal(cleanAisle('x'.repeat(20)), null);
  assert.equal(cleanStoreKey('walmart:1234'), 'walmart:1234');
  assert.equal(cleanStoreKey('target:50309-main-st'), 'target:50309-main-st');
  assert.equal(cleanStoreKey('custom:my store'), null);
  assert.equal(cleanStoreKey('Walmart:1'), null);
});
