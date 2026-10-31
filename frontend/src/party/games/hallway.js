// Haunted Hallway: a co-op climb through a haunted house. Each floor has a row of doors and only
// one is safe. Two guides each get some clues on their phone, and everyone has to talk it out and
// vote. A wrong door costs a lantern. Pure game logic, no React; the TV ticks it.

export const FLOORS = 8;
export const LANTERNS = 3;
export const FLOOR_MS = 4000;
export const VOTE_MS = 45000;
export const CLOSE_MS = 2500;
export const REVEAL_MS = 6500;
export const ACTIVE_MS = 30000;

export const COLORS = [
  { id: 'red', name: 'red', hex: '#d33b3b' },
  { id: 'green', name: 'green', hex: '#3a9a5b' },
  { id: 'blue', name: 'blue', hex: '#2f6bff' },
  { id: 'purple', name: 'purple', hex: '#8b5cf6' },
  { id: 'orange', name: 'orange', hex: '#ff8a2a' },
];
export const SYMBOLS = [
  { id: 'skull', name: 'a skull', icon: '💀' },
  { id: 'moon', name: 'a moon', icon: '🌙' },
  { id: 'bat', name: 'a bat', icon: '🦇' },
  { id: 'spider', name: 'a spider', icon: '🕷️' },
  { id: 'eye', name: 'an eye', icon: '👁️' },
];
export const WINDOWS = [
  { id: 'round', name: 'a round window' },
  { id: 'arch', name: 'a pointy window' },
  { id: 'square', name: 'a square window' },
];
export const HANDLES = [
  { id: 'knob', name: 'a round knob' },
  { id: 'ring', name: 'a ring knocker' },
  { id: 'lever', name: 'a long handle' },
];
const ATTRS = { color: COLORS, symbol: SYMBOLS, window: WINDOWS, handle: HANDLES };
const byId = (list, id) => list.find((x) => x.id === id);
const MONSTERS = ['ghost', 'bat', 'skeleton', 'zombie', 'spider', 'witch'];

/** How hard each floor is: doors, clues, seconds to vote, and how tricky the clues get (0 to 3). */
export const floorPlan = (floor) => {
  if (floor <= 2) return { doors: 3, clues: 2, voteMs: 45000, tier: 0 };
  if (floor <= 4) return { doors: 4, clues: 3, voteMs: 40000, tier: 1 };
  if (floor <= 6) return { doors: 5, clues: 3, voteMs: 35000, tier: 2 };
  return { doors: 6, clues: 4, voteMs: floor >= 8 ? 25000 : 30000, tier: 3 };
};

