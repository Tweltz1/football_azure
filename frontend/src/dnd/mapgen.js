// Builds a fresh battle map for a setting from a seed. The same seed always gives the same map, and
// a new session gets a new seed, so no two nights look alike.
//
// A map is { w, h, tiles: [{ t, e, p }], start: [{x, y}], exit: {x, y}, spawns: [{ monster, x, y }], setting, seed }.
//   t: 'floor' | 'diff' | 'wall' | 'water' | 'void' | 'door' | 'road'
//   e: ground level 0-2 (mountains and ledges; one level up costs 5 ft extra, two is a cliff)
//   p: a prop id from settings.PROPS, or null

import { makeRng, tools } from './rng';
import { settingFor, PROPS } from './settings';
import { MONSTERS } from './rules';
import { isOpen, reachable, tileAt } from './movement';
import { NPC_ROLES } from './npcs';

const T = (t = 'wall', e = 0, p = null) => ({ t, e, p });

const blank = (w, h, fill = 'wall') => Array.from({ length: w * h }, () => T(fill));

const set = (m, x, y, patch) => {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
  Object.assign(m.tiles[y * m.w + x], patch);
};

// ---- Rooms and corridors (dungeon, crypt, castle) ------------------------------------------------------

const roomsMap = (m, r, s) => {
  const rooms = [];
  const tries = 80;
  for (let i = 0; i < tries && rooms.length < (s.grand ? 6 : 7); i += 1) {
    const rw = r.int(s.grand ? 4 : 3, s.grand ? 7 : 6);
    const rh = r.int(3, s.grand ? 6 : 5);
    const rx = r.int(1, m.w - rw - 1);
    const ry = r.int(1, m.h - rh - 1);
    const clash = rooms.some((o) => rx <= o.x + o.w && rx + rw >= o.x - 1 && ry <= o.y + o.h && ry + rh >= o.y - 1);
    if (clash) continue;
    rooms.push({ x: rx, y: ry, w: rw, h: rh });
  }
  rooms.sort((a, b) => a.x - b.x);
  rooms.forEach((room) => {
    for (let y = room.y; y < room.y + room.h; y += 1) for (let x = room.x; x < room.x + room.w; x += 1) set(m, x, y, { t: 'floor' });
  });
  const center = (o) => ({ x: Math.floor(o.x + o.w / 2), y: Math.floor(o.y + o.h / 2) });
  const carve = (x, y) => {
    const tile = tileAt(m, x, y);
    if (tile && tile.t === 'wall') set(m, x, y, { t: 'floor', corridor: true });
  };
  for (let i = 1; i < rooms.length; i += 1) {
    const a = center(rooms[i - 1]);
    const b = center(rooms[i]);
    if (r.chance(0.5)) {
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x += 1) carve(x, a.y);
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y += 1) carve(b.x, y);
    } else {
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y += 1) carve(a.x, y);
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x += 1) carve(x, b.y);
    }
  }
  // An extra loop now and then, so there's more than one way around.
  if (rooms.length > 3 && r.chance(0.6)) {
    const a = center(rooms[0]);
    const b = center(rooms[rooms.length - 2]);
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y += 1) carve(a.x, y);
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x += 1) carve(x, b.y);
  }
  // Doors where a corridor meets a room wall line.
  rooms.forEach((room) => {
    for (let x = room.x - 1; x <= room.x + room.w; x += 1) {
      [room.y - 1, room.y + room.h].forEach((y) => { if (tileAt(m, x, y)?.corridor && r.chance(0.5)) set(m, x, y, { t: 'door' }); });
    }
    for (let y = room.y - 1; y <= room.y + room.h; y += 1) {
      [room.x - 1, room.x + room.w].forEach((x) => { if (tileAt(m, x, y)?.corridor && r.chance(0.5)) set(m, x, y, { t: 'door' }); });
    }
  });
  // Rubble and props in rooms, away from the walls' doorways.
  rooms.forEach((room, index) => {
    const area = room.w * room.h;
    const props = Math.floor(area / 7) + r.int(0, 2);
    for (let i = 0; i < props; i += 1) {
      const x = r.int(room.x, room.x + room.w - 1);
      const y = r.int(room.y, room.y + room.h - 1);
      if (tileAt(m, x, y).p) continue;
      if (r.chance(0.25)) set(m, x, y, { t: 'diff' });
      else set(m, x, y, { p: r.pick(s.props) });
    }
    if (s.grand && index === Math.floor(rooms.length / 2)) {
      // A carpet runner through the great hall.
      const y = Math.floor(room.y + room.h / 2);
      for (let x = room.x; x < room.x + room.w; x += 1) set(m, x, y, { carpet: true, p: null, t: 'floor' });
    }
  });
  if (s.graveyard) {
    // The first rooms are an open graveyard on the surface.
    rooms.slice(0, 2).forEach((room) => {
      for (let y = room.y; y < room.y + room.h; y += 1) {
        for (let x = room.x; x < room.x + room.w; x += 1) {
          if ((x + y) % 2 === 0 && r.chance(0.45)) set(m, x, y, { p: 'grave' });
          else if (r.chance(0.12)) set(m, x, y, { t: 'diff' });
        }
      }
    });
  }
  m.rooms = rooms;
  return rooms.length ? center(rooms[0]) : { x: 1, y: 1 };
};

