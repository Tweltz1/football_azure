// The table: map, tokens, turns, dice and the log. It lives on the TV, like the Games Night engines.
// Phones send actions; the TV checks them against the rules, updates the state and sends each phone its view.

import { makeRng, newSeed, subSeed, tools } from './rng';
import { generateMap } from './mapgen';
import { settingFor, PROPS, LOOT } from './settings';
import {
  acOf, actionNumbers, actionsOf, CLASSES, critDice, d20, describe, levelForXp, maxHpFor, mod, MONSTERS, normalizeCharacter,
  proficiency, RACES, roll, SKILLS, speedOf,
} from './rules';
import {
  adjacent, isOpen, lineOfSight, nearestStops, pathTo, reachable, squaresBetween, tileAt,
} from './movement';
import { makeQuest } from './story';
import {
  CAUGHT, INTIMIDATE_FAIL, INTIMIDATE_OK, makeNpcs, npcLine, PERSUADE_FAIL, taskLabel, villainName,
} from './npcs';
import {
  buyPrice, GUARDED_ROLES, hasItem, ITEMS, MERCHANT_ROLES, sellValue, SHOP_STOCK, UNDEAD,
} from './items';
import { cleanDeeds, cleanWear, GEAR_BY_ID, titleOf, unlockedIds } from './gear';

const LOG_MAX = 120;
const FOE_TURN_MS = 1400;
const MOVE_STEP_MS = 140;
/** Bosses who can be the quest's villain in person; the others become the villain's pet or servant. */
const PEOPLE_BOSSES = new Set(['banditCaptain', 'cultFanatic', 'hag', 'wight']);
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
/** A hero standing at the way onward takes the party to the next scene after this long, if the DM hasn't already. */
export const AUTO_EXIT_MS = 9000;

const say = (g, text, kind = 'info', now = g.clock) => {
  g.log.push({ id: (g.logId += 1), at: now, text, kind });
  if (g.log.length > LOG_MAX) g.log.splice(0, g.log.length - LOG_MAX);
};

/** Something worth narrating happened. The DM phone (AI or the human) picks it up. */
const cue = (g, kind, detail = '', now = g.clock) => {
  g.cue = { id: (g.cueId += 1), kind, detail, at: now };
};

const showRoll = (g, entry, now = g.clock) => {
  g.rolls.push({ id: (g.rollId += 1), at: now, ...entry });
  if (g.rolls.length > 8) g.rolls.shift();
};

// ---- Deeds and unlockable gear ----------------------------------------------------------------------------------

/** Adds to a hero's tally and announces any gear it unlocks. */
const deed = (g, t, key, n = 1, now = g.clock) => {
  if (!t || t.side !== 'party' || !t.sheet || n <= 0) return;
  const before = unlockedIds(t.sheet);
  t.sheet.deeds = cleanDeeds(t.sheet.deeds);
  if (key === 'places') {
    if (t.sheet.deeds.places.includes(n)) return;
    t.sheet.deeds.places.push(n);
  } else {
    t.sheet.deeds[key] = (t.sheet.deeds[key] || 0) + n;
  }
  announceUnlocks(g, t, before, now);
};

/** Tells the table about pieces this hero just unlocked. */
const announceUnlocks = (g, t, before, now) => {
  const fresh = unlockedIds(t.sheet).filter((id) => !before.includes(id));
  fresh.forEach((id) => {
    const item = GEAR_BY_ID[id];
    g.unlockId = (g.unlockId || 0) + 1;
    g.unlock = { id: g.unlockId, gear: id, who: t.name, cid: t.cid, look: t.look, at: now };
    say(g, `🏅 ${t.name} unlocked ${item.slot === 'title' ? `the title “${item.name}”` : item.name}!`, 'level', now);
  });
};

/** Gold a hero earns (it counts toward gold unlocks). */
const earn = (g, t, gold, now = g.clock) => {
  if (!t || gold <= 0) return;
  t.sheet.gold += gold;
  deed(g, t, 'gold', gold, now);
};

/** Puts on (or takes off) a piece of unlocked gear. */
export const wear = (g, t, slot, id, now = g.clock) => {
  if (!t || !t.sheet) return 'Nope.';
  const want = { ...(t.sheet.wear || {}), [slot]: id || null };
  const clean = cleanWear(want, t.sheet);
  if (id && clean[slot] !== id) return 'Not unlocked yet.';
  t.sheet.wear = clean;
  if (id) say(g, `${t.name} puts on ${GEAR_BY_ID[id].slot === 'title' ? `the title “${GEAR_BY_ID[id].name}”` : GEAR_BY_ID[id].name}.`, 'info', now);
  return null;
};

/** What just happened, for the action cam: the phone's close-up and the board's lunges, flashes and bubbles. */
const fx = (g, kind, from, to, extra = {}, now = g.clock) => {
  g.fxId = (g.fxId || 0) + 1;
  g.fx = { id: g.fxId, kind, from: from ? from.id : null, to: to ? to.id : null, at: now, ...extra };
};

const rng = (g) => {
  g.rollSeed = (g.rollSeed + 1) >>> 0;
  return makeRng(subSeed(g.seed, `r${g.rollSeed}`));
};

export const tokenById = (g, id) => g.tokens.find((t) => t.id === id);
export const pcFor = (g, cid) => g.tokens.find((t) => t.side === 'party' && t.cid === cid);
const alive = (t) => t && !t.dead && !t.gone;
const conscious = (t) => alive(t) && t.hp > 0;
const foes = (g) => g.tokens.filter((t) => t.side === 'foe' && alive(t));
const party = (g) => g.tokens.filter((t) => t.side === 'party' && !t.gone);

const occupantFor = (g, mover) => (x, y) => {
  const other = g.tokens.find((t) => alive(t) && t !== mover && t.x === x && t.y === y);
  if (!other) return null;
  if (other.hp <= 0) return 'ally'; // can step past someone who is down, not stop on them
  return other.side === mover.side ? 'ally' : 'enemy';
};

// ---- Building tokens ----------------------------------------------------------------------------------

const pcToken = (sheet, cid, spot) => {
  const s = normalizeCharacter(sheet);
  const uses = {};
  actionsOf(s).forEach((a) => { if (a.uses) uses[a.id] = a.uses; });
  return {
    id: `pc-${cid}`,
    side: 'party',
    cid,
    characterId: sheet.id || null,
    name: s.name,
    look: sheet.look || null,
    x: spot.x,
    y: spot.y,
    hp: s.hp,
    maxHp: s.maxHp,
    ac: acOf(s),
    speed: speedOf(s),
    sheet: s,
    uses,
    cond: {},
    deathSaves: { ok: 0, fail: 0 },
  };
};

const foeToken = (g, monsterId, spot, n) => {
  const m = MONSTERS[monsterId] || MONSTERS.goblin;
  return {
    id: `foe-${(g.foeId += 1)}`,
    side: 'foe',
    monster: m.id,
    name: n > 1 ? `${m.name} ${n}` : m.name,
    glyph: m.glyph,
    color: m.color,
    boss: Boolean(m.boss),
    x: spot.x,
    y: spot.y,
    hp: m.hp,
    maxHp: m.hp,
    ac: m.ac,
    speed: m.speed,
    cond: {},
    hidden: false,
  };
};

const freeSpotNear = (g, near) => {
  const used = new Set(g.tokens.filter(alive).map((t) => `${t.x},${t.y}`));
  const reach = reachable(g.map, near, 1000);
  const spots = [...reach.values()].filter((n) => !used.has(`${n.x},${n.y}`) && isOpen(tileAt(g.map, n.x, n.y)) && !PROPS[tileAt(g.map, n.x, n.y).p]?.exit)
    .sort((a, b) => a.cost - b.cost);
  return spots[0] || near;
};

// ---- Game setup ------------------------------------------------------------------------------------------------

/**
 * createGame({ seed, players: [{ cid, sheet }], campaign })
 * campaign: { id, name, notes, pastQuests: [titles], summaries: [text] } or null
 */
export const createGame = ({ seed = newSeed(), players = [], campaign = null, now = 0 } = {}) => {
  const quest = makeQuest(seed, campaign?.pastQuests || []);
  const g = {
    seed,
    quest,
    campaign,
    sceneIndex: 0,
    sceneSettings: [...quest.chain],
    map: null,
    tokens: [],
    mode: 'explore',
    combat: null,
    log: [],
    logId: 0,
    rolls: [],
    rollId: 0,
    rollSeed: 0,
    foeId: 0,
    cue: null,
    cueId: 0,
    narration: null,
    requests: [],
    transcript: [], // what people said out loud (speech to text on their phones)
    check: null,
    xpPool: 0,
    xpTotal: 0,
    loot: [],
    clock: now,
    nextFoeAt: 0,
    walking: [],
    complete: false,
    started: now,
    visited: [],
  };
  players.forEach((p) => addPlayer(g, p.cid, p.sheet, now, true));
  enterScene(g, 0, now, true);
  cue(g, 'start', '', now);
  return g;
};

const partyLevel = (g) => {
  const pcs = party(g);
  return pcs.length ? Math.max(1, Math.round(pcs.reduce((a, t) => a + t.sheet.level, 0) / pcs.length)) : 1;
};

/** Builds the map for scene `index` and puts everyone at the start. */
export const enterScene = (g, index, now = g.clock, first = false, settingId = null) => {
  const lastScene = index >= g.sceneSettings.length - 1;
  if (settingId) g.sceneSettings[index] = settingId;
  const setting = g.sceneSettings[index] || g.sceneSettings[g.sceneSettings.length - 1];
  g.sceneIndex = index;
  g.map = generateMap(setting, subSeed(g.seed, `scene${index}:${g.visited.length}`), {
    partySize: Math.max(1, party(g).length), partyLevel: partyLevel(g), boss: lastScene,
  });
  g.mode = 'explore';
  g.combat = null;
  g.check = null;
  g.visited.push(setting);
  party(g).forEach((p) => { deed(g, p, 'scenes', 1, now); deed(g, p, 'places', setting, now); });
  g.tokens = g.tokens.filter((t) => t.side === 'party');
  const pcs = party(g);
  pcs.forEach((t, i) => {
    const spot = g.map.start[i % g.map.start.length];
    t.x = spot.x;
    t.y = spot.y;
    if (!first) {
      // A short rest on the road: back on your feet, half your missing hit points back.
      if (t.hp <= 0 && !t.dead) t.hp = 1;
      if (!t.dead) t.hp = Math.min(t.maxHp, t.hp + Math.ceil((t.maxHp - t.hp) / 2));
      t.deathSaves = { ok: 0, fail: 0 };
      t.cond = {};
    }
  });
  const counts = {};
  g.map.spawns.forEach((s) => {
    counts[s.monster] = (counts[s.monster] || 0) + 1;
  });
  const seen = {};
  g.map.spawns.forEach((s) => {
    seen[s.monster] = (seen[s.monster] || 0) + 1;
    g.tokens.push(foeToken(g, s.monster, s, counts[s.monster] > 1 ? seen[s.monster] : 1));
  });
  // Monsters lie in wait until someone spots them or they spot someone.
  g.tokens.forEach((t) => { if (t.side === 'foe') t.hidden = true; });
  // The quest's villain is the last scene's boss.
  if (lastScene) {
    const boss = g.tokens.find((t) => t.side === 'foe' && t.boss);
    if (boss && g.quest?.villain) {
      const who = villainName(g.quest.villain);
      boss.name = PEOPLE_BOSSES.has(boss.monster) ? cap(who) : `${cap(who)}’s ${MONSTERS[boss.monster].name}`;
    }
  }
  g.searched = {};
  g.sneakTried = {};
  g.npcs = makeNpcs(subSeed(g.map.seed, 'npcs'), g.map.npcs || [], { monsters: g.map.spawns.map((sp) => sp.monster), chests: g.map.chests.length, quest: g.quest });
  say(g, `Scene ${index + 1}: ${settingFor(setting).name}.`, 'scene', now);
  if (!first) cue(g, lastScene ? 'boss' : 'scene', settingFor(setting).name, now);
  // Monsters are spotted once someone moves, so the party gets a moment to look around first.
};

