import { Cell } from '../types';
import { manhattan, sameCell, StoreGrid } from './grid';

/** Small binary min-heap keyed by f-score. */
export class MinHeap<T> {
  private items: { key: number; value: T }[] = [];
  get size() {
    return this.items.length;
  }
  push(key: number, value: T) {
    const a = this.items;
    a.push({ key, value });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].key <= a[i].key) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0].value;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].key < a[m].key) m = l;
        if (r < a.length && a[r].key < a[m].key) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export type PathResult = { path: Cell[]; distance: number };

/** A small extra cost per turn, so equal-length paths run straight along aisles instead of in stair-steps. */
const TURN = 0.25;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * A* walking path between two floor cells, over (cell, heading) states so turns cost a little.
 * Steps cost the cell's cost (1 on walkways), so Manhattan distance stays admissible.
 * `distance` is the number of steps walked. Returns null when the goal can't be reached.
 */
export function astar(grid: StoreGrid, start: Cell, goal: Cell): PathResult | null {
  if (!grid.isWalkable(start) || !grid.isWalkable(goal)) return null;
  if (sameCell(start, goal)) return { path: [start], distance: 0 };

  const g = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap<number>();
  const gi = grid.index(goal);
  const cellOf = (state: number) => {
    const k = state >> 2;
    return { x: k % grid.width, y: Math.floor(k / grid.width) };
  };

  // Start with no heading: any first direction is free.
  const s0 = -1; // the start, before any heading
  g.set(s0, 0);
  open.push(manhattan(start, goal), s0);

  while (open.size) {
    const st = open.pop()!;
    if (closed.has(st)) continue;
    closed.add(st);
    const cur = st === s0 ? start : cellOf(st);
    const ci = grid.index(cur);
    if (ci === gi) {
      const path: Cell[] = [];
      let k: number | undefined = st;
      while (k !== undefined) {
        path.push(k === s0 ? start : cellOf(k));
        k = cameFrom.get(k);
      }
      path.reverse();
      return { path, distance: path.length - 1 };
    }
    const heading = st === s0 ? -1 : st & 3;
    const cg = g.get(st)!;
    DIRS.forEach(([dx, dy], d) => {
      const n = { x: cur.x + dx, y: cur.y + dy };
      if (!grid.isWalkable(n)) return;
      const ns = grid.index(n) * 4 + d;
      if (closed.has(ns)) return;
      const tentative = cg + grid.cost(n) + (heading >= 0 && heading !== d ? TURN : 0);
      if (tentative < (g.get(ns) ?? Infinity)) {
        g.set(ns, tentative);
        cameFrom.set(ns, st);
        open.push(tentative + manhattan(n, goal), ns);
      }
    });
  }
  return null;
}
