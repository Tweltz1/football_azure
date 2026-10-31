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
const ATTRS = { color: COLORS, symbol: SYMBOLS, window: WINDOWS };
const byId = (list, id) => list.find((x) => x.id === id);
const MONSTERS = ['ghost', 'bat', 'skeleton', 'zombie', 'spider', 'witch'];

/** How hard each floor is: number of doors and clues. */
export const floorPlan = (floor) => (floor <= 3 ? { doors: 3, clues: 2 } : floor <= 6 ? { doors: 4, clues: 3 } : { doors: 5, clues: 3 });

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

/** A clue is { attr, value, yes }: "the safe door has/doesn't have <value>". */
export const clueText = (c) => {
  const v = byId(ATTRS[c.attr], c.value);
  if (c.attr === 'color') return c.yes ? `The safe door is ${v.name}.` : `The safe door is NOT ${v.name}.`;
  return c.yes ? `The safe door has ${v.name}.` : `The safe door does NOT have ${v.name}.`;
};
const fits = (door, c) => (door[c.attr] === c.value) === c.yes;
const matching = (doors, clues) => doors.filter((d) => clues.every((c) => fits(d, c)));

/** Builds a floor: doors that all look different, a safe one, and clues split between guides. */
export function makeFloor(rand, floor, guideCount) {
  const plan = floorPlan(floor);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const doors = [];
    const seen = new Set();
    while (doors.length < plan.doors) {
      const d = { color: pickOne(rand, COLORS).id, symbol: pickOne(rand, SYMBOLS).id, window: pickOne(rand, WINDOWS).id };
      const key = `${d.color}-${d.symbol}-${d.window}`;
      if (!seen.has(key)) { seen.add(key); doors.push(d); }
    }
    const safe = Math.floor(rand() * doors.length);
    const s = doors[safe];
    // Every true clue about the safe door that rules out at least one other door.
    const pool = [];
    Object.keys(ATTRS).forEach((attr) => {
      pool.push({ attr, value: s[attr], yes: true });
      ATTRS[attr].forEach((v) => { if (v.id !== s[attr] && doors.some((d) => d[attr] === v.id)) pool.push({ attr, value: v.id, yes: false }); });
    });
    const useful = pool.filter((c) => doors.some((d) => !fits(d, c)));
    const clues = shuffle(rand, useful).slice(0, plan.clues);
    if (clues.length < plan.clues) continue;
    if (matching(doors, clues).length !== 1) continue;
    // No clue can be left out, so everyone's clues matter.
    if (clues.some((c) => matching(doors, clues.filter((x) => x !== c)).length === 1)) continue;
    const hands = Array.from({ length: Math.max(1, guideCount) }, () => []);
    clues.forEach((c, i) => hands[i % hands.length].push(c));
    if (hands.length > 1 && hands.some((h) => matching(doors, h).length === 1)) continue;
    return { doors, safe, clues, hands, monster: pickOne(rand, MONSTERS) };
  }
  // Fallback: plain clues that always work.
  const doors = COLORS.slice(0, plan.doors).map((c, i) => ({ color: c.id, symbol: SYMBOLS[i].id, window: WINDOWS[i % 3].id }));
  const safe = Math.floor(rand() * doors.length);
  const clues = [{ attr: 'color', value: doors[safe].color, yes: true }];
  return { doors, safe, clues, hands: [clues], monster: 'ghost' };
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
  s.votes = {};
  s.chosen = null;
  setPhase(s, 'floor', now);
  emit(s, 'floor', { floor: s.floor });
};

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
    const fast = Math.max(0, VOTE_MS - (now - s.phaseAt));
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
      if (elapsed >= VOTE_MS || (s.closeAt != null && now >= s.closeAt)) open(s, now);
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
  if (s.phase === 'vote') view.left = Math.max(0, VOTE_MS - (now - s.phaseAt));
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