export const addPlayer = (g, cid, sheet, now = g.clock, setup = false) => {
  const existing = pcFor(g, cid);
  if (existing) {
    existing.gone = false;
    if (sheet?.id && !existing.characterId) existing.characterId = sheet.id;
    return existing;
  }
  const spot = g.map ? freeSpotNear(g, g.map.start[0]) : { x: 0, y: 0 };
  const token = pcToken(sheet || {}, cid, spot);
  g.tokens.push(token);
  if (!setup) {
    say(g, `${token.name} the ${describe(token.sheet)} joins the party.`, 'system', now);
    if (g.combat) {
      g.combat.order.push(token.id);
    }
  }
  return token;
};

export const removePlayer = (g, cid, now = g.clock) => {
  const t = pcFor(g, cid);
  if (!t) return;
  t.gone = true;
  if (g.combat) {
    const index = g.combat.order.indexOf(t.id);
    if (index >= 0) {
      g.combat.order.splice(index, 1);
      if (g.combat.turn >= g.combat.order.length) g.combat.turn = 0;
      const wasCurrent = index === g.combat.turn;
      if (index < g.combat.turn) g.combat.turn -= 1;
      if (g.combat.turn >= g.combat.order.length) g.combat.turn = 0;
      if (wasCurrent) startTurn(g, now);
    }
  }
};

// ---- Spotting and combat --------------------------------------------------------------------------------

const SIGHT = 7; // squares, for noticing each other in the dark-ish

const revealFoes = (g, now) => {
  let spotted = 0;
  foes(g).forEach((f) => {
    if (!f.hidden) return;
    const sees = party(g).some((p) => conscious(p) && squaresBetween(p, f) <= SIGHT && lineOfSight(g.map, p, f));
    if (sees) {
      f.hidden = false;
      spotted += 1;
    }
  });
  if (spotted && g.mode === 'explore') {
    const names = [...new Set(foes(g).filter((f) => !f.hidden).map((f) => MONSTERS[f.monster].name))];
    startCombat(g, now, names.join(' and '));
  }
  return spotted;
};

export const startCombat = (g, now = g.clock, who = '') => {
  if (g.combat) return;
  const r = tools(rng(g));
  foes(g).forEach((f) => { if (squaresBetween(f, nearestPc(g, f) || f) <= SIGHT + 3) f.hidden = false; });
  const fighters = g.tokens.filter((t) => alive(t) && !t.hidden && (t.side === 'party' || t.side === 'foe'));
  const inits = fighters.map((t) => {
    const dex = t.side === 'party' ? mod(t.sheet.stats.dex) : Math.floor((MONSTERS[t.monster].toHit - 2) / 2);
    const value = r.int(1, 20) + dex;
    return { id: t.id, value, tie: r.rand() };
  }).sort((a, b) => b.value - a.value || b.tie - a.tie);
  // Heroes who snuck up catch the enemy off guard: every foe loses its first turn.
  const surprise = party(g).some((p) => conscious(p) && p.cond.sneaking);
  if (surprise) fighters.forEach((f) => { if (f.side === 'foe') f.cond.surprised = true; });
  g.mode = 'combat';
  g.combat = { order: inits.map((i) => i.id), turn: 0, round: 1, moved: 0, action: false, bonus: false, dashed: false, sneakUsed: false, inits: Object.fromEntries(inits.map((i) => [i.id, i.value])) };
  say(g, `Combat! Initiative: ${inits.map((i) => `${tokenById(g, i.id).name} ${i.value}`).join(', ')}.`, 'combat', now);
  if (surprise) {
    say(g, 'Surprise! The enemies never saw you coming and lose their first turn.', 'combat', now);
    party(g).forEach((p) => { if (p.cond.sneaking) deed(g, p, 'surprises', 1, now); });
  }
  cue(g, 'combat', `${who || 'Enemies'}${surprise ? ' (caught by surprise)' : ''}`, now);
  startTurn(g, now);
};

export const endCombat = (g, now = g.clock, reason = '') => {
  if (!g.combat) return;
  g.combat = null;
  g.mode = 'explore';
  party(g).forEach((t) => { t.cond = {}; });
  if (g.xpPool > 0) awardXp(g, g.xpPool, now, 'for the fight');
  g.xpPool = 0;
  say(g, reason || 'The fight is over.', 'combat', now);
  if (g.atExit) g.exitAt = now;
};

const currentId = (g) => (g.combat ? g.combat.order[g.combat.turn] : null);
export const current = (g) => tokenById(g, currentId(g));

const nearestPc = (g, from) => party(g).filter(conscious).sort((a, b) => squaresBetween(a, from) - squaresBetween(b, from))[0];

const startTurn = (g, now, depth = 0) => {
  const c = g.combat;
  if (!c || !c.order.length || depth > c.order.length + 2) return;
  c.moved = 0;
  c.action = false;
  c.bonus = false;
  c.dashed = false;
  c.sneakUsed = false;
  const t = current(g);
  if (!t || !alive(t)) {
    nextTurn(g, now);
    return;
  }
  if (t.cond.dodge) delete t.cond.dodge;
  if (t.side === 'foe') {
    g.nextFoeAt = now + FOE_TURN_MS;
  } else if (t.hp <= 0) {
    if (t.cond.stable) nextTurn(g, now, depth + 1);
    else deathSave(g, t, now, depth + 1);
  }
};

export const nextTurn = (g, now = g.clock, depth = 0) => {
  const c = g.combat;
  if (!c) return;
  for (let guard = 0; guard < c.order.length + 1; guard += 1) {
    c.turn += 1;
    if (c.turn >= c.order.length) {
      c.turn = 0;
      c.round += 1;
    }
    const t = current(g);
    if (t && alive(t) && !(t.side === 'party' && t.gone)) break;
  }
  startTurn(g, now, depth);
};

const deathSave = (g, t, now, depth = 0) => {
  const r = rng(g);
  const res = d20(0, 0, r);
  if (res.nat20) {
    t.hp = 1;
    t.deathSaves = { ok: 0, fail: 0 };
    say(g, `${t.name} rolls a natural 20 on a death save and gets back up!`, 'roll', now);
  } else {
    if (res.d20 >= 10) t.deathSaves.ok += 1;
    else t.deathSaves.fail += res.nat1 ? 2 : 1;
    say(g, `${t.name} death save: ${res.d20} (${t.deathSaves.ok} saved, ${t.deathSaves.fail} failed).`, 'roll', now);
    if (t.deathSaves.ok >= 3) {
      t.cond.stable = true;
      say(g, `${t.name} is stable.`, 'roll', now);
    }
    if (t.deathSaves.fail >= 3) {
      t.dead = true;
      say(g, `${t.name} has died. The DM can bring them back if the story allows.`, 'combat', now);
      cue(g, 'down', `${t.name} has fallen for good`, now);
    }
  }
  showRoll(g, { who: t.name, label: 'Death save', d20: res.d20, total: res.d20, ok: res.d20 >= 10 }, now);
  nextTurn(g, now, depth);
};

// ---- Damage, healing, XP --------------------------------------------------------------------------------------

const damage = (g, target, amount, now, source = '') => {
  let dealt = amount;
  if (target.cond.rage) dealt = Math.floor(dealt / 2);
  target.hp -= dealt;
  if (target.side === 'foe') {
    if (target.hp <= 0) {
      target.hp = 0;
      target.dead = true;
      const xp = MONSTERS[target.monster].xp;
      g.xpPool += xp;
      const by = g.hitter ? tokenById(g, g.hitter) : null;
      if (by) {
        deed(g, by, 'kills', 1, now);
        if (target.boss) deed(g, by, 'bosses', 1, now);
        if (UNDEAD.has(target.monster)) deed(g, by, 'undead', 1, now);
      }
      say(g, `${target.name} is defeated! (+${xp} XP)`, 'combat', now);
      checkTasks(g, now);
      if (g.combat) {
        const index = g.combat.order.indexOf(target.id);
        if (index >= 0) {
          g.combat.order.splice(index, 1);
          if (index < g.combat.turn) g.combat.turn -= 1;
        }
      }
      if (!foes(g).length) {
        const lastScene = g.sceneIndex >= g.sceneSettings.length - 1;
        endCombat(g, now, 'Every enemy is down.');
        cue(g, lastScene ? 'complete' : 'victory', '', now);
        if (lastScene) completeQuest(g, now);
      } else if (!foes(g).some((f) => !f.hidden)) {
        endCombat(g, now, 'No enemies in sight.');
        cue(g, 'victory', '', now);
      }
    }
  } else if (target.hp <= 0) {
    if (target.sheet.raceId === 'orc' && !target.relentlessUsed && target.hp + dealt > 0) {
      target.relentlessUsed = true;
      target.hp = 1;
      say(g, `${target.name} refuses to fall! (Relentless)`, 'combat', now);
    } else {
      // Damage past your hit points that equals your maximum kills outright. Otherwise you're down.
      if (-target.hp >= target.maxHp) {
        target.dead = true;
        say(g, `${target.name} is killed outright by ${source || 'the blow'}.`, 'combat', now);
      } else {
        say(g, `${target.name} drops, unconscious!`, 'combat', now);
        deed(g, target, 'downs', 1, now);
      }
      target.hp = 0;
      target.deathSaves = { ok: 0, fail: 0 };
      g.someoneFell = true;
      cue(g, 'down', target.name, now);
      if (!party(g).some(conscious) && g.combat) {
        say(g, 'The whole party is down… the DM decides what happens next.', 'combat', now);
        cue(g, 'down', 'The whole party', now);
      }
    }
  }
};