// ---- Caves: cellular automata ------------------------------------------------------------------------

const caveMap = (m, r) => {
  let open = Array.from({ length: m.w * m.h }, (_, i) => {
    const x = i % m.w;
    const y = Math.floor(i / m.w);
    if (x === 0 || y === 0 || x === m.w - 1 || y === m.h - 1) return false;
    return r.rand() > 0.42;
  });
  for (let step = 0; step < 4; step += 1) {
    const prev = open;
    open = prev.map((_, i) => {
      const x = i % m.w;
      const y = Math.floor(i / m.w);
      if (x === 0 || y === 0 || x === m.w - 1 || y === m.h - 1) return false;
      let walls = 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (!prev[(y + dy) * m.w + x + dx]) walls += 1;
      return walls < 5;
    });
  }
  open.forEach((o, i) => { m.tiles[i].t = o ? 'floor' : 'wall'; });
  // Pools, a raised ledge, and cave clutter.
  const pools = r.int(1, 3);
  for (let i = 0; i < pools; i += 1) {
    const cx = r.int(3, m.w - 4);
    const cy = r.int(3, m.h - 4);
    const rad = r.int(1, 2);
    for (let y = cy - rad; y <= cy + rad; y += 1) {
      for (let x = cx - rad; x <= cx + rad; x += 1) {
        const tile = tileAt(m, x, y);
        if (tile && tile.t === 'floor' && (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) set(m, x, y, { t: Math.abs(x - cx) + Math.abs(y - cy) === rad ? 'diff' : 'water' });
      }
    }
  }
  const lx = r.int(2, m.w - 7);
  const ly = r.int(2, m.h - 6);
  for (let y = ly; y < ly + r.int(3, 4); y += 1) for (let x = lx; x < lx + r.int(4, 6); x += 1) if (tileAt(m, x, y)?.t === 'floor') set(m, x, y, { e: 1 });
  return null;
};

// ---- Forest road and swamp: open ground with noise ------------------------------------------------------

const forestMap = (m, r, s) => {
  m.tiles.forEach((tile) => { tile.t = 'floor'; });
  // A winding road from the left edge to the right.
  let y = r.int(3, m.h - 4);
  for (let x = 0; x < m.w; x += 1) {
    set(m, x, y, { t: 'road' });
    set(m, x, y + 1, { t: 'road' });
    if (r.chance(0.3)) y = Math.min(m.h - 3, Math.max(1, y + (r.chance(0.5) ? 1 : -1)));
    set(m, x, y, { t: 'road' });
  }
  for (let i = 0; i < m.w * m.h * 0.24; i += 1) {
    const x = r.int(0, m.w - 1);
    const yy = r.int(0, m.h - 1);
    const tile = tileAt(m, x, yy);
    if (tile.t === 'road' || tile.p) continue;
    if (r.chance(0.2)) set(m, x, yy, { t: 'diff' });
    else set(m, x, yy, { p: r.pick(s.props) });
  }
  // A small rise or two the party can fight from.
  const hx = r.int(2, m.w - 5);
  const hy = r.chance(0.5) ? 1 : m.h - 4;
  for (let yy = hy; yy < hy + 3; yy += 1) for (let x = hx; x < hx + 3; x += 1) if (tileAt(m, x, yy)?.t !== 'road') set(m, x, yy, { e: 1 });
  return { x: 0, y };
};

const swampMap = (m, r, s) => {
  m.tiles.forEach((tile, i) => {
    const x = i % m.w;
    const y = Math.floor(i / m.w);
    const wave = Math.sin(x * 0.7 + r.rand() * 0.6) + Math.cos(y * 0.9 + x * 0.2);
    tile.t = wave < -0.9 ? 'water' : wave < -0.2 ? 'diff' : 'floor';
  });
  for (let i = 0; i < m.w * m.h * 0.14; i += 1) {
    const x = r.int(0, m.w - 1);
    const y = r.int(0, m.h - 1);
    const tile = tileAt(m, x, y);
    if (tile.t === 'water' || tile.p) continue;
    set(m, x, y, { p: r.pick(s.props.filter((p) => p !== 'hut')) });
  }
  // The witch's hut, raised on a hummock.
  const hx = r.int(m.w - 7, m.w - 3);
  const hy = r.int(2, m.h - 3);
  for (let y = hy - 1; y <= hy + 1; y += 1) for (let x = hx - 1; x <= hx + 1; x += 1) set(m, x, y, { t: 'floor', e: 1, p: null });
  set(m, hx, hy, { p: 'hut' });
  return null;
};

// ---- Mountain pass: terraces and cliffs --------------------------------------------------------------------

const mountainMap = (m, r, s) => {
  const phase = r.rand() * 6;
  m.tiles.forEach((tile, i) => {
    const x = i % m.w;
    const y = Math.floor(i / m.w);
    const v = Math.sin(x * 0.45 + phase) * 0.9 + Math.cos(y * 0.6 + x * 0.15) * 0.8 + (r.rand() - 0.5) * 0.4 + y * 0.08;
    tile.t = 'floor';
    tile.e = v > 0.9 ? 2 : v > -0.1 ? 1 : 0;
  });
  // Smooth so most neighbors differ by at most one level, but keep a few real cliffs.
  for (let pass = 0; pass < 2; pass += 1) {
    m.tiles.forEach((tile, i) => {
      const x = i % m.w;
      const y = Math.floor(i / m.w);
      [[1, 0], [0, 1]].forEach(([dx, dy]) => {
        const n = tileAt(m, x + dx, y + dy);
        if (n && Math.abs(n.e - tile.e) > 1 && r.chance(0.7)) n.e = tile.e + Math.sign(n.e - tile.e);
      });
    });
  }
  // The pass itself: a trail across, cut level by level.
  let y = r.int(4, m.h - 5);
  for (let x = 0; x < m.w; x += 1) {
    const here = tileAt(m, x, y);
    const prev = tileAt(m, x - 1, y);
    if (prev && Math.abs(here.e - prev.e) > 1) here.e = prev.e + Math.sign(here.e - prev.e);
    here.t = 'road';
    if (r.chance(0.25)) {
      const ny = Math.min(m.h - 2, Math.max(1, y + (r.chance(0.5) ? 1 : -1)));
      const n = tileAt(m, x, ny);
      if (Math.abs(n.e - here.e) > 1) n.e = here.e + Math.sign(n.e - here.e);
      n.t = 'road';
      y = ny;
    }
  }
  for (let i = 0; i < m.w * m.h * 0.16; i += 1) {
    const x = r.int(0, m.w - 1);
    const yy = r.int(0, m.h - 1);
    const tile = tileAt(m, x, yy);
    if (tile.t === 'road' || tile.p) continue;
    if (r.chance(0.3)) tile.t = 'diff';
    else tile.p = r.pick(s.props);
  }
  // A chasm.
  const cx = r.int(5, m.w - 6);
  for (let yy = 0; yy < m.h; yy += 1) {
    const tile = tileAt(m, cx, yy);
    if (tile.t !== 'road' && r.chance(0.8)) { tile.t = 'void'; tile.p = null; }
  }
  return null;
};

// ---- Tavern: a common room with a bar, tables, a hearth and the street outside --------------------

const tavernMap = (m, r) => {
  m.tiles.forEach((tile) => { tile.t = 'wall'; });
  const street = 2;
  for (let y = 0; y < m.h; y += 1) for (let x = 0; x < street; x += 1) set(m, x, y, { t: 'road', outside: true });
  const x0 = street + 1;
  for (let y = 1; y < m.h - 1; y += 1) for (let x = x0; x < m.w - 1; x += 1) set(m, x, y, { t: 'floor' });
  const doorY = r.int(3, m.h - 4);
  set(m, x0 - 1, doorY, { t: 'door' });
  // The bar along the back wall, with a gap to get behind it.
  const barX = m.w - 4;
  for (let y = 2; y < m.h - 3; y += 1) set(m, barX, y, { p: 'bar' });
  set(m, barX, m.h - 3, { p: null });
  set(m, m.w - 2, 2, { p: 'barrel' });
  set(m, m.w - 2, 3, { p: 'barrel' });
  // A hearth on the top wall.
  const hearthX = r.int(x0 + 2, barX - 3);
  set(m, hearthX, 1, { p: 'hearth' });
  // Tables with stools around them.
  for (let i = 0; i < 7; i += 1) {
    const tx = r.int(x0 + 1, barX - 2);
    const ty = r.int(2, m.h - 3);
    const area = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => tileAt(m, tx + dx, ty + dy)));
    if (area.some((t) => !t || t.p || t.t !== 'floor')) continue;
    set(m, tx, ty, { p: 'table' });
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { if (r.chance(0.55)) set(m, tx + dx, ty + dy, { p: 'stool' }); });
  }
  // A back room through a side door.
  const backY = m.h - 4;
  for (let x = x0; x < x0 + 4; x += 1) set(m, x, backY, { t: 'wall', p: null });
  set(m, x0 + 2, backY, { t: 'door', p: null });
  set(m, x0, m.h - 2, { p: 'crate' });
  return { x: 0, y: doorY };
};

