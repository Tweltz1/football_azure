// Card table API (500 and Dirty Clubs). The host phone runs the game; this keeps each game's latest
// save, so an unfinished game can be picked up again, and lists finished games for the stats page.
// Open to guests: the games are played without signing in, and a game's id is a long random string.

import type { Ctx, Res } from './handlers.ts';

type Body = Record<string, unknown>;

export interface CardGameRow {
  id: string;
  game: string;
  finished: boolean;
  summary: Record<string, unknown>;
  state: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CardGameStore {
  get(id: string): Promise<CardGameRow | null>;
  put(row: CardGameRow): Promise<void>;
  /** Newest first, without the saved state. */
  list(game: string, finished: boolean, limit: number): Promise<CardGameRow[]>;
}

export const CARD_GAMES = ['five', 'clubs'];
const MAX_STATE = 200_000;
const MAX_SUMMARY = 20_000;

const ok = (body?: unknown): Res => ({ status: 200, body });
const bad = (message: string): Res => ({ status: 400, body: message });

const out = (r: CardGameRow, withState = false) => ({
  id: r.id, game: r.game, finished: r.finished, summary: r.summary, updatedAt: r.updatedAt, createdAt: r.createdAt,
  ...(withState ? { state: r.state } : {}),
});

export async function cardsRoute(
  ctx: Ctx, store: CardGameStore | null | undefined, method: string, parts: string[], data: unknown, params?: URLSearchParams,
): Promise<Res | null> {
  if (parts[0] !== 'cards' || parts[1] !== 'games') return null;
  if (!store) return { status: 503, body: 'Saving is not available here.' };
  const id = parts[2];

  if (!id && method === 'GET') {
    const game = params?.get('game') || '';
    if (!CARD_GAMES.includes(game)) return bad('Which game?');
    const finished = params?.get('open') !== '1';
    const rows = await store.list(game, finished, finished ? 500 : 30);
    return ok(rows.map((r) => out(r)));
  }

  if (id && method === 'GET') {
    const row = await store.get(id);
    return row ? ok(out(row, true)) : { status: 404, body: 'Not found.' };
  }

  if (!id && method === 'POST') {
    const body = (data && typeof data === 'object' ? data : {}) as Body;
    const gameId = typeof body.id === 'string' ? body.id : '';
    if (!/^[a-z0-9-]{12,64}$/i.test(gameId)) return bad('Bad game id.');
    const game = typeof body.game === 'string' ? body.game : '';
    if (!CARD_GAMES.includes(game)) return bad('Which game?');
    const summary = body.summary && typeof body.summary === 'object' ? body.summary as Record<string, unknown> : {};
    const state = body.state && typeof body.state === 'object' ? body.state as Record<string, unknown> : null;
    if (JSON.stringify(summary).length > MAX_SUMMARY) return bad('Summary too big.');
    if (state && JSON.stringify(state).length > MAX_STATE) return bad('Save too big.');
    const prev = await store.get(gameId);
    if (prev && prev.game !== game) return bad('That id is another game.');
    // A finished game stays finished, so a stale phone can't reopen it.
    const finished = Boolean(body.finished) || Boolean(prev?.finished);
    const now = ctx.now().toISOString();
    await store.put({
      id: gameId,
      game,
      finished,
      summary: prev?.finished ? prev.summary : summary,
      state: finished ? null : state,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    });
    return ok({ id: gameId, finished });
  }

  return { status: 405 };
}