const heal = (g, target, amount, now) => {
  if (!target || target.dead) return 0;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, Math.max(0, target.hp) + amount);
  if (before <= 0 && target.hp > 0) {
    target.deathSaves = { ok: 0, fail: 0 };
    delete target.cond.stable;
    say(g, `${target.name} is back on their feet!`, 'heal', now);
  }
  return target.hp - Math.max(0, before);
};

export const awardXp = (g, total, now = g.clock, why = '') => {
  const pcs = party(g).filter((t) => !t.dead);
  if (!pcs.length || total <= 0) return;
  const each = Math.floor(total / pcs.length);
  g.xpTotal += each;
  pcs.forEach((t) => {
    const before = t.sheet.level;
    const had = unlockedIds(t.sheet);
    t.sheet.xp += each;
    t.sheet.level = levelForXp(t.sheet.xp);
    if (t.sheet.level > before) {
      const newMax = maxHpFor(t.sheet.classId, t.sheet.raceId, t.sheet.level, t.sheet.stats);
      t.hp += newMax - t.maxHp;
      t.maxHp = newMax;
      t.sheet.maxHp = newMax;
      say(g, `${t.name} reaches level ${t.sheet.level}!`, 'level', now);
      showRoll(g, { who: t.name, label: `Level ${t.sheet.level}!`, total: t.sheet.level, ok: true, level: true }, now);
      announceUnlocks(g, t, had, now);
    }
  });
  say(g, `Each hero earns ${each} XP ${why}.`.trim(), 'level', now);
};

const completeQuest = (g, now) => {
  if (g.complete) return;
  g.complete = true;
  party(g).filter((p) => !p.dead).forEach((p) => {
    deed(g, p, 'quests', 1, now);
    deed(g, p, 'classQuests', 1, now);
    if (!g.someoneFell) deed(g, p, 'flawless', 1, now);
  });
  awardXp(g, 100 * Math.max(1, party(g).length) * partyLevel(g), now, 'for finishing the quest');
  say(g, `Quest complete: ${g.quest.title}. Reward: ${g.quest.reward}.`, 'level', now);
};

// ---- Player actions ---------------------------------------------------------------------------------------------

const myTurn = (g, t) => !g.combat || currentId(g) === t.id;

/** Speed with what you carry: Boots of springing add 5 ft. */
const speedFor = (t) => t.speed + (hasItem(t.sheet, 'Boots of springing') ? 5 : 0);

/** Where this token may move right now, as a reachable() map, plus the feet left. */
export const movesFor = (g, t) => {
  if (!t || !conscious(t)) return { reach: new Map(), left: 0 };
  let left;
  if (g.combat) {
    if (currentId(g) !== t.id) return { reach: new Map(), left: 0 };
    left = speedFor(t) * (g.combat.dashed ? 2 : 1) - g.combat.moved;
  } else {
    left = speedFor(t); // exploring: no turns, but each move is one normal move
  }
  return { reach: reachable(g.map, t, Math.max(0, left), occupantFor(g, t)), left };
};

export const move = (g, t, to, now = g.clock) => {
  if (!t || !myTurn(g, t)) return 'Not your turn.';
  const { reach } = movesFor(g, t);
  const node = reach.get(`${to.x},${to.y}`);
  if (!node || !node.end) return 'Too far, or blocked.';
  const path = pathTo(reach, to);
  if (g.combat) g.combat.moved += node.cost;
  t.x = to.x;
  t.y = to.y;
  g.walking = g.walking.filter((w) => w.id !== t.id);
  g.walking.push({ id: t.id, path, at: now });
  path.forEach((step) => {
    const trap = (g.map.traps || []).find((tr) => tr.x === step.x && tr.y === step.y && !tr.found && !tr.sprung);
    if (trap && conscious(t)) springTrap(g, t, trap, now);
  });
  const tile = tileAt(g.map, t.x, t.y);
  if (tile?.p === 'exit' && !g.combat) {
    say(g, `${t.name} reaches the way onward.`, 'scene', now);
    if (!g.atExit) {
      cue(g, 'exit', '', now);
      g.exitAt = now;
    }
    g.atExit = true;
  }
  revealFoes(g, now);
  return null;
};

const targetOk = (g, attacker, target, action) => {
  if (!target || !alive(target)) return 'No target.';
  const range = action.range || 1;
  if (range <= 1 ? !adjacent(attacker, target) : squaresBetween(attacker, target) > range) return `Out of range (${range * 5} ft).`;
  if (range > 1 && !lineOfSight(g.map, attacker, target)) return 'Can’t see them from here.';
  return null;
};

/**
 * A player's action: { action: id, target: tokenId }.
 * Returns an error string, or null when it worked.
 */
export const act = (g, t, msg, now = g.clock) => {
  if (!t || !conscious(t)) return 'You are down.';
  if (!myTurn(g, t)) return 'Wait for your turn.';
  const a = actionsOf(t.sheet).find((x) => x.id === msg.action);
  if (msg.action === 'dash' || msg.action === 'dodge') {
    if (!g.combat) return 'Only in combat.';
    if (g.combat.action) return 'Action already used.';
    g.combat.action = true;
    if (msg.action === 'dash') g.combat.dashed = true;
    else t.cond.dodge = true;
    say(g, `${t.name} ${msg.action === 'dash' ? 'dashes' : 'takes the Dodge action'}.`, 'combat', now);
    return null;
  }
  if (!a) return 'Unknown action.';
  if (a.uses && !(t.uses[a.id] > 0)) return `${a.name} is used up until you rest.`;
  if (g.combat) {
    if (a.bonus ? g.combat.bonus : g.combat.action) return a.bonus ? 'Bonus action already used.' : 'Action already used.';
  }
  const nums = actionNumbers(t.sheet, a);
  g.hitter = t.id;
  const r = rng(g);
  const tr = tools(r);
  let target = msg.target ? tokenById(g, msg.target) : null;

  if (a.kind === 'self') {
    if (a.effect === 'dash') {
      if (!g.combat) return 'Only in combat.';
      g.combat.dashed = true;
    } else if (a.effect === 'inspire') {
      if (!target || target.side !== 'party' || target === t) return 'Pick an ally to inspire.';
      if (squaresBetween(t, target) > (a.range || 12)) return 'Too far to hear you.';
      target.cond.inspired = true;
      say(g, `${t.name} inspires ${target.name} (+1d6 on their next roll).`, 'combat', now);
      fx(g, 'buff', t, target, { label: a.name }, now);
    } else {
      t.cond[a.effect] = true;
      say(g, `${t.name} uses ${a.name}.`, 'combat', now);
      fx(g, 'buff', t, t, { label: a.name }, now);
    }
  } else if (a.kind === 'heal') {
    if (a.self) target = t;
    if (!target || target.side !== 'party') return 'Pick someone to heal.';
    if (!a.self && squaresBetween(t, target) > (a.range || 1)) return 'Too far.';
    const amount = a.perLevel ? a.perLevel * t.sheet.level : roll(a.dice, r).total + (a.addLevel ? t.sheet.level : 0) + Math.max(0, nums.dmgBonus);
    const healed = heal(g, target, amount, now);
    if (target !== t) deed(g, t, 'heals', healed, now);
    say(g, `${t.name} uses ${a.name} on ${target === t ? 'themselves' : target.name}: +${healed} HP.`, 'heal', now);
    fx(g, 'heal', t, target, { label: a.name, amount: healed }, now);
    showRoll(g, { who: t.name, label: a.name, total: healed, ok: true, heal: true }, now);
  } else {
    if (!g.combat) {
      // Attacking out of combat starts it, and you get the first swing.
      if (!target || target.side !== 'foe') return 'Pick an enemy.';
      const problem = targetOk(g, t, target, a);
      if (problem) return problem;
      target.hidden = false;
      startCombat(g, now, MONSTERS[target.monster].name);
      const index = g.combat.order.indexOf(t.id);
      if (index > 0) {
        g.combat.order.splice(index, 1);
        g.combat.order.unshift(t.id);
        g.combat.turn = 0;
        startTurn(g, now);
      }
    }
    if (!target || target.side !== 'foe') return 'Pick an enemy.';
    const problem = targetOk(g, t, target, a);
    if (problem) return problem;
    const targets = a.area ? foes(g).filter((f) => !f.hidden && squaresBetween(f, target) <= a.area) : [target];
    if (a.kind === 'auto') {
      const dmg = roll(a.dice, r).total;
      fx(g, 'spell', t, target, { label: a.name, dmg }, now);
      damage(g, target, dmg, now, a.name);
      say(g, `${t.name} casts ${a.name}: ${dmg} damage to ${target.name}.`, 'combat', now);
      showRoll(g, { who: t.name, label: a.name, total: dmg, ok: true, dmg: true }, now);
    } else if (a.kind === 'save') {
      fx(g, 'spell', t, target, { label: a.name }, now);
      targets.forEach((f) => {
        const saveBonus = Math.floor((MONSTERS[f.monster].cr || 0) / 2) + 1;
        const sv = d20(saveBonus, 0, r);
        const full = roll(a.dice, r).total;
        const dmg = sv.total >= nums.saveDc ? (a.area ? Math.floor(full / 2) : 0) : full;
        say(g, `${f.name} ${sv.total >= nums.saveDc ? 'resists' : 'fails'} the ${a.name} save (${sv.total} vs DC ${nums.saveDc}): ${dmg} damage.`, 'combat', now);
        showRoll(g, { who: f.name, label: `${a.name} save`, d20: sv.d20, total: sv.total, ok: sv.total < nums.saveDc, dmg }, now);
        if (dmg > 0) damage(g, f, dmg, now, a.name);
      });
    } else {
      let adv = target.cond.dodge ? -1 : 0;
      if (t.cond.mark) adv = Math.max(adv, 0);
      // Striking from hiding, or at a foe who's tied up or caught by surprise, has advantage.
      if (t.cond.sneaking || target.cond.surprised || target.cond.stunned) adv = 1;
      delete t.cond.sneaking;
      // Ranged attacks with an enemy right next to you are at disadvantage.
      if ((a.range || 1) > 1 && foes(g).some((f) => !f.hidden && f.hp > 0 && adjacent(f, t))) adv = -1;
      let bonus = nums.toHit;
      if (t.cond.inspired) {
        bonus += tr.int(1, 6);
        delete t.cond.inspired;
      }
      const atk = d20(bonus, adv, r);
      const hit = atk.nat20 || (!atk.nat1 && atk.total >= target.ac);
      if (hit) {
        let dmg = roll(atk.nat20 ? critDice(a.dice) : a.dice, r).total + Math.max(0, nums.dmgBonus);
        if (t.cond.rage && (a.range || 1) <= 1) dmg += 2;
        if (t.cond.mark) dmg += roll('1d6', r).total;
        const allyClose = party(g).some((p) => p !== t && conscious(p) && adjacent(p, target));
        if (a.sneak && !g.combat.sneakUsed && (allyClose || adv > 0)) {
          const sneakDice = `${Math.ceil(t.sheet.level / 2)}d6`;
          dmg += roll(atk.nat20 ? critDice(sneakDice) : sneakDice, r).total;
          g.combat.sneakUsed = true;
        }
        say(g, `${t.name} hits ${target.name} with ${a.name} (${atk.total} vs AC ${target.ac}) for ${dmg}${atk.nat20 ? '. Critical hit!' : '.'}`, 'combat', now);
        fx(g, a.spell ? 'spell' : (a.range || 1) > 1 ? 'shoot' : 'hit', t, target, { label: a.name, dmg, crit: atk.nat20 }, now);
        showRoll(g, { who: t.name, label: a.name, d20: atk.d20, total: atk.total, ok: true, dmg, crit: atk.nat20 }, now);
        if (atk.nat20) {
          cue(g, 'crit', `${t.name} vs ${target.name}`, now);
          deed(g, t, 'crits', 1, now);
        }
        damage(g, target, dmg, now, a.name);
      } else {
        say(g, `${t.name} misses ${target.name} with ${a.name} (${atk.total} vs AC ${target.ac}).`, 'combat', now);
        fx(g, 'miss', t, target, { label: a.name, ranged: (a.range || 1) > 1 }, now);
        showRoll(g, { who: t.name, label: a.name, d20: atk.d20, total: atk.total, ok: false }, now);
      }
    }
  }
  if (a.uses) t.uses[a.id] -= 1;
  if (g.combat) {
    if (a.bonus) g.combat.bonus = true;
    else g.combat.action = true;
  }
  return null;
};

