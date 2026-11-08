// Talk Shops how-to assistant: `node --test supabase/tests/shopHowTo.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import type { Narrator } from '../functions/_shared/dnd.ts';
import { clearHowToLimits, howToPrompt, howToRoute, HOWTO_PER_HOUR, vehicleLabel } from '../functions/_shared/shopHowTo.ts';

let clock = Date.parse('2026-11-08T00:00:00Z');
const ctx = { userId: 'u1', now: () => new Date(clock), log: { info() {}, warn() {}, error() {} } } as unknown as Ctx;
const fake = (reply: string | Error) => {
  const calls: { system: string; prompt: string }[] = [];
  const narrator: Narrator = { async complete(req) { calls.push(req); if (reply instanceof Error) throw reply; return reply; } };
  return { narrator, calls };
};
const ask = (n: Narrator | null, body: unknown, shop = 's1') => { clock += 2000; return howToRoute(ctx, n, shop, 'POST', body); };

const good = JSON.stringify({
  answer: 'About 30 minutes.', steps: ['Lift the car', 'Drain the oil', ''], tools: ['15 mm wrench'], parts: ['5 qt 5W-20'],
  specs: ['Drain plug: typically 25 ft-lb (verify)'], safety: ['Use jack stands'], ideas: ['a', 'b', 'c', 'd'],
});

test('answers with steps, tools, parts, specs and safety for the vehicle', async () => {
  clearHowToLimits();
  const { narrator, calls } = fake(good);
  const res = await ask(narrator, { question: 'oil change', vehicle: { year: '2016', make: 'Honda', model: 'Civic', engine: '2.0L' }, history: [{ q: 'hi', a: 'hello' }] });
  assert.equal(res.status, 200);
  const b = res.body as Record<string, unknown>;
  assert.deepEqual(b.steps, ['Lift the car', 'Drain the oil']);
  assert.deepEqual(b.ideas, ['a', 'b', 'c']);
  assert.equal(b.vehicle, '2016 Honda Civic 2.0L');
  assert.match(calls[0].prompt, /Vehicle: 2016 Honda Civic 2\.0L/);
  assert.match(calls[0].prompt, /Tech: hi/);
  assert.match(calls[0].system, /manufacturer|service info/i);
});

test('passes along part numbers, cleaned up, and an empty list when there are none', async () => {
  clearHowToLimits();
  const withParts = JSON.stringify({ ...JSON.parse(good), partNumbers: [
    { part: 'Oil filter', brand: 'Honda', number: '15400-PLM-A02 <b>', note: '' },
    { part: 'Drain plug washer', brand: '', number: '', note: 'Check size' }, { brand: 'x', number: '1' }] });
  const b = (await ask(fake(withParts).narrator, { question: 'oil change', vehicle: { year: '2016', make: 'Honda', model: 'Civic' } })).body as Record<string, unknown>;
  assert.deepEqual(b.partNumbers, [
    { part: 'Oil filter', brand: 'Honda', number: '15400-PLM-A02 b', note: '' },
    { part: 'Drain plug washer', brand: '', number: '', note: 'Check size' }]);
  const none = (await ask(fake(good).narrator, { question: 'oil change' })).body as Record<string, unknown>;
  assert.deepEqual(none.partNumbers, []);
});

test('rejects empty questions, other methods, and works without a vehicle', async () => {
  clearHowToLimits();
  assert.equal((await ask(fake(good).narrator, { question: ' ' })).status, 400);
  assert.equal((await howToRoute(ctx, fake(good).narrator, 's1', 'GET', null)).status, 405);
  assert.match(howToPrompt({ question: 'x' }), /not given/);
  assert.equal(vehicleLabel(null), '');
});

test('reports setup, failures and bad replies without crashing', async () => {
  clearHowToLimits();
  assert.equal((await ask(null, { question: 'brake pads' })).status, 503);
  assert.equal((await ask(fake(new Error('down')).narrator, { question: 'brake pads' })).status, 502);
  assert.equal((await ask(fake('not json').narrator, { question: 'brake pads' })).status, 502);
  assert.equal((await ask(fake('{"answer":""}').narrator, { question: 'brake pads' })).status, 502);
});

test('limits each shop per hour', async () => {
  clearHowToLimits();
  const { narrator } = fake(good);
  for (let i = 0; i < HOWTO_PER_HOUR; i++) assert.equal((await ask(narrator, { question: 'oil change' })).status, 200);
  assert.equal((await ask(narrator, { question: 'oil change' })).status, 429);
  assert.equal((await ask(narrator, { question: 'oil change' }, 's2')).status, 200);
});
