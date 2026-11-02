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

const LOG_MAX = 120;
const FOE_TURN_MS = 1400;
const MOVE_STEP_MS = 140;

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
  g.mode = 'combat';
  g.combat = { order: inits.map((i) => i.id), turn: 0, round: 1, moved: 0, action: false, bonus: false, dashed: false, sneakUsed: false, inits: Object.fromEntries(inits.map((i) => [i.id, i.value])) };
  say(g, `Combat! Initiative: ${inits.map((i) => `${tokenById(g, i.id).name} ${i.value}`).join(', ')}.`, 'combat', now);
  cue(g, 'combat', who || 'Enemies', now);
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
      say(g, `${target.name} is defeated! (+${xp} XP)`, 'combat', now);
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
      }
      target.hp = 0;
      target.deathSaves = { ok: 0, fail: 0 };
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
    t.sheet.xp += each;
    t.sheet.level = levelForXp(t.sheet.xp);
    if (t.sheet.level > before) {
      const newMax = maxHpFor(t.sheet.classId, t.sheet.raceId, t.sheet.level, t.sheet.stats);
      t.hp += newMax - t.maxHp;
      t.maxHp = newMax;
      t.sheet.maxHp = newMax;
      say(g, `${t.name} reaches level ${t.sheet.level}!`, 'level', now);
      showRoll(g, { who: t.name, label: `Level ${t.sheet.level}!`, total: t.sheet.level, ok: true, level: true }, now);
    }
  });
  say(g, `Each hero earns ${each} XP ${why}.`.trim(), 'level', now);
};

const completeQuest = (g, now) => {
  if (g.complete) return;
  g.complete = true;
  awardXp(g, 100 * Math.max(1, party(g).length) * partyLevel(g), now, 'for finishing the quest');
  say(g, `Quest complete: ${g.quest.title}. Reward: ${g.quest.reward}.`, 'level', now);
};

// ---- Player actions ---------------------------------------------------------------------------------------------

const myTurn = (g, t) => !g.combat || currentId(g) === t.id;

/** Where this token may move right now, as a reachable() map, plus the feet left. */
export const movesFor = (g, t) => {
  if (!t || !conscious(t)) return { reach: new Map(), left: 0 };
  let left;
  if (g.combat) {
    if (currentId(g) !== t.id) return { reach: new Map(), left: 0 };
    left = t.speed * (g.combat.dashed ? 2 : 1) - g.combat.moved;
  } else {
    left = t.speed * 2; // exploring: no turns, move at a steady pace
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
  const tile = tileAt(g.map, t.x, t.y);
  if (tile?.p === 'exit' && !g.combat) {
    say(g, `${t.name} reaches the way onward.`, 'scene', now);
    if (!g.atExit) cue(g, 'exit', '', now);
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
    } else {
      t.cond[a.effect] = true;
      say(g, `${t.name} uses ${a.name}.`, 'combat', now);
    }
  } else if (a.kind === 'heal') {
    if (a.self) target = t;
    if (!target || target.side !== 'party') return 'Pick someone to heal.';
    if (!a.self && squaresBetween(t, target) > (a.range || 1)) return 'Too far.';
    const amount = a.perLevel ? a.perLevel * t.sheet.level : roll(a.dice, r).total + (a.addLevel ? t.sheet.level : 0) + Math.max(0, nums.dmgBonus);
    const healed = heal(g, target, amount, now);
    say(g, `${t.name} uses ${a.name} on ${target === t ? 'themselves' : target.name}: +${healed} HP.`, 'heal', now);
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
      damage(g, target, dmg, now, a.name);
      say(g, `${t.name} casts ${a.name}: ${dmg} damage to ${target.name}.`, 'combat', now);
      showRoll(g, { who: t.name, label: a.name, total: dmg, ok: true, dmg: true }, now);
    } else if (a.kind === 'save') {
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
        showRoll(g, { who: t.name, label: a.name, d20: atk.d20, total: atk.total, ok: true, dmg, crit: atk.nat20 }, now);
        if (atk.nat20) cue(g, 'crit', `${t.name} vs ${target.name}`, now);
        damage(g, target, dmg, now, a.name);
      } else {
        say(g, `${t.name} misses ${target.name} with ${a.name} (${atk.total} vs AC ${target.ac}).`, 'combat', now);
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
export const interact = (g, t, now = g.clock) => {
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
  if (['dungeon', 'cave', 'castle'].includes(g.map.setting) && r.chance(0.12)) {
    const m = foeToken(g, 'mimic', chest, 1);
    m.hidden = false;
    g.tokens.push(m);
    say(g, `${t.name} opens the chest… and it bites back! A Mimic!`, 'combat', now);
    cue(g, 'mimic', '', now);
    if (g.combat) g.combat.order.splice(g.combat.turn + 1, 0, m.id);
    else startCombat(g, now, 'A Mimic');
    return null;
  }
  const gold = r.int(5, 25) * partyLevel(g);
  const item = r.pick(LOOT);
  t.sheet.gold += gold;
  t.sheet.inventory.push(item);
  g.loot.push({ who: t.name, item, gold });
  say(g, `${t.name} opens the chest: ${gold} gold and ${item}.`, 'loot', now);
  showRoll(g, { who: t.name, label: item, total: gold, ok: true, loot: true }, now);
  cue(g, 'loot', `${t.name} finds ${item} and ${gold} gold`, now);
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
    const hit = atk.nat20 || (!atk.nat1 && atk.total >= target.ac);
    if (hit) {
      const dmg = roll(atk.nat20 || (target.hp <= 0 && adjacent(f, target)) ? critDice(m.dice) : m.dice, r).total;
      say(g, `${f.name} hits ${target.name} (${atk.total} vs AC ${target.ac}) for ${dmg}.`, 'combat', now);
      showRoll(g, { who: f.name, label: 'Attack', d20: atk.d20, total: atk.total, ok: true, dmg, foe: true }, now);
      if (target.hp <= 0) {
        target.deathSaves.fail += 2;
        if (target.deathSaves.fail >= 3) {
          target.dead = true;
          say(g, `${target.name} has died.`, 'combat', now);
        }
      } else damage(g, target, dmg, now, f.name);
    } else {
      say(g, `${f.name} misses ${target.name} (${atk.total} vs AC ${target.ac}).`, 'combat', now);
      showRoll(g, { who: f.name, label: 'Attack', d20: atk.d20, total: atk.total, ok: false, foe: true }, now);
    }
  }
  nextTurn(g, now);
};

/** Called every frame on the TV. */
export const tick = (g, now) => {
  g.clock = now;
  g.walking = g.walking.filter((w) => now - w.at < w.path.length * MOVE_STEP_MS + 200);
  if (!g.combat) return;
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

const tokenView = (t) => ({
  id: t.id, side: t.side, name: t.name, x: t.x, y: t.y, hp: t.hp, maxHp: t.maxHp, ac: t.ac, cid: t.cid || null,
  glyph: t.glyph || null, boss: Boolean(t.boss), dead: Boolean(t.dead), down: t.hp <= 0, look: t.look || null,
  cls: t.sheet ? t.sheet.classId : null,
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
    me: { ...tokenView(t), sheet: t.sheet, uses: t.uses, cond: t.cond, speed: t.speed, deathSaves: t.deathSaves, characterId: t.characterId },
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
  })),
});

/** The player's sheet as it stands now (to save back to their account). */
export const sheetNow = (t) => ({ ...t.sheet, id: t.characterId || t.sheet.id || null, hp: t.hp, maxHp: t.maxHp, look: t.look });

export { newSeed };