/** Opens a chest next to you. */
export const interact = (g, t, now = g.clock, { key = false } = {}) => {
  if (!t || !conscious(t)) return 'You are down.';
  if (g.combat && currentId(g) !== t.id) return 'Wait for your turn.';
  const chest = g.map.chests.find((c) => adjacent(c, t) && tileAt(g.map, c.x, c.y).p === 'chest');
  if (!chest) return 'Nothing to open here.';
  if (g.combat) {
    if (g.combat.action) return 'Action already used.';
    g.combat.action = true;
  }
  const r = tools(rng(g));
  const tile = tileAt(g.map, chest.x, chest.y);
  tile.p = null;
  if (!key && ['dungeon', 'cave', 'castle'].includes(g.map.setting) && r.chance(0.12)) {
    const m = foeToken(g, 'mimic', chest, 1);
    m.hidden = false;
    g.tokens.push(m);
    say(g, `${t.name} opens the chest… and it bites back! A Mimic!`, 'combat', now);
    cue(g, 'mimic', '', now);
    deed(g, t, 'mimics', 1, now);
    if (g.combat) g.combat.order.splice(g.combat.turn + 1, 0, m.id);
    else startCombat(g, now, 'A Mimic');
    return null;
  }
  const gold = r.int(5, 25) * partyLevel(g) * (key ? 2 : 1);
  const item = r.pick(LOOT);
  if (key) say(g, `${t.name} turns the Strange key. The lock clicks open, and a hidden tray inside is full of coins.`, 'loot', now);
  earn(g, t, gold, now);
  deed(g, t, 'chests', 1, now);
  t.sheet.inventory.push(item);
  g.loot.push({ who: t.name, item, gold });
  say(g, `${t.name} opens the chest: ${gold} gold and ${item}.`, 'loot', now);
  fx(g, 'loot', t, t, { label: item, gold }, now);
  showRoll(g, { who: t.name, label: item, total: gold, ok: true, loot: true }, now);
  cue(g, 'loot', `${t.name} finds ${item} and ${gold} gold`, now);
  const owner = (g.npcs || []).find((n) => n.talked && !n.done && n.task.kind === 'fetch');
  if (owner) {
    t.sheet.inventory.push(cap(owner.task.item));
    owner.found = t.name;
    say(g, `${t.name} also finds ${owner.name}’s ${owner.task.item}!`, 'loot', now);
    checkTasks(g, now);
  }
  return null;
};


/** The NPC standing next to this hero, if any. */
const npcNear = (g, t) => (g.npcs || []).find((n) => adjacent(n, t));

/** Side tasks: done once the monsters are gone or the keepsake is found. Pays out right away. */
const checkTasks = (g, now) => {
  (g.npcs || []).forEach((n) => {
    if (!n.talked || n.done) return;
    const { task } = n;
    let done = false;
    if (task.kind === 'slay') done = !foes(g).some((f) => f.monster === task.monster);
    if (task.kind === 'fetch') done = Boolean(n.found);
    if (!done) return;
    n.done = true;
    const pcs = party(g).filter((p) => !p.dead);
    const gold = 10 * partyLevel(g) * Math.max(1, task.count || 2);
    pcs.forEach((p) => {
      earn(g, p, Math.ceil(gold / Math.max(1, pcs.length)), now);
      deed(g, p, 'tasks', 1, now);
    });
    awardXp(g, 50 * Math.max(1, pcs.length) * partyLevel(g), now, `for helping ${n.name}`);
    if (task.kind === 'fetch') {
      const holder = pcs.find((p) => p.sheet.inventory.includes(cap(task.item)));
      if (holder) holder.sheet.inventory.splice(holder.sheet.inventory.indexOf(cap(task.item)), 1);
    }
    say(g, `Side task done: ${taskLabel(n)}. ${n.name} pays ${gold} gold.`, 'level', now);
  });
};

/** Talk to the NPC next to you: a clue, a side task, or thanks. */
export const talk = (g, t, now = g.clock) => {
  if (!t || !conscious(t)) return 'You are down.';
  const n = npcNear(g, t);
  if (!n) return 'Nobody to talk to here.';
  if (n.angry) {
    sayNpc(g, n, n.angryLine || 'Get away from me, thief!', now, t);
    return null;
  }
  const first = !n.talked;
  n.talked = true;
  if (first && n.task.kind === 'fetch' && !g.map.chests.some((c) => tileAt(g.map, c.x, c.y).p === 'chest')) {
    n.task = { kind: 'clue', line: 'Never mind. Looks like someone already emptied every chest around here. Good luck out there.' };
  }
  if (first && n.task.kind === 'slay') n.task.count = foes(g).filter((f) => f.monster === n.task.monster).length || n.task.count;
  checkTasks(g, now);
  const line = npcLine(n, rng(g));
  if (n.done) n.rewarded = true;
  sayNpc(g, n, line, now, t);
  if (first && n.task.kind === 'clue') awardXp(g, 10 * Math.max(1, party(g).length), now, `for listening to ${n.name}`);
  return null;
};

// ---- Skills: social tricks, searching, sneaking, items and shops ------------------------------------------------

/** Skills each class is trained in on top of its two main abilities. */
const TRAINED = {
  rogue: ['Sleight of Hand', 'Stealth', 'Investigation', 'Perception', 'Deception'],
  bard: ['Persuasion', 'Deception', 'Performance', 'Sleight of Hand'],
  ranger: ['Survival', 'Stealth', 'Perception', 'Nature'],
  cleric: ['Religion', 'Insight', 'Medicine'],
  wizard: ['Arcana', 'Investigation', 'History'],
  paladin: ['Intimidation', 'Athletics', 'Persuasion'],
  fighter: ['Athletics', 'Intimidation', 'Perception'],
  barbarian: ['Athletics', 'Intimidation', 'Survival'],
};

/** The bonus a hero adds to a skill roll. */
export const skillBonus = (t, skill) => {
  const stat = SKILLS[skill] || 'wis';
  const cls = CLASSES[t.sheet.classId] || CLASSES.fighter;
  const trained = cls.primary.slice(0, 2).includes(stat) || (TRAINED[t.sheet.classId] || []).includes(skill) || (skill === 'Perception' && t.sheet.raceId === 'elf');
  let bonus = mod(t.sheet.stats[stat]) + (trained ? proficiency(t.sheet.level) : 0);
  if (hasItem(t.sheet, 'Lucky coin')) bonus += 1;
  if (skill === 'Stealth' && hasItem(t.sheet, 'Elven cloak')) bonus += 5;
  if ((skill === 'Investigation' || skill === 'Perception') && hasItem(t.sheet, 'Lantern')) bonus += 2;
  return bonus;
};

/** Rolls a skill for a hero and shows it on the TV. Returns { ok, d20, total, nat1, nat20 }. */
const skillCheck = (g, t, skill, dc, now, { adv = 0, label = skill } = {}) => {
  const r = tools(rng(g));
  let bonus = skillBonus(t, skill);
  if (t.cond.inspired) {
    bonus += r.int(1, 6);
    delete t.cond.inspired;
  }
  let res = d20(bonus, adv, r.rand);
  if (res.nat1 && t.sheet.raceId === 'halfling' && !t.luckyUsed) {
    t.luckyUsed = true;
    say(g, `${t.name} is Lucky and rerolls the 1.`, 'roll', now);
    res = d20(bonus, adv, r.rand);
  }
  const ok = res.nat20 || (!res.nat1 && res.total >= dc);
  say(g, `${t.name} rolls ${label}: ${res.total} (${res.d20}${bonus >= 0 ? '+' : ''}${bonus}) vs DC ${dc}. ${ok ? 'Success!' : 'Fail.'}`, 'roll', now);
  showRoll(g, { who: t.name, label, d20: res.d20, total: res.total, ok }, now);
  return { ok, d20: res.d20, total: res.total, nat1: res.nat1, nat20: res.nat20 };
};

/** Checks the action economy before a skill or item. Returns an error, or null. */
const canSpend = (g, t, bonus = false) => {
  if (!t || !conscious(t)) return 'You are down.';
  if (!g.combat) return null;
  if (currentId(g) !== t.id) return 'Wait for your turn.';
  if (bonus ? g.combat.bonus : g.combat.action) return bonus ? 'Bonus action already used.' : 'Action already used.';
  return null;
};

const spend = (g, bonus = false) => {
  if (!g.combat) return;
  if (bonus) g.combat.bonus = true;
  else g.combat.action = true;
};

