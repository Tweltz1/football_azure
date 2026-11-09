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
    { part: 'Oil filter', brand: 'Honda', number: '15400-PLM-A02 <b>', altBrand: 'Wix', altNumber: '51356', note: '' },
    { part: 'Drain plug washer', brand: '', number: '', note: 'Check size' }, { brand: 'x', number: '1' }] });
  const b = (await ask(fake(withParts).narrator, { question: 'oil change', vehicle: { year: '2016', make: 'Honda', model: 'Civic' } })).body as Record<string, unknown>;
  assert.deepEqual(b.partNumbers, [
    { part: 'Oil filter', brand: 'Honda', number: '15400-PLM-A02 b', altBrand: 'Wix', altNumber: '51356', note: '' },
    { part: 'Drain plug washer', brand: '', number: '', altBrand: '', altNumber: '', note: 'Check size' }]);
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

// ---- Saved answers ----
import { questionKey, vehicleKey, type HowToLibrary, type SavedAnswer } from '../functions/_shared/shopHowTo.ts';

const memLib = () => {
  const rows: SavedAnswer[] = []; const tips: { answerId: string; shopId: string; text: string; createdAt: string }[] = [];
  let n = 0;
  const lib: HowToLibrary = {
    async candidates(mm, { qKey, shopId, since, limit }) {
      return rows.filter((r) => r.makeModel === mm && !r.retired && r.createdAt >= since && (!qKey || r.qKey === qKey) && (!shopId || r.shopId === shopId)).slice(-limit).reverse().map((r) => structuredClone(r));
    },
    async get(id) { const r = rows.find((x) => x.id === id); return r ? structuredClone(r) : null; },
    async save(r) { const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; rows.push({ ...structuredClone(r), id, createdAt: new Date(clock).toISOString() }); return id; },
    async update(id, p) { Object.assign(rows.find((x) => x.id === id)!, structuredClone(p)); },
    async tips(id, shop) { return tips.filter((t) => t.answerId === id && (!shop || t.shopId === shop)); },
    async addTip(answerId, shopId, text) { tips.push({ answerId, shopId, text, createdAt: new Date(clock).toISOString() }); },
  };
  return { lib, rows };
};
const civic = { year: '2016', make: 'Honda', model: 'Civic' };
const libAsk = (n: Narrator | null, lib: HowToLibrary, body: unknown, shop = 's1', sub?: string) => { clock += 2000; return howToRoute(ctx, n, shop, 'POST', body, sub, lib); };

test('question keys ignore wording, the vehicle and plurals', () => {
  const k = vehicleKey(civic);
  assert.equal(questionKey('How do I change the oil on a 2016 Honda Civic?', k.words), questionKey('oil change', k.words));
  assert.equal(questionKey('Replace front brake pads'), questionKey('front brake pad replacement'));
  assert.notEqual(questionKey('replace rear brake pads'), questionKey('replace front brake pads'));
});

test('a repeat question is answered from the saved answer without calling the AI', async () => {
  clearHowToLimits();
  const { lib, rows } = memLib();
  const { narrator, calls } = fake(good);
  const first = (await libAsk(narrator, lib, { question: 'oil change', vehicle: civic })).body as Record<string, unknown>;
  assert.equal(calls.length, 1);
  assert.ok(first.libraryId);
  assert.equal(first.saved, null);
  const again = (await libAsk(narrator, lib, { question: 'How do I change the oil?', vehicle: { ...civic, year: '2018' } }, 's2')).body as { saved: { uses: number }; answer: string };
  assert.equal(calls.length, 1, 'no second AI call');
  assert.equal(again.saved.uses, 2);
  assert.equal(again.answer, 'About 30 minutes.');
  // Too many years apart, a fresh request, or a follow-up all ask the AI.
  await libAsk(narrator, lib, { question: 'oil change', vehicle: { ...civic, year: '2006' } });
  await libAsk(narrator, lib, { question: 'oil change', vehicle: civic, fresh: true });
  await libAsk(narrator, lib, { question: 'oil change', vehicle: civic, history: [{ q: 'x', a: 'y' }] });
  assert.equal(calls.length, 4);
  assert.equal(rows.length, 3, 'follow-ups are not saved');
});

