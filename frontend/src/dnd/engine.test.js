import {
  act, createGame, current, dmAct, dmView, endTurn, interact, move, movesFor, pcFor, playerView, request, rollCheck, sessionRecord, startCombat, tick,
} from './engine';
import { newCharacter, CLASS_IDS, RACE_IDS } from './rules';
import { makeRng } from './rng';

const players = (n) => Array.from({ length: n }, (_, i) => ({
  cid: `c${i}`,
  sheet: newCharacter({ name: `Hero${i}`, classId: CLASS_IDS[i % CLASS_IDS.length], raceId: RACE_IDS[i % RACE_IDS.length] }),
}));

test('a new game puts every hero on the map with a quest', () => {
  const g = createGame({ seed: 5, players: players(4) });
  expect(g.quest.title).toBeTruthy();
  expect(g.tokens.filter((t) => t.side === 'party')).toHaveLength(4);
  expect(g.tokens.some((t) => t.side === 'foe')).toBe(true);
  expect(playerView(g, 'c0').map.t.length).toBe(g.map.w * g.map.h);
  expect(dmView(g).ai.quest.title).toBe(g.quest.title);
});

test('exploring moves up to twice your speed and starting a fight sets up turns', () => {
  const g = createGame({ seed: 9, players: players(2) });
  const hero = pcFor(g, 'c0');
  const { reach, left } = movesFor(g, hero);
  expect(left).toBe(hero.speed * 2);
  const far = [...reach.values()].filter((n) => n.end).sort((a, b) => b.cost - a.cost)[0];
  expect(move(g, hero, far)).toBe(null);
  startCombat(g, 0);
  expect(g.mode).toBe('combat');
  expect(g.combat.order.length).toBeGreaterThan(2);
});

test('only the hero whose turn it is can act, and foes take their own turns', () => {
  const g = createGame({ seed: 11, players: players(3) });
  startCombat(g, 0);
  let now = 0;
  const refusals = [];
  const ends = [];
  for (let i = 0; i < 200 && g.combat; i += 1) {
    const t = current(g);
    if (t.side === 'party') {
      const other = g.tokens.find((x) => x.side === 'party' && x !== t);
      refusals.push(move(g, other, { x: other.x, y: other.y }));
      ends.push(endTurn(g, t, now));
    } else {
      now += 2000;
      tick(g, now);
    }
  }
  expect(refusals.length).toBeGreaterThan(0);
  expect(refusals.every(Boolean)).toBe(true);
  expect(ends.every((e) => e === null)).toBe(true);
  expect(g.log.length).toBeGreaterThan(3);
});

test('a long random session never breaks the rules engine', () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    const rand = makeRng(seed);
    const g = createGame({ seed: seed * 1000, players: players(4) });
    let now = 0;
    for (let step = 0; step < 600; step += 1) {
      now += 300;
      tick(g, now);
      const cid = `c${Math.floor(rand() * 4)}`;
      const t = pcFor(g, cid);
      const choice = rand();
      if (choice < 0.35) {
        const { reach } = movesFor(g, t);
        const spots = [...reach.values()].filter((n) => n.end);
        if (spots.length) move(g, t, spots[Math.floor(rand() * spots.length)], now);
      } else if (choice < 0.65) {
        const foe = g.tokens.find((x) => x.side === 'foe' && !x.dead && !x.hidden);
        const actions = t.sheet ? require('./rules').actionsOf(t.sheet) : [];
        const a = actions[Math.floor(rand() * actions.length)];
        const ally = g.tokens.find((x) => x.side === 'party' && x !== t);
        act(g, t, { action: a.id, target: a.kind === 'heal' || a.effect === 'inspire' ? ally.id : foe?.id }, now);
      } else if (choice < 0.75) {
        endTurn(g, t, now);
      } else if (choice < 0.8) {
        interact(g, t, now);
      } else if (choice < 0.83) {
        request(g, t, 'I try to climb the wall', now);
      } else if (choice < 0.86) {
        dmAct(g, { type: 'check', skill: 'Stealth', dc: 12 }, now);
        rollCheck(g, t, now);
      } else if (choice < 0.88 && !g.combat) {
        dmAct(g, { type: 'nextScene' }, now);
      } else if (choice < 0.9) {
        dmAct(g, { type: 'spawn', monster: 'goblin' }, now);
      } else if (choice < 0.92) {
        dmAct(g, { type: 'hp', target: t.id, amount: -3 }, now);
      }
      // The views must always build.
      playerView(g, cid);
      dmView(g);
    }
    const rec = sessionRecord(g, now);
    expect(rec.party).toHaveLength(4);
    g.tokens.filter((t) => t.side === 'party').forEach((t) => {
      expect(t.hp).toBeGreaterThanOrEqual(0);
      expect(t.hp).toBeLessThanOrEqual(t.maxHp);
    });
  }
});