/** An NPC says something on the TV. */
const sayNpc = (g, n, line, now, t = null) => {
  fx(g, 'talk', n, t, { text: line }, now);
  const text = `${n.name} the ${n.role.toLowerCase()}: “${line}”`;
  g.narrationId = (g.narrationId || 0) + 1;
  g.narration = { text, by: 'npc', at: now, id: g.narrationId };
  say(g, text, 'narrate', now);
};

/** Someone steps on a hidden trap. A Dexterity save (DC 13) dodges it. */
const springTrap = (g, t, trap, now) => {
  // Sharp eyes (passive Perception 14 or more) spot it in time.
  if (10 + skillBonus(t, 'Perception') >= 15) {
    trap.found = true;
    deed(g, t, 'traps', 1, now);
    say(g, `${t.name} spots ${trap.kind} just in time and steps around it.`, 'roll', now);
    return;
  }
  trap.sprung = true;
  trap.found = true;
  g.hitter = null;
  const r = rng(g);
  const save = d20(mod(t.sheet.stats.dex) + (t.sheet.classId === 'rogue' ? proficiency(t.sheet.level) : 0), 0, r);
  const ok = save.total >= 13;
  const dmg = ok ? 0 : roll(partyLevel(g) >= 3 ? '2d6' : '1d6', r).total;
  say(g, `${t.name} sets off ${trap.kind}! Dexterity save ${save.total} vs DC 13: ${ok ? 'dodged it!' : `${dmg} damage.`}`, 'combat', now);
  showRoll(g, { who: t.name, label: 'Trap!', d20: save.d20, total: save.total, ok, dmg: dmg || undefined }, now);
  fx(g, 'trap', null, t, { label: trap.kind, dmg, ok }, now);
  cue(g, 'action', `${t.name} sets off ${trap.kind}${ok ? ' but dodges' : ` and takes ${dmg} damage`}`, now);
  if (dmg) damage(g, t, dmg, now, trap.kind);
};

/** The shop this hero can use right now: a merchant next to them, or a market stall. */
const shopNear = (g, t) => {
  if (!t || g.combat) return null;
  const n = npcNear(g, t);
  if (n && MERCHANT_ROLES.has(n.role) && !n.angry && !n.scared) return { name: `${n.name} the ${n.role.toLowerCase()}`, friendly: Boolean(n.friendly), npc: n };
  const stall = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].some(([dx, dy]) => tileAt(g.map, t.x + dx, t.y + dy)?.p === 'stall');
  if (stall) return { name: 'the market stall', friendly: false, npc: null };
  return null;
};

const SOCIAL = {
  persuade: { skill: 'Persuasion', dc: 12, label: 'Persuasion' },
  intimidate: { skill: 'Intimidation', dc: 13, label: 'Intimidation' },
  pickpocket: { skill: 'Sleight of Hand', dc: 13, label: 'Pickpocket' },
};

/** Persuade, Intimidate or Pickpocket the NPC next to you. */
export const social = (g, t, kind, now = g.clock) => {
  const how = SOCIAL[kind];
  if (!how) return 'Unknown action.';
  const n = t && npcNear(g, t);
  if (!n) return 'Nobody here.';
  const problem = canSpend(g, t);
  if (problem) return problem;
  if (n.angry) return `${n.name} won’t deal with you anymore.`;
  n.tried = n.tried || {};
  if (n.tried[kind]) return `You already tried that on ${n.name}.`;
  n.tried[kind] = true;
  spend(g);
  const r = tools(rng(g));
  const lvl = partyLevel(g);
  const res = skillCheck(g, t, how.skill, how.dc, now, { adv: kind === 'pickpocket' && t.sheet.classId === 'rogue' ? 1 : 0, label: how.label });
  if (kind === 'persuade') {
    if (res.ok) {
      n.friendly = true;
      deed(g, t, 'persuades', 1, now);
      const counts = {};
      foes(g).forEach((f) => { counts[f.name.replace(/ \d+$/, '')] = (counts[f.name.replace(/ \d+$/, '')] || 0) + 1; });
      const ahead = Object.entries(counts).map(([name, c]) => (c > 1 ? `${c} ${name.toLowerCase()}s` : `a ${name.toLowerCase()}`));
      const trap = (g.map.traps || []).filter((x) => !x.found && !x.sprung).sort((a, b) => squaresBetween(a, t) - squaresBetween(b, t))[0];
      if (trap) trap.found = true;
      const line = `${ahead.length ? `Listen close. Up ahead there’s ${ahead.join(', ')}.` : 'It’s quiet ahead, for now.'}${trap ? ` And watch your step: I saw ${trap.kind} out there.` : ''}${MERCHANT_ROLES.has(n.role) ? ' For you, friend, a discount.' : ''}`;
      sayNpc(g, n, line, now, t);
      awardXp(g, 15 * Math.max(1, party(g).length), now, `for winning over ${n.name}`);
    } else {
      sayNpc(g, n, r.pick(PERSUADE_FAIL), now, t);
    }
    cue(g, 'action', `${t.name} tries to persuade ${n.name} the ${n.role.toLowerCase()} and ${res.ok ? 'wins them over' : 'fails'}`, now);
  } else if (kind === 'intimidate') {
    if (res.ok) {
      const gold = r.int(5, 15) * lvl;
      earn(g, t, gold, now);
      deed(g, t, 'intimidates', 1, now);
      n.scared = true;
      sayNpc(g, n, r.pick(INTIMIDATE_OK(gold)), now, t);
    } else {
      n.angry = true;
      n.angryLine = 'You think you scare me? Get lost.';
      sayNpc(g, n, r.pick(INTIMIDATE_FAIL), now, t);
    }
    fx(g, 'shout', t, n, { text: 'Hand over your coin. Now.', reply: g.fx && g.fx.kind === 'talk' ? g.fx.text : '', ok: res.ok }, now);
    cue(g, 'action', `${t.name} tries to intimidate ${n.name} the ${n.role.toLowerCase()} and ${res.ok ? 'scares some gold out of them' : 'gets laughed at'}`, now);
  } else {
    if (res.ok) {
      const gold = r.int(10, 30) * lvl;
      earn(g, t, gold, now);
      deed(g, t, 'pockets', 1, now);
      const item = r.chance(0.35) ? r.pick(LOOT) : null;
      if (item) t.sheet.inventory.push(item);
      say(g, `${t.name} lifts ${gold} gold${item ? ` and ${item}` : ''} from ${n.name} without a sound.`, 'loot', now);
      fx(g, 'steal', t, n, { gold, label: item }, now);
      showRoll(g, { who: t.name, label: item || 'Pickpocket', total: gold, ok: true, loot: true }, now);
      cue(g, 'action', `${t.name} quietly picks ${n.name}’s pocket and gets away with ${gold} gold`, now);
    } else {
      n.angry = true;
      n.angryLine = 'Thief! Keep your hands where I can see them!';
      const yell = r.pick(CAUGHT);
      sayNpc(g, n, yell, now, t);
      fx(g, 'caught', t, n, { text: yell }, now);
      const guards = res.nat1 || GUARDED_ROLES.has(n.role) || Boolean(g.map.village);
      g.fx.guards = guards;
      if (guards) {
        const guard = foeToken(g, 'thug', freeSpotNear(g, n), 1);
        guard.name = 'Town guard';
        guard.hidden = false;
        g.tokens.push(guard);
        say(g, 'A Town guard comes running, sword drawn!', 'combat', now);
        if (g.combat) g.combat.order.splice(g.combat.turn + 1, 0, guard.id);
        else startCombat(g, now, 'A Town guard');
      }
      cue(g, 'action', `${t.name} tries to pick ${n.name}’s pocket and gets caught${guards ? '. A guard attacks' : ''}`, now);
    }
  }
  return null;
};

/** Buys an item at the shop next to you. */
export const buy = (g, t, item, now = g.clock) => {
  if (!t || !conscious(t)) return 'You are down.';
  if (g.combat) return 'Not in the middle of a fight!';
  const shop = shopNear(g, t);
  if (!shop) return 'No shop here.';
  if (!SHOP_STOCK.includes(item)) return 'They don’t sell that.';
  const price = buyPrice(item, shop.friendly);
  if (t.sheet.gold < price) return `You need ${price} gold.`;
  if (t.sheet.inventory.length >= 40) return 'Your pack is full.';
  t.sheet.gold -= price;
  t.sheet.inventory.push(item);
  deed(g, t, 'shopping', 1, now);
  say(g, `${t.name} buys ${item} from ${shop.name} for ${price} gold.`, 'loot', now);
  fx(g, 'trade', t, shop.npc, { label: item, gold: -price }, now);
  return null;
};

/** Sells an item from your pack at the shop next to you. */
export const sell = (g, t, item, now = g.clock) => {
  if (!t || !conscious(t)) return 'You are down.';
  if (g.combat) return 'Not in the middle of a fight!';
  const shop = shopNear(g, t);
  if (!shop) return 'No shop here.';
  const index = t.sheet.inventory.indexOf(item);
  if (index < 0) return 'You don’t have that.';
  if (!ITEMS[item]) return 'Nobody wants to buy that.';
  const gold = sellValue(item);
  t.sheet.inventory.splice(index, 1);
  earn(g, t, gold, now);
  say(g, `${t.name} sells ${item} to ${shop.name} for ${gold} gold.`, 'loot', now);
  fx(g, 'trade', t, shop.npc, { label: item, gold }, now);
  return null;
};

/** Searches around you for traps (20 ft) and hidden stashes (15 ft). Once per spot. */
export const search = (g, t, now = g.clock) => {
  const problem = canSpend(g, t);
  if (problem) return problem;
  const key = `${t.x},${t.y}`;
  if (g.searched[key]) return 'You already searched here. Move somewhere else.';
  g.searched[key] = true;
  spend(g);
  const skill = skillBonus(t, 'Investigation') >= skillBonus(t, 'Perception') ? 'Investigation' : 'Perception';
  const res = skillCheck(g, t, skill, 12, now, { label: `Search (${skill})` });
  if (!res.ok) {
    say(g, `${t.name} searches but finds nothing.`, 'info', now);
    fx(g, 'search', t, t, { found: 0 }, now);
    return null;
  }
  const traps = (g.map.traps || []).filter((x) => !x.found && !x.sprung && squaresBetween(x, t) <= 4);
  traps.forEach((x) => { x.found = true; });
  deed(g, t, 'traps', traps.length, now);
  const caches = (g.map.caches || []).filter((x) => !x.found && squaresBetween(x, t) <= 3);
  const r = tools(rng(g));
  caches.forEach((c) => {
    c.found = true;
    const gold = r.int(5, 20) * partyLevel(g);
    const item = r.pick(LOOT);
    earn(g, t, gold, now);
    deed(g, t, 'stashes', 1, now);
    t.sheet.inventory.push(item);
    g.loot.push({ who: t.name, item, gold });
    say(g, `${t.name} finds a hidden stash ${c.what}: ${gold} gold and ${item}!`, 'loot', now);
    showRoll(g, { who: t.name, label: item, total: gold, ok: true, loot: true }, now);
  });
  if (traps.length) say(g, `${t.name} spots ${traps.map((x) => x.kind).join(' and ')}. Marked on the map, so nobody steps on ${traps.length > 1 ? 'them' : 'it'}.`, 'roll', now);
  fx(g, 'search', t, t, { found: traps.length + caches.length, traps: traps.length, stashes: caches.length }, now);
  if (!traps.length && !caches.length) say(g, `${t.name} searches carefully. Nothing hidden around here.`, 'info', now);
  else cue(g, 'action', `${t.name} searches and finds ${[...caches.map(() => 'a hidden stash'), ...traps.map((x) => x.kind)].join(' and ')}`, now);
  return null;
};

