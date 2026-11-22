import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailHtml } from '../functions/_shared/shopEmail.ts';

test('email page: the link becomes a button, its lead-in is dropped, and text is escaped', () => {
  const link = 'https://talkshops.app/?c=abc';
  const html = emailHtml(`Hi Sam, <b>we</b> have your car.\n\nRepair details: ${link}`, { fromName: 'Ridge "Auto" <x>', button: { label: 'See your vehicle page', url: link }, footer: 'Reply to reach the shop.' });
  assert.match(html, /Hi Sam, &lt;b&gt;we&lt;\/b&gt; have your car\.<\/td>/);
  assert.ok(!html.includes('Repair details'));
  assert.equal(html.split(link).length, 2, 'the link appears once, on the button');
  assert.match(html, />See your vehicle page<\/a>/);
  assert.match(html, /Ridge Auto x<\/td>/);
  assert.match(html, /Reply to reach the shop\.<br>Sent with Talk Shops/);
});

test('email page: no link means no button', () => {
  const html = emailHtml('Your Talk Shops code is 123456.');
  assert.ok(!html.includes('<a '));
  assert.match(html, />Talk Shops<\/td>/);
});
