import { initialPlayerList } from '../data/playerData';
import { BUDGET, SLOTS, bid, finish, grade, newDraft, nominate, nominationChoices, sold, youOf } from './mockAuction';

const fresh = () => newDraft(initialPlayerList, 42);

test('a draft fills every roster within budget', () => {
  const d = finish(fresh());
  expect(d.done).toBe(true);
  d.teams.forEach((t) => {
    expect(t.roster).toHaveLength(SLOTS.length);
    expect(t.budget).toBeGreaterThanOrEqual(0);
    expect(t.roster.reduce((s, p) => s + p.price, 0)).toBe(BUDGET - t.budget);
  });
  const ids = d.log.map((l) => l.player.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(grade(d).letter).toMatch(/[A-D]/);
});

test('bidding over every bot wins the player', () => {
  const d = fresh();
  while (d.lot.yourTurn) { nominate(d, nominationChoices(d)[0].id); sold(d); }
  const player = d.lot.player;
  bid(d, 150);
  expect(d.lot.leader).toBe('you');
  sold(d);
  expect(youOf(d).roster[0].player.id).toBe(player.id);
  expect(youOf(d).budget).toBe(BUDGET - 150);
});

test('bots outbid a lowball', () => {
  const d = fresh();
  while (d.lot.yourTurn) { nominate(d, nominationChoices(d)[0].id); sold(d); }
  bid(d, 2);
  expect(d.lot.leader).not.toBe('you');
  expect(d.lot.price).toBe(3);
});