/** Sneaks (Stealth DC 12). Sneaking heroes surprise the enemy: foes lose their first turn and your first hit has advantage. */
export const sneak = (g, t, now = g.clock) => {
  if (!t || !conscious(t)) return 'You are down.';
  if (g.combat) return 'Too late to sneak, they’ve seen you!';
  if (t.cond.sneaking) return 'You’re already sneaking.';
  const key = `${t.id}@${t.x},${t.y}`;
  if (g.sneakTried[key]) return 'Move somewhere else before you try again.';
  g.sneakTried[key] = true;
  const res = skillCheck(g, t, 'Stealth', 12, now, { label: 'Sneak (Stealth)' });
  if (res.ok) {
    t.cond.sneaking = true;
    say(g, `${t.name} slips into the shadows. Enemies who meet them will be caught by surprise.`, 'info', now);
  } else {
    say(g, `${t.name} tries to sneak, but kicks a loose stone. Not so quiet.`, 'info', now);
  }
  return null;
};

/** Uses an item from your pack. target: a token id for items you aim. */
export const applyItem = (g, t, item, targetId = null, now = g.clock) => {
  const def = ITEMS[item];
  if (!t) return 'Nope.';
  if (!def || !def.use) return 'You can’t use that.';
  const index = t.sheet.inventory.indexOf(item);
  if (index < 0) return 'You don’t have that.';
  if (def.use === 'heal') return drinkPotion(g, t, now);
  if (def.use === 'key') {
    const err = interact(g, t, now, { key: true });
    if (!err) t.sheet.inventory.splice(t.sheet.inventory.indexOf(item), 1);
    return err;
  }
  const problem = canSpend(g, t, def.bonus);
  if (problem) return problem;
  let target = null;
  if (def.target === 'foe') {
    target = targetId ? tokenById(g, targetId) : null;
    if (!target || target.side !== 'foe' || !alive(target) || target.hidden) return 'Pick an enemy.';
    if (def.range <= 1 ? !adjacent(t, target) : squaresBetween(t, target) > def.range) return `Out of range (${def.range * 5} ft).`;
    if (def.range > 1 && !lineOfSight(g.map, t, target)) return 'Can’t see them from here.';
  }
  const fightOnly = ['smoke', 'rope', 'caltrops', 'shield', 'climb'];
  if (!g.combat && fightOnly.includes(def.use)) return 'Save that for a fight.';
  if (def.use === 'caltrops' && !foes(g).some((f) => !f.hidden && adjacent(f, t))) return 'No enemy next to you.';
  const r = rng(g);
  // Throwing or zapping something at a foe who hasn't noticed you starts the fight with you going first.
  if (target && !g.combat) {
    startCombat(g, now, MONSTERS[target.monster].name);
    const at = g.combat.order.indexOf(t.id);
    if (at > 0) {
      g.combat.order.splice(at, 1);
      g.combat.order.unshift(t.id);
      g.combat.turn = 0;
      startTurn(g, now);
    }
  }
  t.sheet.inventory.splice(t.sheet.inventory.indexOf(item), 1);
  spend(g, def.bonus);
  g.hitter = t.id;
  deed(g, t, 'items', 1, now);
  fx(g, 'item', t, target || t, { label: item }, now);
  switch (def.use) {
    case 'smoke': {
      const allies = party(g).filter((p) => conscious(p) && squaresBetween(p, t) <= 2);
      allies.forEach((p) => { p.cond.dodge = true; });
      say(g, `${t.name} throws a Smoke bomb! ${allies.map((p) => p.name).join(', ')} vanish in the smoke and are hard to hit.`, 'combat', now);
      break;
    }
    case 'rope': {
      const res = skillCheck(g, t, 'Athletics', 12, now, { label: 'Rope (Athletics)' });
      if (res.ok) {
        target.cond.stunned = true;
        say(g, `${t.name} ropes ${target.name}! It loses its next turn.`, 'combat', now);
      } else say(g, `${target.name} slips out of ${t.name}’s rope.`, 'combat', now);
      break;
    }
    case 'holy':
    case 'sparks': {
      const undead = UNDEAD.has(target.monster);
      const dmg = roll(def.use === 'holy' && undead ? '4d6' : '2d6', r).total;
      say(g, def.use === 'holy'
        ? `${t.name} splashes Holy water on ${target.name}${undead ? '. It burns and hisses!' : '.'} ${dmg} damage.`
        : `${t.name} zaps ${target.name} with the Wand of sparks for ${dmg}.`, 'combat', now);
      showRoll(g, { who: t.name, label: item, total: dmg, ok: true, dmg }, now);
      fx(g, def.use === 'holy' ? 'item' : 'spell', t, target, { label: item, dmg }, now);
      damage(g, target, dmg, now, item);
      break;
    }
    case 'shield':
      t.cond.shield = true;
      say(g, `${t.name} reads the Scroll of Shield. A shimmering barrier: +5 AC for the rest of the fight.`, 'combat', now);
      break;
    case 'caltrops': {
      const near = foes(g).filter((f) => !f.hidden && adjacent(f, t));
      say(g, `${t.name} scatters caltrops!`, 'combat', now);
      near.forEach((f) => {
        const dmg = roll('1d4', r).total;
        say(g, `${f.name} steps on them: ${dmg} damage.`, 'combat', now);
        damage(g, f, dmg, now, 'caltrops');
      });
      break;
    }
    case 'ale': {
      const healed = heal(g, t, roll('1d4', r).total, now);
      t.cond.inspired = true;
      say(g, `${t.name} downs a Dwarven ale: +${healed} HP and fired up (+1d6 on the next roll).`, 'heal', now);
      break;
    }
    case 'map': {
      const traps = (g.map.traps || []).filter((x) => !x.found && !x.sprung);
      traps.forEach((x) => { x.found = true; });
      say(g, traps.length ? `${t.name} reads the Map fragment: ${traps.length} trap${traps.length > 1 ? 's' : ''} marked on the map!` : `${t.name} reads the Map fragment. No traps left around here.`, 'info', now);
      break;
    }
    case 'climb':
      g.combat.moved -= 10;
      say(g, `${t.name} drinks a Potion of Climbing and scrambles 10 ft farther this turn.`, 'combat', now);
      break;
    default: break;
  }
  return null;
};

export const endTurn = (g, t, now = g.clock) => {
  if (!g.combat || currentId(g) !== t?.id) return 'Not your turn.';
  nextTurn(g, now);
  return null;
};

/** Uses a Potion of Healing from the inventory. */
export const drinkPotion = (g, t, now = g.clock) => {
  if (!t || t.dead) return 'Nope.';
  const index = t.sheet.inventory.indexOf('Potion of Healing');
  if (index < 0) return 'No potions.';
  if (g.combat) {
    if (currentId(g) !== t.id) return 'Wait for your turn.';
    if (g.combat.bonus) return 'Bonus action already used.';
    g.combat.bonus = true;
  }
  t.sheet.inventory.splice(index, 1);
  deed(g, t, 'potions', 1, now);
  deed(g, t, 'items', 1, now);
  const healed = heal(g, t, roll('2d4+2', rng(g)).total, now);
  say(g, `${t.name} drinks a Potion of Healing: +${healed} HP.`, 'heal', now);
  return null;
};

/** A free-form "I try to…" from a player, for the DM and the narrator. */
export const request = (g, t, text, now = g.clock) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!clean || !t) return 'Say what you do.';
  g.requests.push({ id: `${t.id}-${now}`, who: t.name, cid: t.cid, text: clean, at: now });
  if (g.requests.length > 12) g.requests.shift();
  say(g, `${t.name}: “${clean}”`, 'say', now);
  cue(g, 'action', `${t.name} tries to ${clean.replace(/^i\s+(try to\s+)?/i, '')}`, now);
  return null;
};

/** A phrase someone said out loud, from their phone's speech to text. Kept for the narrator and the recap. */
export const hear = (g, who, text, now = g.clock) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!clean || !who) return;
  if (!g.transcript) g.transcript = [];
  g.transcript.push({ who: String(who).slice(0, 24), text: clean, at: now });
  if (g.transcript.length > 600) g.transcript.shift();
};

/** The answer to a skill check the DM asked for. */
export const rollCheck = (g, t, now = g.clock) => {
  const c = g.check;
  if (!c || !t) return 'No check right now.';
  if (c.cid && c.cid !== t.cid) return 'This check isn’t yours.';
  if (c.results[t.cid]) return 'Already rolled.';
  const stat = SKILLS[c.skill] || 'wis';
  const cls = CLASSES[t.sheet.classId];
  const trained = cls.primary.slice(0, 2).includes(stat) || (c.skill === 'Perception' && t.sheet.raceId === 'elf');
  let bonus = mod(t.sheet.stats[stat]) + (trained ? proficiency(t.sheet.level) : 0);
  const r = tools(rng(g));
  if (t.cond.inspired) {
    bonus += r.int(1, 6);
    delete t.cond.inspired;
  }
  const adv = c.skill === 'Perception' && t.sheet.raceId === 'elf' ? 1 : 0;
  let res = d20(bonus, adv, r.rand);
  if (res.nat1 && t.sheet.raceId === 'halfling' && !t.luckyUsed) {
    t.luckyUsed = true;
    res = d20(bonus, adv, r.rand);
    say(g, `${t.name} is Lucky and rerolls the 1.`, 'roll', now);
  }
  const ok = res.total >= c.dc;
  c.results[t.cid] = { total: res.total, d20: res.d20, ok, name: t.name };
  say(g, `${t.name} rolls ${c.skill}: ${res.total} (${res.d20}${res.bonus >= 0 ? '+' : ''}${res.bonus}). ${ok ? 'Success!' : 'Fail.'}`, 'roll', now);
  showRoll(g, { who: t.name, label: c.skill, d20: res.d20, total: res.total, ok }, now);
  const waiting = party(g).filter((p) => !p.gone && conscious(p) && (!c.cid || c.cid === p.cid) && !c.results[p.cid]);
  if (!waiting.length) {
    const passed = Object.values(c.results).filter((x) => x.ok).length;
    cue(g, 'check', `${c.skill} check (DC ${c.dc}): ${passed} of ${Object.keys(c.results).length} passed. ${Object.values(c.results).map((x) => `${x.name} ${x.total}`).join(', ')}`, now);
    c.done = true;
  }
  return null;
};

