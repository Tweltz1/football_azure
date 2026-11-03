import { act, createGame, pcFor, playerView, startCombat, wear } from './engine';
import { GEAR, heroMarkup, howToUnlock, pieceMarkup, unlockedIds } from './gear';
import { newCharacter, normalizeCharacter } from './rules';

const sheetFor = (classId = 'fighter') => newCharacter({ name: 'Ash', classId, raceId: 'human' });

test('every piece has a unique id, a way to unlock it and art', () => {
  expect(new Set(GEAR.map((x) => x.id)).size).toBe(GEAR.length);
  expect(GEAR.length).toBeGreaterThanOrEqual(70);
  expect(GEAR.every((item) => howToUnlock(item))).toBe(true);
  expect(GEAR.filter((item) => item.slot !== 'title').every((item) => pieceMarkup(item).length > 40)).toBe(true);
  expect(heroMarkup('2.1.0.0', { head: 'crown', cloak: 'angel-wings', aura: 'flame-aura', pet: 'whelp' })).toContain('<');
});

test('the first scene unlocks the tavern cat, and defeating a monster counts for the hero who did it', () => {
  const g = createGame({ seed: 3, players: [{ cid: 'c0', sheet: sheetFor() }] });
  const t = pcFor(g, 'c0');
  expect(t.sheet.deeds.scenes).toBe(1);
  expect(unlockedIds(t.sheet)).toContain('cat');
  expect(g.unlock.gear).toBe('cat');
  expect(playerView(g, 'c0').unlock.gear).toBe('cat');
  const foe = g.tokens.find((x) => x.side === 'foe');
  foe.x = t.x + 1;
  foe.y = t.y;
  foe.hidden = false;
  foe.hp = 1;
  foe.ac = 1;
  startCombat(g, 0);
  g.combat.order = [t.id, foe.id];
  g.combat.turn = 0;
  let tries = 0;
  while (!foe.dead && tries < 20) {
    g.combat.action = false;
    act(g, t, { action: 'longsword', target: foe.id });
    tries += 1;
  }
  expect(foe.dead).toBe(true);
  expect(t.sheet.deeds.kills).toBe(1);
  expect(unlockedIds(t.sheet)).toContain('brave');
});

test('you can only wear what you have unlocked, and it saves with the hero', () => {
  const g = createGame({ seed: 3, players: [{ cid: 'c0', sheet: sheetFor() }] });
  const t = pcFor(g, 'c0');
  expect(wear(g, t, 'head', 'royal-crown')).toMatch(/Not unlocked/);
  expect(wear(g, t, 'pet', 'cat')).toBe(null);
  expect(t.sheet.wear.pet).toBe('cat');
  expect(playerView(g, 'c0').tokens.find((x) => x.id === t.id).wear.pet).toBe('cat');
  const saved = normalizeCharacter(JSON.parse(JSON.stringify(t.sheet)));
  expect(saved.deeds.scenes).toBe(1);
  expect(saved.wear.pet).toBe('cat');
  // A forged save can't wear something it hasn't earned.
  expect(normalizeCharacter({ ...saved, wear: { head: 'royal-crown' } }).wear.head).toBeUndefined();
  expect(wear(g, t, 'pet', null)).toBe(null);
  expect(t.sheet.wear.pet).toBeUndefined();
});

test('class gear only unlocks for its class', () => {
  const wiz = normalizeCharacter({ ...sheetFor('wizard'), deeds: { classQuests: 3, quests: 3 } });
  const fighter = normalizeCharacter({ ...sheetFor('fighter'), deeds: { classQuests: 3, quests: 3 } });
  expect(unlockedIds(wiz)).toContain('star-hat');
  expect(unlockedIds(fighter)).not.toContain('star-hat');
  expect(unlockedIds(fighter)).toContain('champion-helm');
});

test('actions leave an action-cam moment for the phones of the heroes in them', () => {
  const g = createGame({ seed: 3, players: [{ cid: 'c0', sheet: sheetFor() }, { cid: 'c1', sheet: sheetFor('wizard') }] });
  const t = pcFor(g, 'c0');
  const foe = g.tokens.find((x) => x.side === 'foe');
  foe.x = t.x + 1;
  foe.y = t.y;
  foe.hidden = false;
  foe.hp = 100;
  startCombat(g, 0);
  g.combat.order = [t.id, foe.id];
  g.combat.turn = 0;
  act(g, t, { action: 'longsword', target: foe.id });
  const cam = playerView(g, 'c0').fx;
  expect(['hit', 'miss']).toContain(cam.kind);
  expect(cam.actor.name).toBe(t.name);
  expect(cam.target.monster).toBe(foe.monster);
  expect(playerView(g, 'c1').fx).toBe(null);
});
