import { Cell } from '../types';
import { manhattan, sameCell, StoreGrid } from './grid';

/** Small binary min-heap keyed by f-score. */
class MinHeap<T> {
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

/**
 * A* shortest walking path between two floor cells.
 * Manhattan distance is admissible on a 4-connected grid with unit steps, so the result is optimal.
 * Returns null when the goal cannot be reached (e.g. it is inside a shelf).
 */
export function astar(grid: StoreGrid, start: Cell, goal: Cell): PathResult | null {
  if (!grid.isWalkable(start) || !grid.isWalkable(goal)) return null;
  if (sameCell(start, goal)) return { path: [start], distance: 0 };

  const g = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap<Cell>();

  const si = grid.index(start);
  const gi = grid.index(goal);
  g.set(si, 0);
  open.push(manhattan(start, goal), start);

  while (open.size) {
    const cur = open.pop()!;
    const ci = grid.index(cur);
    if (ci === gi) {
      const path: Cell[] = [];
      let k: number | undefined = ci;
      while (k !== undefined) {
        path.push({ x: k % grid.width, y: Math.floor(k / grid.width) });
        k = cameFrom.get(k);
      }
      path.reverse();
      return { path, distance: g.get(ci)! };
    }
    if (closed.has(ci)) continue;
    closed.add(ci);

    const cg = g.get(ci)!;
    for (const n of grid.neighbours(cur)) {
      const ni = grid.index(n);
      if (closed.has(ni)) continue;
      const tentative = cg + 1;
      if (tentative < (g.get(ni) ?? Infinity)) {
        g.set(ni, tentative);
        cameFrom.set(ni, ci);
        open.push(tentative + manhattan(n, goal), n);
      }
    }
  }
  return null;
}