// ---- The DM's controls --------------------------------------------------------------------------------------------

/** Every DM action. Returns an error string or null. */
export const dmAct = (g, msg, now = g.clock) => {
  const t = msg.target ? tokenById(g, msg.target) : null;
  switch (msg.type) {
    case 'narrate': {
      const text = String(msg.text || '').trim().slice(0, 1200);
      if (!text) return 'Nothing to say.';
      g.narrationId = (g.narrationId || 0) + 1;
      g.narration = { text, by: msg.by === 'ai' ? 'ai' : msg.by === 'auto' ? 'auto' : 'dm', at: now, id: g.narrationId };
      say(g, text, 'narrate', now);
      return null;
    }
    case 'clearNarration': g.narration = null; return null;
    case 'startCombat': startCombat(g, now); return null;
    case 'endCombat': endCombat(g, now, 'The DM ends the fight.'); return null;
    case 'nextTurn': nextTurn(g, now); return null;
    case 'nextScene': {
      if (g.combat) return 'End the fight first.';
      g.atExit = false;
      const next = g.sceneIndex + 1;
      if (next >= g.sceneSettings.length) g.sceneSettings.push(msg.setting || g.sceneSettings[g.sceneSettings.length - 1]);
      enterScene(g, next, now, false, msg.setting || null);
      return null;
    }
    case 'rerollScene':
      if (g.combat) return 'End the fight first.';
      enterScene(g, g.sceneIndex, now, false, msg.setting || null);
      return null;
    case 'spawn': {
      const id = MONSTERS[msg.monster] ? msg.monster : null;
      if (!id) return 'Unknown monster.';
      const near = msg.x != null ? { x: msg.x, y: msg.y } : (g.map.exit || g.map.start[0]);
      const spot = freeSpotNear(g, near);
      const f = foeToken(g, id, spot, foes(g).filter((x) => x.monster === id).length + 1);
      f.hidden = false;
      g.tokens.push(f);
      say(g, `${f.name} appears!`, 'combat', now);
      if (g.combat) g.combat.order.push(f.id);
      return null;
    }
    case 'hp': {
      if (!t) return 'No target.';
      const amount = Math.trunc(Number(msg.amount) || 0);
      g.hitter = null;
      if (amount < 0) damage(g, t, -amount, now, 'the DM');
      else heal(g, t, amount, now);
      say(g, `DM: ${t.name} ${amount < 0 ? 'takes' : 'regains'} ${Math.abs(amount)} HP.`, 'dm', now);
      return null;
    }
    case 'revive':
      if (!t) return 'No target.';
      t.dead = false;
      t.hp = Math.max(1, t.hp);
      t.deathSaves = { ok: 0, fail: 0 };
      say(g, `${t.name} is brought back!`, 'heal', now);
      return null;
    case 'remove':
      if (!t || t.side === 'party') return 'Can only remove monsters.';
      t.gone = true;
      t.dead = true;
      if (g.combat) {
        const index = g.combat.order.indexOf(t.id);
        if (index >= 0) {
          g.combat.order.splice(index, 1);
          if (index < g.combat.turn) g.combat.turn -= 1;
          if (g.combat.turn >= g.combat.order.length) g.combat.turn = 0;
        }
        if (!foes(g).length) endCombat(g, now, 'No enemies left.');
      }
      return null;
    case 'place': {
      if (!t) return 'No target.';
      const tile = tileAt(g.map, msg.x, msg.y);
      if (!isOpen(tile)) return 'Can’t stand there.';
      if (g.tokens.some((o) => alive(o) && o !== t && o.x === msg.x && o.y === msg.y)) return 'Someone is there.';
      t.x = msg.x;
      t.y = msg.y;
      g.walking = g.walking.filter((w) => w.id !== t.id);
      revealFoes(g, now);
      return null;
    }
    case 'reveal':
      foes(g).forEach((f) => { f.hidden = false; });
      return null;
    case 'xp': {
      const amount = Math.max(0, Math.min(10000, Math.trunc(Number(msg.amount) || 0)));
      awardXp(g, amount * Math.max(1, party(g).filter((p) => !p.dead).length), now, 'from the DM');
      return null;
    }
    case 'give': {
      if (!t || t.side !== 'party') return 'Pick a hero.';
      const item = String(msg.item || '').trim().slice(0, 40);
      if (!item) return 'Name the item.';
      t.sheet.inventory.push(item);
      say(g, `${t.name} receives ${item}.`, 'loot', now);
      return null;
    }
    case 'check': {
      const skill = SKILLS[msg.skill] ? msg.skill : 'Perception';
      const dc = Math.max(5, Math.min(30, Math.trunc(Number(msg.dc) || 12)));
      g.check = { id: now, skill, dc, cid: msg.cid || null, results: {}, done: false };
      say(g, `The DM calls for a ${skill} check${msg.cid ? ` from ${pcFor(g, msg.cid)?.name || 'one hero'}` : ' from everyone'}.`, 'roll', now);
      return null;
    }
    case 'clearCheck': g.check = null; return null;
    case 'shortRest':
      if (g.combat) return 'Not in a fight.';
      party(g).forEach((p) => {
        if (p.dead) return;
        p.hp = Math.min(p.maxHp, Math.max(1, p.hp) + Math.ceil(p.maxHp / 4));
        actionsOf(p.sheet).forEach((a) => { if (a.uses && a.id !== 'lay-on-hands') p.uses[a.id] = Math.max(p.uses[a.id] || 0, Math.ceil(a.uses / 2)); });
      });
      say(g, 'The party takes a short rest.', 'heal', now);
      return null;
    case 'dismissRequest':
      g.requests = g.requests.filter((r) => r.id !== msg.id);
      return null;
    case 'campaign':
      g.campaign = msg.campaign || null;
      return null;
    default:
      return 'Unknown DM action.';
  }
};

// ---- Monster turns ----------------------------------------------------------------------------------------------

const foeTurn = (g, f, now) => {
  const m = MONSTERS[f.monster];
  g.hitter = null;
  if (f.cond.surprised || f.cond.stunned) {
    say(g, f.cond.stunned ? `${f.name} struggles against the rope and loses its turn.` : `${f.name} is caught by surprise and loses its turn.`, 'combat', now);
    delete f.cond.surprised;
    delete f.cond.stunned;
    nextTurn(g, now);
    return;
  }
  const target = nearestPc(g, f);
  if (!target) {
    nextTurn(g, now);
    return;
  }
  const inRange = (from) => (m.range > 1 ? squaresBetween(from, target) <= m.range && lineOfSight(g.map, from, target) : adjacent(from, target));
  if (!inRange(f)) {
    const reach = reachable(g.map, f, f.speed, occupantFor(g, f));
    const stops = nearestStops(reach, target);
    const stop = stops.find((n) => inRange(n)) || stops[0];
    if (stop && (stop.x !== f.x || stop.y !== f.y)) {
      const path = pathTo(reach, stop);
      f.x = stop.x;
      f.y = stop.y;
      g.walking = g.walking.filter((w) => w.id !== f.id);
      g.walking.push({ id: f.id, path, at: now });
    }
  }
  if (inRange(f)) {
    const r = rng(g);
    let adv = target.cond.dodge ? -1 : 0;
    if (target.hp <= 0) adv = 1;
    const atk = d20(m.toHit, adv, r);
    const ac = target.ac + (target.cond.shield ? 5 : 0);
    const hit = atk.nat20 || (!atk.nat1 && atk.total >= ac);
    if (hit) {
      const dmg = roll(atk.nat20 || (target.hp <= 0 && adjacent(f, target)) ? critDice(m.dice) : m.dice, r).total;
      say(g, `${f.name} hits ${target.name} (${atk.total} vs AC ${ac}) for ${dmg}.`, 'combat', now);
      fx(g, m.range > 1 ? 'shoot' : 'hit', f, target, { label: m.attack || 'Attack', dmg, crit: atk.nat20 }, now);
      showRoll(g, { who: f.name, label: 'Attack', d20: atk.d20, total: atk.total, ok: true, dmg, foe: true }, now);
      if (target.hp <= 0) {
        target.deathSaves.fail += 2;
        if (target.deathSaves.fail >= 3) {
          target.dead = true;
          say(g, `${target.name} has died.`, 'combat', now);
        }
      } else damage(g, target, dmg, now, f.name);
    } else {
      fx(g, 'miss', f, target, { label: m.attack || 'Attack', ranged: m.range > 1 }, now);
      say(g, `${f.name} misses ${target.name} (${atk.total} vs AC ${ac})${target.cond.shield && atk.total >= target.ac ? '. The Shield spell turns the blow!' : '.'}`, 'combat', now);
      showRoll(g, { who: f.name, label: 'Attack', d20: atk.d20, total: atk.total, ok: false, foe: true }, now);
    }
  }
  nextTurn(g, now);
};

/** Called every frame on the TV. */
export const tick = (g, now) => {
  g.clock = now;
  g.walking = g.walking.filter((w) => now - w.at < w.path.length * MOVE_STEP_MS + 200);
  if (!g.combat) {
    // Nobody needs the DM to move on: standing at the way onward is enough.
    if (g.atExit && !g.complete && now - (g.exitAt || 0) > AUTO_EXIT_MS) {
      const lastScene = g.sceneIndex >= g.sceneSettings.length - 1;
      if (!lastScene) dmAct(g, { type: 'nextScene' }, now);
      else if (!foes(g).length) completeQuest(g, now);
    }
    return;
  }
  const t = current(g);
  if (t && t.side === 'foe' && now >= g.nextFoeAt && !g.paused) {
    if (!alive(t) || t.hidden) nextTurn(g, now);
    else foeTurn(g, t, now);
  }
};

/** Where a walking token is drawn right now (between squares while it walks). */
export const drawPos = (g, t, now) => {
  const w = g.walking.find((x) => x.id === t.id);
  if (!w || w.path.length < 2) return { x: t.x, y: t.y };
  const f = Math.min(w.path.length - 1, (now - w.at) / MOVE_STEP_MS);
  const i = Math.floor(f);
  const a = w.path[i];
  const b = w.path[Math.min(w.path.length - 1, i + 1)];
  const k = f - i;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
};

