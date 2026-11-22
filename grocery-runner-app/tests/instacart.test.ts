import assert from 'node:assert/strict';
import { test } from 'node:test';
import { instacartBody, listKey, parseAmount } from '../supabase/functions/grocery-runner/instacartList';

test('amounts become Instacart measurements', () => {
  assert.deepEqual(parseAmount('2 cups'), { quantity: 2, unit: 'cup' });
  assert.deepEqual(parseAmount('1 1/2 lb'), { quantity: 1.5, unit: 'pound' });
  assert.deepEqual(parseAmount('1 ½ tbsp.'), { quantity: 1.5, unit: 'tablespoon' });
  assert.deepEqual(parseAmount('¾ cup'), { quantity: 0.75, unit: 'cup' });
  assert.deepEqual(parseAmount('3'), { quantity: 3, unit: 'each' });
  assert.deepEqual(parseAmount('2 (15 oz) cans'), { quantity: 2, unit: 'can' });
  assert.equal(parseAmount('a pinch'), null);
  assert.equal(parseAmount('2 handfuls'), null);
  assert.equal(parseAmount(undefined), null);
});

test('the request body keeps names, drops repeats, and shows the amount', () => {
  const body = instacartBody([{ name: 'Milk' }, { name: 'flour', amount: '2 cups' }, { name: 'milk' }, { name: '  ' }]);
  assert.equal(body.link_type, 'shopping_list');
  assert.equal(body.line_items.length, 2);
  assert.deepEqual(body.line_items[0], { name: 'Milk', display_text: 'Milk' });
  assert.deepEqual(body.line_items[1], {
    name: 'flour',
    display_text: 'flour (2 cups)',
    line_item_measurements: [{ quantity: 2, unit: 'cup' }],
  });
  assert.ok(body.landing_page_configuration.partner_linkback_url.startsWith('https://weltzcraft.com/'));
});

test('list key ignores order and case', () => {
  assert.equal(listKey([{ name: 'Eggs' }, { name: 'milk' }]), listKey([{ name: 'MILK' }, { name: 'eggs' }]));
  assert.notEqual(listKey([{ name: 'eggs' }]), listKey([{ name: 'eggs', amount: '12' }]));
});
