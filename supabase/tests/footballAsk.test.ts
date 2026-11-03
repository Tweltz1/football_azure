// Start/Sit AI chat route: `node --test supabase/tests/footballAsk.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import type { Narrator } from '../functions/_shared/dnd.ts';
import { askPrompt, askRoute, clearAskLimits, ASK_PER_HOUR } from '../functions/_shared/footballAsk.ts';

let clock = Date.parse('2026-11-03T00:00:00Z');
const ctx = (userId: string | null) => ({
  userId,
  now: () => new Date(clock),
  log: { info() {}, warn() {}, error() {} },
}) as unknown as Ctx;

const fake = (reply: string | Error) => {
  const calls: { system: string; prompt: string }[] = [];
  const narrator: Narrator = {
    async complete(req) {
      calls.push(req);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { narrator, calls };
};

const ask = (narrator: Narrator | null, body: unknown, userId: string | null = 'u1') => {
  clock += 2000;
  return askRoute(ctx(userId), narrator, 'POST', ['startsit', 'ask'], body);
};

test('other routes pass through', async () => {
  const { narrator } = fake('{}');
  assert.equal(await askRoute(ctx('u1'), narrator, 'GET', ['startsit'], null), null);
  assert.equal(await askRoute(ctx('u1'), narrator, 'POST', ['dnd', 'narrate'], null), null);
});

test('answers with the narration and follow-up ideas, grounded in the data sent', async () => {
  clearAskLimits();
  const { narrator, calls } = fake(JSON.stringify({ narration: 'Start Warren.', ideas: ['Who at flex?', 'Any trades?', 'x', 'y'] }));
  const res = await ask(narrator, {
    question: 'Warren or Kyren?',
    history: [{ q: 'who should I start', a: 'Your best lineup is...' }],
    data: { week: 9, modelAnswer: { text: 'Start Jaylen Warren (14.2 pts).' } },
  });
  assert.equal(res?.status, 200);
  assert.deepEqual(res?.body, { answer: 'Start Warren.', ideas: ['Who at flex?', 'Any trades?', 'x'] });
  assert.match(calls[0].prompt, /Question: Warren or Kyren\?/);
  assert.match(calls[0].prompt, /Start Jaylen Warren \(14\.2 pts\)/);
  assert.match(calls[0].prompt, /User: who should I start/);
  assert.match(calls[0].system, /site_data/);
});

test('works signed out', async () => {
  clearAskLimits();
  const { narrator } = fake(JSON.stringify({ narration: 'Hi.', ideas: [] }));
  assert.equal((await ask(narrator, { question: 'hi' }, null))?.status, 200);
});

test('fails cleanly so the page keeps its own answer', async () => {
  clearAskLimits();
  assert.equal((await ask(null, { question: 'hi' }))?.status, 503);
  assert.equal((await ask(fake(new Error('Gemini 503')).narrator, { question: 'hi' }))?.status, 502);
  assert.equal((await ask(fake('not json').narrator, { question: 'hi' }))?.status, 502);
  assert.equal((await ask(fake('{"narration":""}').narrator, { question: 'hi' }))?.status, 502);
  assert.equal((await ask(fake('{}').narrator, { question: '  ' }))?.status, 400);
});

test('limits each user per hour', async () => {
  clearAskLimits();
  const { narrator } = fake(JSON.stringify({ narration: 'ok', ideas: [] }));
  for (let i = 0; i < ASK_PER_HOUR; i += 1) assert.equal((await ask(narrator, { question: 'q' }))?.status, 200);
  assert.equal((await ask(narrator, { question: 'q' }))?.status, 429);
  assert.equal((await ask(narrator, { question: 'q' }, 'u2'))?.status, 200);
});

test('trims oversized data, dropping optional lists first', () => {
  const big = Array.from({ length: 2000 }, (_, i) => ({ name: `Player ${i}`, pts: i }));
  const prompt = askPrompt({ question: 'q', data: { modelAnswer: { text: 'keep me' }, topPlayers: big, freeAgents: big } });
  assert.ok(prompt.length < 15_000);
  assert.match(prompt, /keep me/);
});