// ---- Putting it together --------------------------------------------------------------------------------

const GENERATORS = { rooms: roomsMap, cave: caveMap, forest: forestMap, swamp: swampMap, mountain: mountainMap, tavern: tavernMap };

/** The biggest connected walkable area, from a seed square or anywhere. */
const regionFrom = (m, from) => {
  const reach = reachable(m, from, 100000);
  return [...reach.values()].map((n) => ({ x: n.x, y: n.y, cost: n.cost }));
};

const openSquares = (m) => m.tiles.map((t, i) => ({ x: i % m.w, y: Math.floor(i / m.w), t })).filter((s) => isOpen(s.t));

/** A party-sized cluster of open squares around `near`. */
const startCluster = (region, near, count) => [...region]
  .sort((a, b) => (Math.abs(a.x - near.x) + Math.abs(a.y - near.y)) - (Math.abs(b.x - near.x) + Math.abs(b.y - near.y)))
  .slice(0, count)
  .map(({ x, y }) => ({ x, y }));

/** Monsters for a party: level and size set how many, the setting sets which. */
export const pickEncounter = (r, setting, partySize = 4, partyLevel = 1, boss = false) => {
  const table = setting.monsters.filter(([id]) => !MONSTERS[id].boss && MONSTERS[id].cr <= Math.max(0.5, partyLevel / 2 + 0.25));
  const pool = table.length ? table : setting.monsters.filter(([id]) => !MONSTERS[id].boss);
  const weighted = pool.flatMap(([id, w]) => Array.from({ length: Math.max(1, Math.round(w * 2)) }, () => id));
  // Rough XP budget per party member (medium difficulty).
  const budget = [0, 50, 100, 150, 250, 500, 600, 750, 900, 1100, 1200][Math.min(10, partyLevel)] * Math.max(1, partySize);
  const out = [];
  let spent = 0;
  if (boss) {
    const bosses = setting.monsters.filter(([id]) => MONSTERS[id].boss && MONSTERS[id].cr <= partyLevel + 2);
    if (bosses.length) {
      const id = r.pick(bosses)[0];
      out.push(id);
      spent += MONSTERS[id].xp;
    }
  }
  let guard = 0;
  while (spent < budget && out.length < 9 && guard < 40) {
    guard += 1;
    const id = r.pick(weighted);
    if (spent + MONSTERS[id].xp > budget * 1.25 && out.length) break;
    out.push(id);
    spent += MONSTERS[id].xp;
  }
  if (!out.length) out.push(pool[0][0]);
  return out;
};