const mulberry = (seed) => {
  let r = seed | 0;
  return () => {
    r = (r + 0x6D2B79F5) | 0;
    let t = r;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const pickOne = (rand, list) => list[Math.floor(rand() * list.length)];
const shuffle = (rand, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const emit = (s, type, data = {}) => {
  s.eventId += 1;
  s.events.push({ id: s.eventId, type, ...data });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
};
const setPhase = (s, phase, now) => {
  s.phase = phase;
  s.phaseAt = now;
  s.closeAt = null;
};

// Clues. kind 'is': { attr, value, yes }. 'or': { a, b } (each { attr, value }). 'end': { yes }.
// 'next': { attr, value } (a neighbour has it). 'side': { attr, value, dir } (left/right of the one door with it).
// say picks one of a few phrasings so higher floors read less like a checklist.
const has = (attr, value) => (attr === 'color' ? `is ${byId(COLORS, value).name}` : `has ${byId(ATTRS[attr], value).name}`);
const hasNot = (attr, value) => (attr === 'color' ? `is NOT ${byId(COLORS, value).name}` : `does NOT have ${byId(ATTRS[attr], value).name}`);
const thing = (attr, value) => (attr === 'color' ? `the ${byId(COLORS, value).name} door` : `the door with ${byId(ATTRS[attr], value).name}`);

export const clueText = (c) => {
  const say = c.say || 0;
  switch (c.kind || 'is') {
    case 'or': return `Either the safe door ${has(c.a.attr, c.a.value)}, or it ${has(c.b.attr, c.b.value)}.`;
    case 'end': return c.yes ? 'The safe door is at one end of the hallway.' : 'The safe door is NOT at either end of the hallway.';
    case 'next': return `The safe door is right next to a door that ${has(c.attr, c.value)}.`;
    case 'side': return `The safe door is somewhere to the ${c.dir.toUpperCase()} of ${thing(c.attr, c.value)}.`;
    default: {
      const v = byId(ATTRS[c.attr], c.value);
      if (c.yes) {
        if (say === 1) return c.attr === 'color' ? `Look for a ${v.name} door.` : `Look for a door with ${v.name}.`;
        return `The safe door ${has(c.attr, c.value)}.`;
      }
      if (say === 1) return c.attr === 'color' ? `Stay away from ${v.name} doors.` : `Stay away from any door with ${v.name}.`;
      return `The safe door ${hasNot(c.attr, c.value)}.`;
    }
  }
};

/** Whether door i of `doors` fits clue c. */
export const fits = (doors, i, c) => {
  const d = doors[i];
  switch (c.kind || 'is') {
    case 'or': return d[c.a.attr] === c.a.value || d[c.b.attr] === c.b.value;
    case 'end': return (i === 0 || i === doors.length - 1) === c.yes;
    case 'next': return [i - 1, i + 1].some((j) => doors[j] && doors[j][c.attr] === c.value);
    case 'side': {
      const k = doors.findIndex((x) => x[c.attr] === c.value);
      return c.dir === 'left' ? i < k : i > k;
    }
    default: return (d[c.attr] === c.value) === c.yes;
  }
};
export const matching = (doors, clues) => doors.map((_, i) => i).filter((i) => clues.every((c) => fits(doors, i, c)));

// Every true statement about the safe door at this tier.
function truths(rand, doors, safe, tier) {
  const s = doors[safe];
  const pool = [];
  Object.keys(ATTRS).forEach((attr) => {
    pool.push({ kind: 'is', attr, value: s[attr], yes: true });
    ATTRS[attr].forEach((v) => { if (v.id !== s[attr] && doors.some((d) => d[attr] === v.id)) pool.push({ kind: 'is', attr, value: v.id, yes: false }); });
  });
  if (tier >= 1) {
    pool.push({ kind: 'end', yes: safe === 0 || safe === doors.length - 1 });
    Object.keys(ATTRS).forEach((attr) => {
      Object.keys(ATTRS).filter((b) => b !== attr).forEach((battr) => {
        doors.forEach((d) => {
          if (d[battr] !== s[battr]) {
            const pair = [{ attr, value: s[attr] }, { attr: battr, value: d[battr] }];
            pool.push({ kind: 'or', ...(rand() < 0.5 ? { a: pair[0], b: pair[1] } : { a: pair[1], b: pair[0] }) });
          }
        });
      });
    });
  }
  if (tier >= 2) {
    [safe - 1, safe + 1].forEach((j) => {
      if (!doors[j]) return;
      Object.keys(ATTRS).forEach((attr) => pool.push({ kind: 'next', attr, value: doors[j][attr] }));
    });
    doors.forEach((d, j) => {
      if (j === safe) return;
      Object.keys(ATTRS).forEach((attr) => {
        if (doors.filter((x) => x[attr] === d[attr]).length === 1) pool.push({ kind: 'side', attr, value: d[attr], dir: safe < j ? 'left' : 'right' });
      });
    });
  }
  return pool.filter((c) => fits(doors, safe, c));
}

/** Builds a floor: doors that all look different, a safe one, and clues split between guides. */
export function makeFloor(rand, floor, guideCount) {
  const plan = floorPlan(floor);
  const tricky = plan.tier >= 3 ? 2 : plan.tier >= 1 ? 1 : 0;
  // Rarely a layout is too hard to build; loosen the rules a notch at a time before giving up.
  const tries = [[tricky, plan.clues], [Math.max(0, tricky - 1), plan.clues], [Math.max(0, tricky - 1), plan.clues - 1]];
  for (let t = 0; t < tries.length; t += 1) {
    const room = buildFloor(rand, plan, guideCount, tries[t][0], tries[t][1]);
    if (room) return room;
  }
  // Fallback: plain clues that always work.
  const doors = COLORS.slice(0, Math.min(plan.doors, COLORS.length)).map((c, i) => ({ color: c.id, symbol: SYMBOLS[i].id, window: WINDOWS[i % 3].id, handle: HANDLES[i % 3].id }));
  const safe = Math.floor(rand() * doors.length);
  const clues = [{ kind: 'is', attr: 'color', value: doors[safe].color, yes: true }];
  return { doors, safe, clues, hands: [clues], monster: 'ghost' };
}

function buildFloor(rand, plan, guideCount, tricky, clueCount) {
  for (let attempt = 0; attempt < 1500; attempt += 1) {
    const doors = [];
    const seen = new Set();
    while (doors.length < plan.doors) {
      const d = { color: pickOne(rand, COLORS).id, symbol: pickOne(rand, SYMBOLS).id, window: pickOne(rand, WINDOWS).id, handle: pickOne(rand, HANDLES).id };
      const key = `${d.color}-${d.symbol}-${d.window}-${d.handle}`;
      if (!seen.has(key)) { seen.add(key); doors.push(d); }
    }
    const safe = Math.floor(rand() * doors.length);
    const useful = truths(rand, doors, safe, plan.tier).filter((c) => doors.some((_, i) => !fits(doors, i, c)));
    const clues = shuffle(rand, useful).slice(0, clueCount);
    if (clues.length < clueCount) continue;
    if (clues.filter((c) => c.kind !== 'is').length < tricky) continue;
    const m = matching(doors, clues);
    if (m.length !== 1 || m[0] !== safe) continue;
    // No clue can be left out, so everyone's clues matter.
    if (clues.some((c) => matching(doors, clues.filter((x) => x !== c)).length === 1)) continue;
    const hands = Array.from({ length: Math.max(1, guideCount) }, () => []);
    clues.forEach((c, i) => hands[i % hands.length].push(c));
    if (hands.length > 1 && hands.some((h) => matching(doors, h).length === 1)) continue;
    clues.forEach((c) => { if (c.kind === 'is' && plan.tier >= 1) c.say = rand() < 0.5 ? 1 : 0; });
    return { doors, safe, clues, hands, monster: pickOne(rand, MONSTERS) };
  }
  return null;
}

export const activePlayers = (s, now) => s.players.filter((p) => now - (s.lastSeen[p.cid] ?? -1e9) <= ACTIVE_MS);

const startFloor = (s, now) => {
  const active = activePlayers(s, now);
  const pool = active.length ? active : s.players;
  const count = Math.min(2, pool.length);
  // Guides take turns: start after last floor's guides.
  const order = [...pool.slice(s.guideTurn % pool.length), ...pool.slice(0, s.guideTurn % pool.length)];
  s.guides = order.slice(0, count).map((p) => p.cid);
  s.guideTurn += count;
  s.room = makeFloor(s.rand, s.floor, s.guides.length);
  s.voteMs = floorPlan(s.floor).voteMs;
  s.votes = {};
  s.chosen = null;
  setPhase(s, 'floor', now);
  emit(s, 'floor', { floor: s.floor });
};

/** Jumps straight to a floor (for trying out higher floors with ?floor=7 on the TV page). */
export function skipToFloor(s, floor, now) {
  s.floor = Math.max(1, Math.min(FLOORS, floor | 0));
  startFloor(s, now);
}

/** A new climb. players: [{ cid, name }]. */
export function createHallway(players, seed = Date.now(), now = 0) {
  const s = {
    rand: mulberry(seed),
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    floor: 1,
    lanterns: LANTERNS,
    score: 0,
    guideTurn: 0,
    guides: [],
    room: null,
    voteMs: VOTE_MS,
    votes: {},
    chosen: null,
    phase: 'floor',
    phaseAt: now,
    closeAt: null,
    history: [],
    stats: {},
    lastSeen: {},
    events: [],
    eventId: 0,
  };
  s.players.forEach((p) => {
    s.stats[p.cid] = { right: 0, guided: 0, guidedSafe: 0 };
    s.lastSeen[p.cid] = now;
  });
  startFloor(s, now);
  return s;
}

/** The door with the most votes. Ties go to the door voted for first. No votes: a random door. */
export function tally(s) {
  const counts = s.room.doors.map(() => 0);
  const first = s.room.doors.map(() => Infinity);
  Object.values(s.votes).forEach((v) => {
    counts[v.door] += 1;
    first[v.door] = Math.min(first[v.door], v.at);
  });
  const best = Math.max(...counts);
  if (best === 0) return { counts, door: Math.floor(s.rand() * s.room.doors.length) };
  let door = -1;
  counts.forEach((c, i) => { if (c === best && (door < 0 || first[i] < first[door])) door = i; });
  return { counts, door };
}

const open = (s, now) => {
  const { counts, door } = tally(s);
  const safe = door === s.room.safe;
  s.chosen = { door, safe, counts };
  Object.entries(s.votes).forEach(([cid, v]) => { if (v.door === s.room.safe && s.stats[cid]) s.stats[cid].right += 1; });
  s.guides.forEach((cid) => {
    if (!s.stats[cid]) return;
    s.stats[cid].guided += 1;
    if (safe) s.stats[cid].guidedSafe += 1;
  });
  if (safe) {
    const fast = Math.max(0, s.voteMs - (now - s.phaseAt));
    s.score += 100 * s.floor + Math.round(fast / 300);
  } else {
    s.lanterns -= 1;
  }
  s.history.push({ floor: s.floor, safe });
  setPhase(s, 'reveal', now);
  emit(s, safe ? 'safe' : 'monster', { door, floor: s.floor });
};

/** Advances the game to `now` (ms). */
export function tick(s, now) {
  const elapsed = now - s.phaseAt;
  switch (s.phase) {
    case 'floor':
      if (elapsed >= FLOOR_MS) { setPhase(s, 'vote', now); emit(s, 'vote'); }
      break;
    case 'vote':
      if (elapsed >= s.voteMs || (s.closeAt != null && now >= s.closeAt)) open(s, now);
      break;
    case 'reveal':
      if (elapsed >= REVEAL_MS) {
        if (s.lanterns <= 0) {
          setPhase(s, 'lost', now);
          emit(s, 'lost');
        } else if (s.floor >= FLOORS) {
          s.score += s.lanterns * 250;
          setPhase(s, 'won', now);
          emit(s, 'won');
        } else {
          s.floor += 1;
          startFloor(s, now);
        }
      }
      break;
    default:
      break;
  }
  return s;
}

/** A phone's vote. Players can change their mind until the door opens. */
export function vote(s, cid, door, now) {
  if (s.phase !== 'vote' || !s.players.some((p) => p.cid === cid)) return false;
  if (!Number.isInteger(door) || door < 0 || door >= s.room.doors.length) return false;
  const prev = s.votes[cid];
  s.votes[cid] = { door, at: prev && prev.door === door ? prev.at : now };
  emit(s, 'voted', { by: cid, door });
  const waiting = activePlayers(s, now).some((p) => !s.votes[p.cid]);
  s.closeAt = waiting ? null : now + CLOSE_MS;
  return true;
}

export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.stats[cid] = { right: 0, guided: 0, guidedSafe: 0 };
  s.lastSeen[cid] = now;
}

export const isOver = (s) => s.phase === 'won' || s.phase === 'lost';

/** What one phone needs to show. */
export function phoneView(s, cid, now) {
  const guide = s.guides.indexOf(cid);
  const view = {
    phase: s.phase,
    floor: s.floor,
    floors: FLOORS,
    lanterns: s.lanterns,
    score: s.score,
    doors: s.room.doors,
    guide: guide >= 0,
    guideNames: s.guides.map((g) => s.players.find((p) => p.cid === g)?.name).filter(Boolean),
    vote: s.votes[cid] ? s.votes[cid].door : null,
  };
  if (guide >= 0 && s.phase !== 'floor') view.clues = s.room.hands[guide].map(clueText);
  if (s.phase === 'vote') { view.left = Math.max(0, s.voteMs - (now - s.phaseAt)); view.total = s.voteMs; }
  if (s.phase === 'reveal' && s.chosen) view.chosen = { door: s.chosen.door, safe: s.chosen.safe, safeDoor: s.room.safe };
  return view;
}

/** End-of-game awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const best = (pick) => {
    let top = null;
    s.players.forEach((p) => {
      const v = pick(s.stats[p.cid] || { right: 0, guided: 0, guidedSafe: 0 });
      if (v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const add = (pick, title, blurb) => { const b = best(pick); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add((st) => st.guidedSafe, 'Lantern Bearer', (v) => `Guided the crew through ${v} safe door${v === 1 ? '' : 's'}`);
  add((st) => st.right, 'Door Whisperer', (v) => `Voted for the safe door ${v} time${v === 1 ? '' : 's'}`);
  return list;
}
