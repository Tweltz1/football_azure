// Grid movement on 5-foot squares, the way the Player's Handbook variant works:
//  - moving to a side square costs 5 ft
//  - diagonals alternate 5 ft, then 10 ft, then 5 ft (so two diagonals cost 15 ft)
//  - difficult terrain (rubble, mud, brush, webs...) costs double
//  - climbing up one level of ground costs an extra 5 ft; a drop or climb of two levels or more is a cliff
//  - no cutting a corner past a wall, and no walking through enemies (allies are fine, just not stopping on them)

import { PROPS } from './settings';
import { FEET_PER_SQUARE } from './rules';

export const BLOCKED_TILES = new Set(['wall', 'water', 'void']);

export const tileAt = (map, x, y) => (x >= 0 && y >= 0 && x < map.w && y < map.h ? map.tiles[y * map.w + x] : null);

/** Can a creature stand here at all (ignoring other creatures)? */
export const isOpen = (tile) => Boolean(tile) && !BLOCKED_TILES.has(tile.t) && !(tile.p && PROPS[tile.p]?.block);

export const isDifficult = (tile) => Boolean(tile) && (tile.t === 'diff' || Boolean(tile.p && PROPS[tile.p]?.diff));

/** Do walls or tall props stop sight through this tile? */
export const blocksSight = (tile) => !tile || tile.t === 'wall' || Boolean(tile.p && (PROPS[tile.p]?.tall || 0) >= 1);

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const key = (x, y) => `${x},${y}`;
export const parseKey = (k) => k.split(',').map(Number);

/** The cost in feet of one step, or null when it can't be taken. */
export const stepCost = (map, from, to, diagonalParity) => {
  const a = tileAt(map, from.x, from.y);
  const b = tileAt(map, to.x, to.y);
  if (!a || !isOpen(b)) return null;
  const rise = (b.e || 0) - (a.e || 0);
  if (Math.abs(rise) > 1) return null; // a cliff
  const diagonal = from.x !== to.x && from.y !== to.y;
  if (diagonal) {
    // No squeezing between two blocked squares or around a wall corner.
    if (!isOpen(tileAt(map, to.x, from.y)) || !isOpen(tileAt(map, from.x, to.y))) return null;
  }
  let feet = diagonal && diagonalParity ? 2 * FEET_PER_SQUARE : FEET_PER_SQUARE;
  if (isDifficult(b)) feet *= 2;
  if (rise === 1) feet += FEET_PER_SQUARE;
  return feet;
};

/**
 * Every square reachable from `from` within `budget` feet.
 * occupant(x, y) returns 'ally', 'enemy' or null for whoever stands there.
 * Returns Map(key -> { cost, x, y, prev, end }) where end says the creature may stop there.
 */
export const reachable = (map, from, budget, occupant = () => null) => {
  // Dijkstra over (square, diagonal parity), since the next diagonal's price depends on how many came before.
  const best = new Map();
  const out = new Map();
  const queue = [{ x: from.x, y: from.y, cost: 0, parity: 0, prev: null }];
  best.set(`${key(from.x, from.y)}|0`, 0);
  while (queue.length) {
    let i = 0;
    for (let j = 1; j < queue.length; j += 1) if (queue[j].cost < queue[i].cost) i = j;
    const cur = queue.splice(i, 1)[0];
    const k = key(cur.x, cur.y);
    if (!out.has(k) || out.get(k).cost > cur.cost) {
      const who = cur.prev ? occupant(cur.x, cur.y) : null;
      out.set(k, { x: cur.x, y: cur.y, cost: cur.cost, prev: cur.prev, end: !who });
    }
    DIRS.forEach(([dx, dy]) => {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const diagonal = dx !== 0 && dy !== 0;
      const feet = stepCost(map, cur, { x: nx, y: ny }, cur.parity);
      if (feet == null) return;
      const total = cur.cost + feet;
      if (total > budget) return;
      if (occupant(nx, ny) === 'enemy') return;
      const parity = diagonal ? 1 - cur.parity : cur.parity;
      const sk = `${key(nx, ny)}|${parity}`;
      if (best.has(sk) && best.get(sk) <= total) return;
      best.set(sk, total);
      queue.push({ x: nx, y: ny, cost: total, parity, prev: k });
    });
  }
  return out;
};

/** The squares walked to reach `to`, start first. */
export const pathTo = (reach, to) => {
  const steps = [];
  let k = key(to.x, to.y);
  const seen = new Set();
  while (k && reach.has(k) && !seen.has(k)) {
    seen.add(k);
    const node = reach.get(k);
    steps.unshift({ x: node.x, y: node.y });
    k = node.prev;
  }
  return steps;
};

/** Distance in squares with the 5/10/5 diagonal rule (for weapon and spell ranges). */
export const squaresBetween = (a, b) => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
};
export const feetBetween = (a, b) => squaresBetween(a, b) * FEET_PER_SQUARE;

/** True when touching, including diagonally. */
export const adjacent = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;

/** Line of sight between two square centers. Walls and tall props in between block it. */
export const lineOfSight = (map, a, b) => {
  let x0 = a.x;
  let y0 = a.y;
  const dx = Math.abs(b.x - x0);
  const dy = -Math.abs(b.y - y0);
  const sx = x0 < b.x ? 1 : -1;
  const sy = y0 < b.y ? 1 : -1;
  let err = dx + dy;
  while (!(x0 === b.x && y0 === b.y)) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
    if (x0 === b.x && y0 === b.y) break;
    if (blocksSight(tileAt(map, x0, y0))) return false;
  }
  return true;
};

/** Squares a creature could stand on, nearest to `to` first, for walking monsters toward a target. */
export const nearestStops = (reach, target) => [...reach.values()]
  .filter((n) => n.end)
  .sort((p, q) => squaresBetween(p, target) - squaresBetween(q, target) || p.cost - q.cost);
