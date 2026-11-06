// Start/Sit AI chat route: `node --test supabase/tests/footballAsk.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import type { Narrator } from '../functions/_shared/dnd.ts';
import { askPrompt, askRoute, clearAskLimits, ASK_PER_HOUR, askMatchKey } from '../functions/_shared/footballAsk.ts';
import type { AskLogRow, AskLogStore } from '../functions/_shared/footballAsk.ts';

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

const ask = (narrator: Narrator | null, body: unknown, userId: string | null = 'u1', store?: AskLogStore) => {
  clock += 2000;
  return askRoute(ctx(userId), narrator, 'POST', ['startsit', 'ask'], body, store);
};

/** An in-memory ask_log table. */
const memoryLog = () => {
  const rows: AskLogRow[] = [];
  const store: AskLogStore = {
    async save(row) { rows.push(row); },
    async findReply(key) {
      const hit = rows.filter((r) => r.match_key === key && r.source === 'gemini' && r.ai_answer).pop();
      return hit ? { ai_answer: hit.ai_answer as string, ideas: hit.ideas } : null;
    },
  };
  return { rows, store };
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

test('saves every turn with the model answer and the Gemini reply', async () => {
  clearAskLimits();
  const { rows, store } = memoryLog();
  const body = { question: 'Warren or Kyren?', data: { week: 9, modelAnswer: { kind: 'compare', text: 'Start Warren.' } } };
  await ask(fake(JSON.stringify({ narration: 'Warren, easily.', ideas: ['Flex?'] })).narrator, body, 'u1', store);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].question, 'Warren or Kyren?');
  assert.equal(rows[0].week, 9);
  assert.equal(rows[0].model_kind, 'compare');
  assert.equal(rows[0].model_text, 'Start Warren.');
  assert.equal(rows[0].ai_answer, 'Warren, easily.');
  assert.deepEqual(rows[0].ideas, ['Flex?']);
  assert.equal(rows[0].source, 'gemini');
  assert.equal(rows[0].user_id, 'u1');
});

test('reuses a saved reply when Gemini is down, only for the same question and model answer', async () => {
  clearAskLimits();
  const { rows, store } = memoryLog();
  const body = { question: 'Warren or Kyren?', data: { week: 9, modelAnswer: { text: 'Start Warren.' } } };
  await ask(fake(JSON.stringify({ narration: 'Warren, easily.', ideas: ['Flex?'] })).narrator, body, 'u1', store);

  const down = fake(new Error('Gemini 503')).narrator;
  const again = await ask(down, { ...body, question: '  warren OR kyren ' }, 'u2', store);
  assert.equal(again?.status, 200);
  assert.deepEqual(again?.body, { answer: 'Warren, easily.', ideas: ['Flex?'], saved: true });
  assert.equal(rows[rows.length - 1].source, 'saved');

  // No key set at all works the same way.
  assert.equal((await ask(null, body, 'u3', store))?.status, 200);

  // A different model answer (new week, new numbers) is not reused.
  const changed = await ask(down, { question: 'Warren or Kyren?', data: { modelAnswer: { text: 'Start Kyren.' } } }, 'u2', store);
  assert.equal(changed?.status, 502);
  assert.equal(rows[rows.length - 1].source, 'failed');
  assert.equal(rows[rows.length - 1].ai_answer, null);
});

test('a broken log never breaks the answer', async () => {
  clearAskLimits();
  const broken: AskLogStore = { async save() { throw new Error('db down'); }, async findReply() { throw new Error('db down'); } };
  const ok = await ask(fake(JSON.stringify({ narration: 'Fine.', ideas: [] })).narrator, { question: 'hi', data: { modelAnswer: { text: 'x' } } }, 'u1', broken);
  assert.equal(ok?.status, 200);
  const down = await ask(fake(new Error('503')).narrator, { question: 'hi', data: { modelAnswer: { text: 'x' } } }, 'u1', broken);
  assert.equal(down?.status, 502);
});

test('match keys ignore case, spacing and punctuation', () => {
  assert.equal(askMatchKey('Warren or Kyren??', 'a'), askMatchKey('  warren  OR kyren', 'a'));
  assert.notEqual(askMatchKey('Warren or Kyren', 'a'), askMatchKey('Warren or Kyren', 'b'));
});
