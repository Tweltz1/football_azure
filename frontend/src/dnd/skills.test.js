import {
  applyItem, buy, createGame, current, move, movesFor, nextTurn, pcFor, playerView, search, sell, skillBonus, sneak, social, startCombat, tick,
} from './engine';
import { generateMap } from './mapgen';
import { newCharacter } from './rules';
import { SETTING_IDS } from './settings';

const hero = (classId, raceId = 'human') => ({ cid: 'c0', sheet: newCharacter({ name: 'Ash', classId, raceId }) });

/** A game with the hero standing next to an NPC of this role. */
const nextTo = (g, t, n) => {
  t.x = n.x + 1;
  t.y = n.y;
  g.tokens.filter((x) => x.side === 'foe').forEach((f) => { f.hidden = true; });
};

test('every map hides traps and stashes on open floor', () => {
  SETTING_IDS.forEach((id) => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const m = generateMap(id, seed, { partySize: 3, partyLevel: 1 });
      expect(m.caches.length).toBeGreaterThan(0);
      expect(m.traps.length).toBeGreaterThanOrEqual(id === 'tavern' ? 0 : 2);
      [...m.traps, ...m.caches].forEach((p) => {
        const tile = m.tiles[p.y * m.w + p.x];
        expect(tile.t === 'wall' || tile.p).toBeFalsy();
      });
    }
  });
});

test('searching finds nearby traps and stashes, once per spot', () => {
  const g = createGame({ seed: 21, players: [hero('rogue')] });
  const t = pcFor(g, 'c0');
  const cache = g.map.caches[0];
  t.x = cache.x;
  t.y = cache.y;
  t.sheet.stats.int = 30; // can't miss DC 12
  const items = t.sheet.inventory.length;
  expect(search(g, t)).toBe(null);
  expect(cache.found).toBe(true);
  expect(t.sheet.inventory.length).toBe(items + 1);
  expect(search(g, t)).toMatch(/already searched/);
  expect(playerView(g, 'c0').searched).toBe(true);
});

test('stepping on a hidden trap hurts, a found one is safe and shows on the map', () => {
  const g = createGame({ seed: 33, players: [hero('wizard')] });
  const t = pcFor(g, 'c0');
  t.sheet.stats.wis = 1; // won't spot it
  t.sheet.stats.dex = 1; // won't dodge it
  g.tokens = g.tokens.filter((x) => x.side === 'party');
  const reach = movesFor(g, t).reach;
  const spot = [...reach.values()].find((n) => n.end && (n.x !== t.x || n.y !== t.y));
  g.map.traps = [{ x: spot.x, y: spot.y, kind: 'a bear trap', found: false, sprung: false }];
  const hp = t.hp;
  expect(move(g, t, spot)).toBe(null);
  expect(g.map.traps[0].sprung).toBe(true);
  expect(t.hp).toBeLessThanOrEqual(hp);
  expect(playerView(g, 'c0').traps).toEqual([[spot.x, spot.y, 1]]);
});

test('sneaking up on monsters makes them lose their first turn', () => {
  const g = createGame({ seed: 8, players: [hero('rogue')] });
  const t = pcFor(g, 'c0');
  t.sheet.stats.dex = 30;
  expect(sneak(g, t)).toBe(null);
  expect(t.cond.sneaking).toBe(true);
  g.tokens.forEach((x) => { x.hidden = false; });
  startCombat(g, 0);
  const foes = g.tokens.filter((x) => x.side === 'foe');
  expect(foes.every((f) => f.cond.surprised)).toBe(true);
  // Run the round: every foe skips its turn instead of attacking.
  let now = 0;
  for (let i = 0; i < g.combat.order.length + 1; i += 1) {
    const c = current(g);
    if (c.side === 'party') nextTurn(g, now);
    else { now += 2000; tick(g, now); }
  }
  expect(t.hp).toBe(t.maxHp);
  expect(g.log.some((l) => /caught by surprise and loses its turn/.test(l.text))).toBe(true);
});