test('suggestions, ratings that retire wrong answers, and shared tips', async () => {
  clearHowToLimits();
  const { lib } = memLib();
  const { narrator, calls } = fake(good);
  const a = (await libAsk(narrator, lib, { question: 'Replace front brake pads', vehicle: civic })).body as { libraryId: string };
  await libAsk(narrator, lib, { question: 'Cabin air filter', vehicle: civic });
  const sug = (await libAsk(null, lib, { vehicle: civic, q: 'brake' }, 's2', 'suggest')).body as { suggestions: { id: string; question: string }[] };
  assert.deepEqual(sug.suggestions.map((s) => s.question), ['Replace front brake pads']);
  const all = (await libAsk(null, lib, { vehicle: civic, q: '' }, 's2', 'suggest')).body as { suggestions: unknown[] };
  assert.equal(all.suggestions.length, 2);
  // Picking a suggestion returns it directly.
  const picked = (await libAsk(narrator, lib, { question: 'Replace front brake pads', answerId: a.libraryId, vehicle: civic }, 's2')).body as { saved: unknown };
  assert.ok(picked.saved);
  // Tips stay in the shop that wrote them.
  await libAsk(null, lib, { id: a.libraryId, text: 'Caliper bolts are 12 mm on this one' }, 's2', 'tip');
  const s2 = (await libAsk(narrator, lib, { question: 'front brake pad replacement', vehicle: civic }, 's2')).body as { tips: { text: string }[] };
  assert.equal(s2.tips.length, 1);
  const s3 = (await libAsk(narrator, lib, { question: 'front brake pad replacement', vehicle: civic }, 's3')).body as { tips: { mine: boolean }[] };
  assert.equal(s3.tips.length, 1, 'tips are shared across shops');
  assert.equal(s3.tips[0].mine, false);
  assert.ok(!JSON.stringify(s3).includes('s2'), 'never says which shop wrote or rated it');
  // Two shops say it's wrong: retired, the next ask goes to the AI.
  const before = calls.length;
  await libAsk(null, lib, { id: a.libraryId, worked: false }, 's2', 'rate');
  const r = (await libAsk(null, lib, { id: a.libraryId, worked: false }, 's3', 'rate')).body as { retired: boolean; notRight: number };
  assert.equal(r.notRight, 2); assert.equal(r.retired, true);
  await libAsk(narrator, lib, { question: 'front brake pad replacement', vehicle: civic }, 's4');
  assert.equal(calls.length, before + 1);
});

test('nothing that identifies a customer or shop is shared', async () => {
  clearHowToLimits();
  const { lib, rows } = memLib();
  const { narrator, calls } = fake(good);
  const res = (await libAsk(narrator, lib, { question: "Maria's brakes grinding, RO 10234, call 555-013-6620, VIN 1HGCM82633A004352", vehicle: civic })).body as { libraryId: string };
  assert.equal(rows[0].question.includes('Maria'), false);
  for (const bit of ['10234', '6620', '1HGCM82633A004352']) {
    assert.equal(rows[0].question.includes(bit), false, bit);
    assert.equal(calls[0].prompt.includes(bit), false, 'not sent to the AI either: ' + bit);
  }
  const tip = await libAsk(null, lib, { id: res.libraryId, text: 'Call me at 715-555-0100 for help' }, 's2', 'tip');
  assert.equal(tip.status, 400);
  const sug = (await libAsk(null, lib, { vehicle: civic, q: '' }, 's9', 'suggest')).body;
  assert.ok(!JSON.stringify(sug).includes('s1'));
});

test('the shared library saves the AI generic title, not a question with a customer name', async () => {
  clearHowToLimits();
  const { lib, rows } = memLib();
  const titled = JSON.stringify({ ...JSON.parse(good), title: 'Diagnose a brake squeal' });
  const { narrator } = fake(titled);
  await libAsk(narrator, lib, { question: 'John Peterson says his brakes squeal when stopping', vehicle: civic });
  assert.equal(rows.at(-1)?.question, 'Diagnose a brake squeal');
  const { narrator: noTitle } = fake(good);
  await libAsk(noTitle, lib, { question: 'cabin filter swap call 555-123-4567', vehicle: civic });
  assert.equal(rows.at(-1)?.question, 'cabin filter swap call');
});
