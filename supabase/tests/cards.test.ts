// Card table API against in-memory storage: `node --test supabase/tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import { cardsRoute, type CardGameRow, type CardGameStore } from '../functions/_shared/cards.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function world() {
  const rows = new Map<string, CardGameRow>();
  let clock = Date.parse('2026-11-06T02:00:00Z');
  const store: CardGameStore = {
    async get(id) { const r = rows.get(id); return r ? clone(r) : null; },
    async put(row) { rows.set(row.id, clone(row)); },
    async list(game, finished, limit) {
      return [...rows.values()].filter((r) => r.game === game && r.finished === finished)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit).map((r) => ({ ...clone(r), state: null }));
    },
  };
  const ctx = { userId: null, now: () => new Date(clock), log: { info() {}, warn() {}, error() {} } } as unknown as Ctx;
  const call = (method: string, path: string, body?: unknown, query = '') => {
    clock += 1000;
    return cardsRoute(ctx, store, method, path.split('/'), body ?? null, new URLSearchParams(query));
  };
  return { call, rows };
}

const ID = 'g-0123456789abcdef';

test('saves a game, resumes it, and lists it once finished', async () => {
  const { call } = world();
  let res = await call('POST', 'cards/games', { id: ID, game: 'five', summary: { scores: [120, 40] }, state: { handNo: 3 } });
  assert.equal(res?.status, 200);
  res = await call('GET', 'cards/games', undefined, 'game=five&open=1');
  assert.equal((res?.body as unknown[]).length, 1);
  res = await call('GET', `cards/games/${ID}`);
  assert.deepEqual((res?.body as { state: unknown }).state, { handNo: 3 });

  await call('POST', 'cards/games', { id: ID, game: 'five', finished: true, summary: { scores: [510, 40], winner: 0 }, state: { handNo: 9 } });
  res = await call('GET', 'cards/games', undefined, 'game=five&open=1');
  assert.equal((res?.body as unknown[]).length, 0);
  res = await call('GET', 'cards/games', undefined, 'game=five');
  const list = res?.body as { summary: { winner: number } }[];
  assert.equal(list.length, 1);
  assert.equal(list[0].summary.winner, 0);

  // A late save from a stale phone doesn't reopen or change a finished game.
  await call('POST', 'cards/games', { id: ID, game: 'five', summary: { scores: [1, 1] }, state: { handNo: 2 } });
  res = await call('GET', `cards/games/${ID}`);
  assert.equal((res?.body as { finished: boolean }).finished, true);
  assert.equal((res?.body as { state: unknown }).state, null);
});

test('rejects bad ids, unknown games and oversized saves', async () => {
  const { call } = world();
  assert.equal((await call('POST', 'cards/games', { id: 'x', game: 'five' }))?.status, 400);
  assert.equal((await call('POST', 'cards/games', { id: ID, game: 'poker' }))?.status, 400);
  assert.equal((await call('POST', 'cards/games', { id: ID, game: 'clubs', state: { big: 'x'.repeat(250_000) } }))?.status, 400);
  assert.equal((await call('GET', 'cards/games', undefined, 'game=poker'))?.status, 400);
  assert.equal(await call('GET', 'other/thing'), null);
});
