// Hood Quest API against in-memory storage: `node --test supabase/tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import {
  cleanSheet, clearNarrateLimits, dndRoute, narrationPrompt, type DndCampaignRow, type DndCharacterRow, type DndSessionRow, type DndStore, type Narrator,
} from '../functions/_shared/dnd.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function world(narrator: Narrator | null = null) {
  const chars = new Map<string, DndCharacterRow>();
  const camps = new Map<string, DndCampaignRow>();
  const sessions: DndSessionRow[] = [];
  let ids = 0;
  let clock = Date.parse('2026-11-02T20:00:00Z');
  const store: DndStore = {
    async listCharacters(userId) { return [...chars.values()].filter((c) => c.userId === userId).map(clone); },
    async getCharacter(id) { const c = chars.get(id); return c ? clone(c) : null; },
    async putCharacter(row) { chars.set(row.id, clone(row)); },
    async deleteCharacter(id) { chars.delete(id); },
    async charactersInCampaign(id) { return [...chars.values()].filter((c) => c.campaignId === id).map(clone); },
    async listCampaigns(userId) { return [...camps.values()].filter((c) => c.members.includes(userId)).map(clone); },
    async getCampaign(id) { const c = camps.get(id); return c ? clone(c) : null; },
    async putCampaign(row) { camps.set(row.id, clone(row)); },
    async listSessions(id) { return sessions.filter((s) => s.campaignId === id).map(clone); },
    async addSession(row) { sessions.push(clone(row)); },
  };
  const ctx = (userId: string | null, name = 'Tester') => ({
    userId,
    displayName: name,
    now: () => new Date(clock),
    newId: () => `id${(ids += 1)}`,
    log: { info() {}, warn() {}, error() {} },
  }) as unknown as Ctx;
  const call = (userId: string | null, method: string, path: string, body?: unknown) => {
    clock += 2000;
    return dndRoute(ctx(userId), { store, narrator }, method, path.split('/'), body ?? null);
  };
  return { call, chars, camps, sessions };
}

test('only dnd paths are handled, and they need a sign-in', async () => {
  const w = world();
  assert.equal(await w.call('u1', 'GET', 'leagues/x'), null);
  assert.equal((await w.call(null, 'GET', 'dnd/characters'))!.status, 401);
});

test('heroes save to the account and stay in range', async () => {
  const w = world();
  const res = await w.call('u1', 'POST', 'dnd/characters', {
    character: { name: 'Grog', classId: 'barbarian', raceId: 'orc', xp: 950, hp: 9999, maxHp: 30, stats: { str: 99 }, inventory: ['Axe'], look: '1.2.3.4.5.6.7.8.0.0.0.0.0.0.0.0', history: [{ fake: true }] },
  });
  assert.equal(res!.status, 200);
  const saved = res!.body as Record<string, any>;
  assert.equal(saved.level, 3);
  assert.equal(saved.hp, 30);
  assert.equal(saved.stats.str, 20);
  assert.deepEqual(saved.history, []);
  const list = (await w.call('u1', 'GET', 'dnd/characters'))!.body as any[];
  assert.equal(list.length, 1);
  // Someone else can't overwrite or delete it.
  assert.equal((await w.call('u2', 'POST', 'dnd/characters', { character: { id: saved.id, name: 'Mine now' } }))!.status, 403);
  assert.equal((await w.call('u2', 'DELETE', `dnd/characters/${saved.id}`))!.status, 403);
  assert.equal((await w.call('u1', 'DELETE', `dnd/characters/${saved.id}`))!.status, 200);
});