// ---- Views for the phones ------------------------------------------------------------------------------------------

const TILE_CODE = { floor: '.', road: '=', diff: ',', wall: '#', water: '~', void: ' ', door: '+' };
const PROP_CODES = Object.keys(PROPS);

/** The map packed small for phones: one string for terrain, one for ground level, props by index. */
export const packMap = (map) => ({
  w: map.w,
  h: map.h,
  t: map.tiles.map((tile) => TILE_CODE[tile.t] || '.').join(''),
  e: map.tiles.map((tile) => tile.e || 0).join(''),
  p: map.tiles.map((tile, i) => (tile.p ? [i, PROP_CODES.indexOf(tile.p)] : null)).filter(Boolean),
  setting: map.setting,
  seed: map.seed,
});

/** Who's in an action-cam moment, drawn the same way as on the board. */
const fxActor = (g, id) => {
  if (!id) return null;
  const t = tokenById(g, id);
  if (t) {
    return t.side === 'party'
      ? { kind: 'hero', id: t.id, name: t.name, x: t.x, y: t.y }
      : { kind: 'foe', id: t.id, name: t.name, x: t.x, y: t.y, monster: t.monster, color: t.color, glyph: t.glyph, boss: Boolean(t.boss), maxHp: t.maxHp };
  }
  const n = (g.npcs || []).find((x) => x.id === id);
  return n ? { kind: 'npc', id: n.id, name: n.name, role: n.role, x: n.x, y: n.y } : null;
};

/** The latest action this hero was part of, for their phone's action cam. */
const fxFor = (g, t) => {
  const f = g.fx;
  if (!f || (f.from !== t.id && f.to !== t.id)) return null;
  return { ...f, actor: fxActor(g, f.from), target: fxActor(g, f.to), setting: g.map.setting };
};

/** Traps the party knows about: [x, y, sprung]. */
const trapsSeen = (g) => (g.map.traps || []).filter((x) => x.found || x.sprung).map((x) => [x.x, x.y, x.sprung ? 1 : 0]);

const tokenView = (t) => ({
  id: t.id, side: t.side, name: t.name, x: t.x, y: t.y, hp: t.hp, maxHp: t.maxHp, ac: t.ac, cid: t.cid || null,
  glyph: t.glyph || null, monster: t.monster || null, color: t.color || null, boss: Boolean(t.boss), dead: Boolean(t.dead), down: t.hp <= 0, look: t.look || null,
  cls: t.sheet ? t.sheet.classId : null,
  wear: t.sheet ? t.sheet.wear || null : null,
  title: t.sheet ? titleOf(t.sheet) : null,
});

const sceneCtx = (g) => ({
  seed: g.map.seed,
  setting: g.map.setting,
  quest: g.quest,
  party: party(g).map((t) => ({ name: t.name, cls: CLASSES[t.sheet.classId].name, race: RACES[t.sheet.raceId].name, level: t.sheet.level, hp: t.hp, maxHp: t.maxHp })),
});

/** Everything the AI narrator (or the built-in one) needs to write the next bit. */
export const aiContext = (g) => ({
  ...sceneCtx(g),
  settingName: settingFor(g.map.setting).name,
  settingBlurb: settingFor(g.map.setting).blurb,
  scene: g.sceneIndex + 1,
  scenes: g.sceneSettings.map((s) => settingFor(s).name),
  mode: g.mode,
  round: g.combat?.round || null,
  foes: foes(g).filter((f) => !f.hidden).map((f) => ({ name: f.name, hp: f.hp, maxHp: f.maxHp })),
  hiddenFoes: foes(g).filter((f) => f.hidden).length,
  npcs: (g.npcs || []).map((n) => `${n.name} the ${n.role.toLowerCase()}${n.talked ? `: ${npcLine(n)}` : ''}${n.done ? ' (helped)' : ''}${n.angry ? ' (angry at the party)' : ''}${n.friendly ? ' (friendly)' : ''}`),
  recent: g.log.slice(-18).map((l) => l.text),
  requests: g.requests.slice(-4).map((r) => `${r.who}: ${r.text}`),
  talk: (g.transcript || []).slice(-12).map((l) => `${l.who}: ${l.text}`),
  campaign: g.campaign ? { name: g.campaign.name, notes: g.campaign.notes || '', summaries: (g.campaign.summaries || []).slice(-3) } : null,
  complete: g.complete,
});

/** What a remote watcher's screen shows: the TV's board, without the TV. */
export const watchView = (g) => {
  const turn = current(g);
  return {
    map: packMap(g.map),
    tokens: g.tokens.filter((t) => alive(t) && !t.gone && !(t.side === 'foe' && t.hidden)).map((t) => ({
      ...tokenView(t), color: t.color || null, classId: t.sheet?.classId || null,
    })),
    npcs: (g.npcs || []).map(({ id, x, y, name, role, look, talked, done, angry }) => ({ id, x, y, name, role, look, talked, done, angry })),
    traps: trapsSeen(g),
    combat: g.combat ? { order: g.combat.order, turn: g.combat.turn, round: g.combat.round } : null,
    turnName: turn ? turn.name : null,
    turnFoe: turn ? turn.side === 'foe' : false,
    narration: g.narration?.text || null,
    narrationId: g.narration?.id || null,
    quest: { title: g.quest.title, setting: g.map.setting, scene: g.sceneIndex + 1, scenes: g.sceneSettings.length },
    log: g.log.slice(-4).map((l) => l.text),
    complete: g.complete,
  };
};

/** What one player's phone shows. */
export const playerView = (g, cid) => {
  const t = pcFor(g, cid);
  if (!t) return null;
  const turn = current(g);
  const myMove = movesFor(g, t);
  const reach = [...myMove.reach.values()].filter((n) => n.end && (n.x !== t.x || n.y !== t.y)).map((n) => [n.x, n.y, n.cost]);
  return {
    me: { ...tokenView(t), sheet: t.sheet, uses: t.uses, cond: t.cond, speed: speedFor(t), deathSaves: t.deathSaves, characterId: t.characterId },
    tokens: g.tokens.filter((x) => alive(x) && !(x.side === 'foe' && x.hidden)).map(tokenView),
    map: packMap(g.map),
    reach,
    left: myMove.left,
    mode: g.mode,
    myTurn: Boolean(g.combat && turn?.id === t.id),
    turnName: turn?.name || null,
    round: g.combat?.round || 0,
    used: g.combat ? { action: g.combat.action, bonus: g.combat.bonus, moved: g.combat.moved } : null,
    check: g.check && !g.check.done && (!g.check.cid || g.check.cid === cid) ? { skill: g.check.skill, rolled: g.check.results[cid] || null } : null,
    atExit: Boolean(g.atExit),
    npcNear: (() => {
      const n = npcNear(g, t);
      return n ? { name: n.name, role: n.role, angry: Boolean(n.angry), scared: Boolean(n.scared), friendly: Boolean(n.friendly), tried: n.tried || {} } : null;
    })(),
    shop: (() => {
      const shop = shopNear(g, t);
      return shop ? { name: shop.name, friendly: shop.friendly, stock: SHOP_STOCK.map((item) => [item, buyPrice(item, shop.friendly)]) } : null;
    })(),
    searched: Boolean(g.searched && g.searched[`${t.x},${t.y}`]),
    sneakTried: Boolean(g.sneakTried && g.sneakTried[`${t.id}@${t.x},${t.y}`]),
    traps: trapsSeen(g),
    tasks: (g.npcs || []).filter((n) => n.talked && taskLabel(n)).map((n) => ({ text: taskLabel(n), done: n.done })),
    lastScene: g.sceneIndex >= g.sceneSettings.length - 1,
    unlock: g.unlock && g.unlock.cid === cid ? { id: g.unlock.id, gear: g.unlock.gear } : null,
    fx: fxFor(g, t),
    npcs: (g.npcs || []).map(({ id, x, y, name, role, look, talked }) => ({ id, x, y, name, role, look, talked })),
    chestNear: g.map.chests.some((c) => adjacent(c, t) && tileAt(g.map, c.x, c.y).p === 'chest'),
    narration: g.narration?.text || null,
    quest: { title: g.quest.title, setting: settingFor(g.map.setting).name, scene: g.sceneIndex + 1, scenes: g.sceneSettings.length },
    log: g.log.slice(-6).map((l) => l.text),
    campaignId: g.campaign?.id || null,
    complete: g.complete,
  };
};

/** What the DM's phone shows: everything. */
export const dmView = (g) => ({
  tokens: g.tokens.filter((x) => alive(x)).map((t) => ({ ...tokenView(t), hidden: Boolean(t.hidden), monster: t.monster || null, sheet: t.sheet ? { level: t.sheet.level, classId: t.sheet.classId, raceId: t.sheet.raceId, xp: t.sheet.xp } : null })),
  map: packMap(g.map),
  mode: g.mode,
  turnId: currentId(g),
  round: g.combat?.round || 0,
  order: g.combat ? g.combat.order : [],
  quest: g.quest,
  scene: g.sceneIndex,
  scenes: g.sceneSettings,
  atExit: Boolean(g.atExit),
  cue: g.cue,
  requests: g.requests,
  check: g.check,
  log: g.log.slice(-30).map((l) => ({ text: l.text, kind: l.kind })),
  narration: g.narration,
  ai: aiContext(g),
  campaign: g.campaign ? { id: g.campaign.id, name: g.campaign.name } : null,
  complete: g.complete,
  xpTotal: g.xpTotal,
  record: sessionRecord(g),
});

/** A record of the session for saving to a campaign. */
export const sessionRecord = (g, now = g.clock) => ({
  quest: g.quest,
  scenes: g.visited,
  complete: g.complete,
  xpEach: g.xpTotal,
  loot: g.loot,
  minutes: Math.round((now - g.started) / 60000),
  log: g.log.slice(-60).map((l) => l.text),
  transcript: (g.transcript || []).slice(-400).map((l) => `${l.who}: ${l.text}`),
  party: party(g).map((t) => ({
    cid: t.cid,
    characterId: t.characterId,
    name: t.name,
    classId: t.sheet.classId,
    raceId: t.sheet.raceId,
    level: t.sheet.level,
    xp: t.sheet.xp,
    hp: t.hp,
    maxHp: t.maxHp,
    dead: Boolean(t.dead),
    gold: t.sheet.gold,
    inventory: t.sheet.inventory,
    deeds: t.sheet.deeds || {},
    wear: t.sheet.wear || {},
  })),
});

/** The player's sheet as it stands now (to save back to their account). */
export const sheetNow = (t) => ({ ...t.sheet, id: t.characterId || t.sheet.id || null, hp: t.hp, maxHp: t.maxHp, look: t.look });

export { newSeed };