test('persuading an NPC gives tips and a discount; intimidating scares gold out of them', () => {
  const g = createGame({ seed: 4, players: [hero('bard')] });
  const t = pcFor(g, 'c0');
  t.sheet.stats.cha = 30;
  const n = g.npcs[0];
  nextTo(g, t, n);
  n.role = 'Merchant';
  expect(social(g, t, 'persuade')).toBe(null);
  expect(n.friendly).toBe(true);
  expect(social(g, t, 'persuade')).toMatch(/already tried/);
  const view = playerView(g, 'c0');
  expect(view.shop.friendly).toBe(true);
  expect(view.shop.stock.find(([item]) => item === 'Potion of Healing')[1]).toBe(20);
  const gold = t.sheet.gold;
  expect(social(g, t, 'intimidate')).toBe(null);
  expect(t.sheet.gold).toBeGreaterThan(gold);
  expect(playerView(g, 'c0').shop).toBe(null); // too scared to trade now
});

test('a failed pickpocket angers the NPC and brings a guard', () => {
  const g = createGame({ seed: 4, players: [hero('wizard')] });
  const t = pcFor(g, 'c0');
  t.sheet.stats.dex = -30; // always fails
  const n = g.npcs[0];
  nextTo(g, t, n);
  n.role = 'Merchant';
  expect(social(g, t, 'pickpocket')).toBe(null);
  expect(n.angry).toBe(true);
  expect(g.tokens.some((x) => x.name === 'Town guard')).toBe(true);
  expect(g.mode).toBe('combat');
  expect(social(g, t, 'persuade')).toBeTruthy();
});

test('a merchant buys and sells', () => {
  const g = createGame({ seed: 4, players: [hero('fighter')] });
  const t = pcFor(g, 'c0');
  const n = g.npcs[0];
  nextTo(g, t, n);
  n.role = 'Farmer';
  expect(buy(g, t, 'Rope (50 ft)')).toBe('No shop here.');
  n.role = 'Blacksmith';
  t.sheet.gold = 30;
  expect(buy(g, t, 'Potion of Healing')).toBe(null);
  expect(t.sheet.gold).toBe(5);
  expect(buy(g, t, 'Potion of Healing')).toMatch(/need 25/);
  t.sheet.inventory.push('Gem worth 50 gp');
  expect(sell(g, t, 'Gem worth 50 gp')).toBe(null);
  expect(t.sheet.gold).toBe(30);
  expect(sell(g, t, 'Rations (5)')).toMatch(/Nobody/);
});

test('items do things in a fight', () => {
  const g = createGame({ seed: 12, players: [hero('cleric')] });
  const t = pcFor(g, 'c0');
  const foe = g.tokens.find((x) => x.side === 'foe');
  foe.x = t.x + 1;
  foe.y = t.y;
  foe.hidden = false;
  foe.monster = 'zombie';
  foe.hp = 100;
  foe.maxHp = 100;
  t.sheet.inventory.push('Holy water', 'Scroll of Shield', 'Smoke bomb', 'Lucky coin');
  expect(applyItem(g, t, 'Scroll of Shield')).toMatch(/fight/);
  expect(applyItem(g, t, 'Holy water', foe.id)).toBe(null);
  expect(g.combat).toBeTruthy();
  expect(current(g).id).toBe(t.id);
  expect(foe.hp).toBeLessThanOrEqual(96); // 4d6 against the undead
  expect(t.sheet.inventory).not.toContain('Holy water');
  expect(applyItem(g, t, 'Scroll of Shield')).toBe(null);
  expect(t.cond.shield).toBe(true);
  expect(applyItem(g, t, 'Smoke bomb')).toMatch(/Bonus action already used/);
  expect(applyItem(g, t, 'Lucky coin')).toMatch(/can’t use/);
  const plain = skillBonus({ sheet: { ...t.sheet, inventory: [] } }, 'Stealth');
  expect(skillBonus(t, 'Stealth')).toBe(plain + 1);
});