/**
 * generateMap(settingId, seed, { partySize, partyLevel, boss })
 * Always returns a map where the start, the exit, every monster and every chest are connected.
 */
export const generateMap = (settingId, seed, options = {}) => {
  const s = settingFor(settingId);
  const r = tools(makeRng(seed));
  const m = { w: s.w, h: s.h, tiles: blank(s.w, s.h), setting: s.id, seed };
  const hint = GENERATORS[s.gen](m, r, s);

  // Find the main connected area.
  let open = openSquares(m);
  if (!open.length) {
    set(m, 1, 1, { t: 'floor' });
    open = openSquares(m);
  }
  const anchor = hint && isOpen(tileAt(m, hint.x, hint.y)) ? hint : open[Math.floor(open.length / 2)];
  let region = regionFrom(m, anchor);
  // Caves and swamps can split up: keep trying from other squares for the biggest piece.
  for (let i = 0; i < 6 && region.length < open.length * 0.55; i += 1) {
    const other = regionFrom(m, r.pick(open));
    if (other.length > region.length) region = other;
  }
  const inRegion = new Set(region.map((p) => `${p.x},${p.y}`));
  // Fill in pockets nobody can reach, so the board doesn't show unreachable floor.
  m.tiles.forEach((tile, i) => {
    const k = `${i % m.w},${Math.floor(i / m.w)}`;
    if (isOpen(tile) && !inRegion.has(k) && tile.t !== 'water' && s.gen !== 'forest' && s.gen !== 'swamp' && s.gen !== 'mountain') {
      tile.t = 'wall';
      tile.p = null;
    }
  });

  const startNear = hint && inRegion.has(`${hint.x},${hint.y}`) ? hint : region[0];
  const start = startCluster(region, startNear, 8);
  const fromStart = regionFrom(m, start[0]);
  const far = [...fromStart].sort((a, b) => b.cost - a.cost);
  const exit = far[0] || start[0];
  set(m, exit.x, exit.y, { p: 'exit' });

  // Chests: one to three, in the back half of the map.
  const used = new Set([...start, exit].map((p) => `${p.x},${p.y}`));
  const backHalf = far.slice(1, Math.max(4, Math.floor(far.length / 2)));
  const chests = [];
  for (let i = 0; i < r.int(1, 3) && backHalf.length; i += 1) {
    const spot = r.pick(backHalf);
    const k = `${spot.x},${spot.y}`;
    if (used.has(k)) continue;
    used.add(k);
    // A chest blocks its square, so only place one where the area stays connected around it.
    const before = regionFrom(m, start[0]).length;
    set(m, spot.x, spot.y, { p: 'chest' });
    if (regionFrom(m, start[0]).length < before - 1) set(m, spot.x, spot.y, { p: null });
    else chests.push({ x: spot.x, y: spot.y });
  }

  // Monsters, spread over the middle and far parts of the map.
  const monsters = pickEncounter(r, s, options.partySize || 4, options.partyLevel || 1, Boolean(options.boss));
  const stillOpen = regionFrom(m, start[0]).filter((p) => !used.has(`${p.x},${p.y}`) && isOpen(tileAt(m, p.x, p.y)));
  const spots = r.shuffle(stillOpen.filter((p) => p.cost >= 25));
  const spawns = [];
  monsters.forEach((id, i) => {
    const spot = spots[i] || stillOpen[stillOpen.length - 1 - i];
    if (!spot) return;
    used.add(`${spot.x},${spot.y}`);
    spawns.push({ monster: id, x: spot.x, y: spot.y });
  });

  // Friendly folk: one or two, between the start and the middle of the map, never cutting off a path.
  const roles = r.shuffle(NPC_ROLES[s.id] || ['Traveler']);
  const npcs = [];
  const npcSpots = r.shuffle(regionFrom(m, start[0]).filter((p) => p.cost >= 10 && p.cost <= 60 && !used.has(`${p.x},${p.y}`) && !tileAt(m, p.x, p.y).p && tileAt(m, p.x, p.y).t !== 'water'));
  const want = r.int(1, 2);
  for (let i = 0; i < npcSpots.length && npcs.length < want; i += 1) {
    const spot = npcSpots[i];
    const before = regionFrom(m, start[0]).length;
    set(m, spot.x, spot.y, { p: 'npc' });
    if (regionFrom(m, start[0]).length < before - 1) {
      set(m, spot.x, spot.y, { p: null });
    } else {
      used.add(`${spot.x},${spot.y}`);
      npcs.push({ x: spot.x, y: spot.y, role: roles[npcs.length % roles.length] });
    }
  }

  return { ...m, start, exit: { x: exit.x, y: exit.y }, chests, spawns, npcs, name: s.name };
};

/** What a prop is called, for the narrator and the phones. */
export const propLabel = (p) => PROPS[p]?.label || '';