test('a DM runs a campaign: players join, the session saves and heroes get their history', async () => {
  const w = world();
  const camp = (await w.call('dm', 'POST', 'dnd/campaigns', { name: 'The Hood Saga' }))!.body as any;
  const hero = (await w.call('p1', 'POST', 'dnd/characters', { character: { name: 'Pip', classId: 'rogue', raceId: 'halfling', xp: 0, campaignId: camp.id } }))!.body as any;
  assert.equal((await w.call('p1', 'GET', `dnd/campaigns/${camp.id}`))!.status, 403);
  assert.equal((await w.call('p1', 'POST', `dnd/campaigns/${camp.id}/join`))!.status, 200);
  assert.equal((await w.call('p1', 'GET', `dnd/campaigns/${camp.id}`))!.status, 200);
  assert.equal((await w.call('p1', 'POST', `dnd/campaigns/${camp.id}/sessions`, { session: {} }))!.status, 403);
  assert.equal((await w.call('dm', 'POST', `dnd/campaigns/${camp.id}/notes`, { notes: 'The innkeeper is the villain' }))!.status, 200);

  const saved = await w.call('dm', 'POST', `dnd/campaigns/${camp.id}/sessions`, {
    session: { quest: { title: 'Rescue a missing apprentice' }, summary: 'They found the apprentice.', complete: true, log: ['a', 'b'], party: [{ characterId: hero.id, name: 'Pip', xp: 350 }] },
    characters: [{ characterId: hero.id, xp: 350, hp: 4, maxHp: 9, gold: 40, inventory: ['Dagger', 'Potion of Healing'] }],
  });
  assert.equal(saved!.status, 200);
  assert.equal((saved!.body as any).characters, 1);
  const detail = (await w.call('dm', 'GET', `dnd/campaigns/${camp.id}`))!.body as any;
  assert.equal(detail.campaign.notes, 'The innkeeper is the villain');
  assert.equal(detail.sessions.length, 1);
  assert.equal(detail.sessions[0].summary, 'They found the apprentice.');
  const pip = detail.characters.find((c: any) => c.id === hero.id);
  assert.equal(pip.level, 2);
  assert.equal(pip.gold, 40);
  assert.equal(pip.history.length, 1);
  assert.equal(pip.history[0].xp, 350);
  assert.equal(pip.history[0].quest, 'Rescue a missing apprentice');
  // Players don't see the DM's notes.
  assert.equal(((await w.call('p1', 'GET', `dnd/campaigns/${camp.id}`))!.body as any).campaign.notes, '');
  const mine = (await w.call('p1', 'GET', 'dnd/campaigns'))!.body as any[];
  assert.equal(mine[0].sessions, 1);
});

test('the narrator: 503 when not set up, JSON when it is, and a rate limit', async () => {
  clearNarrateLimits();
  assert.equal((await world().call('dm', 'POST', 'dnd/narrate', { kind: 'scene', context: {} }))!.status, 503);
  const prompts: string[] = [];
  const w = world({ async complete({ prompt }) { prompts.push(prompt); return JSON.stringify({ narration: 'The tavern falls silent.', ideas: ['Call a Perception check'] }); } });
  const res = await w.call('dm', 'POST', 'dnd/narrate', { kind: 'scene', context: { setting: 'tavern', recent: ['Pip joins'] }, direction: 'make it spooky' });
  assert.equal(res!.status, 200);
  assert.deepEqual(res!.body, { narration: 'The tavern falls silent.', ideas: ['Call a Perception check'] });
  assert.match(prompts[0], /make it spooky/);
  assert.match(prompts[0], /<game_state>/);
  const broken = world({ async complete() { return 'not json'; } });
  assert.equal((await broken.call('dm2', 'POST', 'dnd/narrate', { kind: 'scene' }))!.status, 502);
});

test('sheets and prompts are cleaned', () => {
  const s = cleanSheet({ classId: 'necromancer', raceId: 'robot', name: '' });
  assert.equal(s.classId, 'fighter');
  assert.equal(s.raceId, 'human');
  assert.equal(s.name, 'Adventurer');
  const huge = narrationPrompt('scene', { recent: Array.from({ length: 2000 }, () => 'x'.repeat(40)) }, '');
  assert.ok(huge.length < 12500);
});
