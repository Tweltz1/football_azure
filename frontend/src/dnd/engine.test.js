import {
  act, aiContext, createGame, current, dmAct, dmView, endTurn, hear, interact, move, movesFor, pcFor, playerView, request, rollCheck, sessionRecord,
  AUTO_EXIT_MS, applyItem, buy, search, sell, sneak, social, startCombat, talk, tick, watchView,
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

test('exploring moves up to your speed and starting a fight sets up turns', () => {
  const g = createGame({ seed: 9, players: players(2) });
  const hero = pcFor(g, 'c0');
  const { reach, left } = movesFor(g, hero);
  expect(left).toBe(hero.speed);
  const far = [...reach.values()].filter((n) => n.end).sort((a, b) => b.cost - a.cost)[0];
  expect(move(g, hero, far)).toBe(null);
  g.tokens.forEach((t) => { t.hidden = false; });
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
      } else if (choice < 0.94) {
        search(g, t, now);
        sneak(g, t, now);
      } else if (choice < 0.96) {
        const foe = g.tokens.find((x) => x.side === 'foe' && !x.dead && !x.hidden);
        applyItem(g, t, t.sheet.inventory[Math.floor(rand() * t.sheet.inventory.length)], foe?.id, now);
      } else if (choice < 0.98) {
        const npc = g.npcs[0];
        if (npc) { t.x = npc.x + 1; t.y = npc.y; }
        social(g, t, ['persuade', 'intimidate', 'pickpocket'][Math.floor(rand() * 3)], now);
        buy(g, t, 'Smoke bomb', now);
        sell(g, t, 'Torch', now);
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

test('table talk is kept for the narrator, the recap and the watch screen', () => {
  const eng = { aiContext, hear, sessionRecord, watchView };
  const g = createGame({ seed: 77, players: [{ cid: 'a', sheet: newCharacter({ name: 'Pip', classId: 'rogue' }) }], now: 0 });
  eng.hear(g, 'Pip', '  I sneak   toward the door  ', 10);
  eng.hear(g, 'Pip', '', 11);
  expect(g.transcript).toEqual([{ who: 'Pip', text: 'I sneak toward the door', at: 10 }]);
  expect(eng.aiContext(g).talk).toEqual(['Pip: I sneak toward the door']);
  expect(eng.sessionRecord(g, 60000).transcript).toEqual(['Pip: I sneak toward the door']);
  const w = eng.watchView(g);
  expect(w.map.w).toBe(g.map.w);
  expect(w.tokens.find((t) => t.cid === 'a').classId).toBe('rogue');
  expect(w.tokens.some((t) => t.side === 'foe' && g.tokens.find((x) => x.id === t.id).hidden)).toBe(false);
});

test('reaching the way onward moves the party to the next scene without a DM', () => {
  const g = createGame({ seed: 21, players: players(1) });
  g.tokens = g.tokens.filter((t) => t.side === 'party');
  const hero = pcFor(g, 'c0');
  g.atExit = true;
  g.exitAt = 0;
  tick(g, AUTO_EXIT_MS / 2);
  expect(g.sceneIndex).toBe(0);
  tick(g, AUTO_EXIT_MS + 10);
  expect(g.sceneIndex).toBe(1);
  expect(g.atExit).toBe(false);
  expect(hero.hp).toBeGreaterThan(0);
});

test('scenes have NPCs to talk to, and side tasks pay out', () => {
  let g = null;
  for (let seed = 1; seed < 60; seed += 1) {
    g = createGame({ seed, players: players(2) });
    if (g.npcs.some((n) => n.task.kind === 'slay')) break;
  }
  expect(g.npcs.length).toBeGreaterThan(0);
  const npc = g.npcs.find((n) => n.task.kind === 'slay');
  const hero = pcFor(g, 'c0');
  expect(talk(g, hero)).toBe('Nobody to talk to here.');
  hero.x = npc.x + 1;
  hero.y = npc.y;
  expect(playerView(g, 'c0').npcNear.name).toBe(npc.name);
  const gold = hero.sheet.gold;
  expect(talk(g, hero)).toBe(null);
  expect(g.narration.text).toContain(npc.name);
  expect(playerView(g, 'c0').tasks[0].done).toBe(false);
  g.tokens.filter((t) => t.monster === npc.task.monster).forEach((t) => { t.hp = 0; t.dead = true; });
  g.tokens = g.tokens.filter((t) => t.monster !== npc.task.monster);
  talk(g, hero);
  expect(npc.done).toBe(true);
  expect(hero.sheet.gold).toBeGreaterThan(gold);
});

test('the last scene’s boss carries the villain’s name', () => {
  const g = createGame({ seed: 5, players: players(2) });
  dmAct(g, { type: 'nextScene' });
  dmAct(g, { type: 'nextScene' });
  const bosses = g.tokens.filter((t) => t.side === 'foe' && t.boss);
  expect(bosses.every((b) => b.name.toLowerCase().startsWith(g.quest.villain.split(',')[0].slice(0, 5).toLowerCase()))).toBe(true);
});
