import { Cell } from '../types';
import { astar, MinHeap } from './astar';
import { sameCell, StoreGrid } from './grid';

/** Walking cost from one cell to every reachable cell (Dijkstra over cell costs; -1 = unreachable). */
export function distancesFrom(grid: StoreGrid, from: Cell): Float64Array {
  const dist = new Float64Array(grid.width * grid.height).fill(-1);
  const heap = new MinHeap<Cell>();
  dist[grid.index(from)] = 0;
  heap.push(0, from);
  const done = new Uint8Array(grid.width * grid.height);
  while (heap.size) {
    const c = heap.pop()!;
    const ci = grid.index(c);
    if (done[ci]) continue;
    done[ci] = 1;
    for (const n of grid.neighbours(c)) {
      const ni = grid.index(n);
      const nd = dist[ci] + grid.cost(n);
      if (dist[ni] < 0 || nd < dist[ni]) {
        dist[ni] = nd;
        heap.push(nd, n);
      }
    }
  }
  return dist;
}

/** Walking cost between every pair of cells (row i = from cells[i]). */
export function distanceMatrix(grid: StoreGrid, cells: Cell[]): number[][] {
  return cells.map((c) => {
    const m = distancesFrom(grid, c);
    return cells.map((o) => {
      const v = m[grid.index(o)];
      return v < 0 ? 1e6 : v; // unreachable stops sink to the end
    });
  });
}

/**
 * Order of `stops` (node numbers in D) that keeps the walk from `start` to `end` short.
 * Nearest-neighbour to get a decent tour, then 2-opt to remove crossings.
 */
export function orderNodes(D: number[][], start: number, stops: number[], end: number): number[] {
  if (stops.length <= 1) return [...stops];
  const remaining = new Set(stops);
  const tour: number[] = [];
  let cur = start;
  while (remaining.size) {
    let best = -1;
    let bestD = Infinity;
    for (const r of remaining) {
      if (D[cur][r] < bestD) {
        bestD = D[cur][r];
        best = r;
      }
    }
    tour.push(best);
    remaining.delete(best);
    cur = best;
  }
  const full = [start, ...tour, end];
  const d = (a: number, b: number) => D[a][b];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < full.length - 2; i++) {
      for (let k = i + 1; k < full.length - 1; k++) {
        const delta = d(full[i - 1], full[k]) + d(full[i], full[k + 1]) - d(full[i - 1], full[i]) - d(full[k], full[k + 1]);
        if (delta < -1e-9) {
          full.splice(i, k - i + 1, ...full.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return full.slice(1, -1);
}

/** Length of a walk through nodes of D. */
export const tourLength = (D: number[][], nodes: number[]) => nodes.slice(1).reduce((sum, n, i) => sum + D[nodes[i]][n], 0);

/**
 * Visits groups of stops in order (all of tiers[0], then tiers[1], ...), each group in its shortest
 * order, choosing where each group hands off to the next so the whole walk is shortest.
 * Returns the stop nodes in walking order.
 */
export function orderTiers(D: number[][], start: number, tiers: number[][], end: number): number[] {
  const groups = tiers.filter((t) => t.length);
  const plan = (from: number, rest: number[][]): number[] => {
    if (rest.length === 1) return orderNodes(D, from, rest[0], end);
    // Only the few nearest hand-off points are worth trying.
    const candidates = [...rest[1]].sort((a, b) => D[from][a] - D[from][b]).slice(0, 5);
    let best: number[] | null = null;
    let bestLen = Infinity;
    for (const h of candidates) {
      const first = orderNodes(D, from, rest[0], h);
      const tail = plan(first[first.length - 1], rest.slice(1));
      const len = tourLength(D, [from, ...first, ...tail, end]);
      if (len < bestLen) {
        bestLen = len;
        best = [...first, ...tail];
      }
    }
    return best!;
  };
  return groups.length ? plan(start, groups) : [];
}

/**
 * Order of stops that keeps total walking short, for a fixed start and end.
 * Returns indices into `stops`.
 */
export function orderStops(grid: StoreGrid, start: Cell, stops: Cell[], end: Cell): number[] {
  if (stops.length <= 1) return stops.map((_, i) => i);
  const D = distanceMatrix(grid, [start, ...stops, end]);
  return orderNodes(D, 0, stops.map((_, i) => i + 1), stops.length + 1).map((i) => i - 1);
}

/** Joins A* legs through the given waypoints into one walking path. */
export function walkPath(grid: StoreGrid, waypoints: Cell[]): { path: Cell[]; distance: number } {
  const path: Cell[] = [];
  let distance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const leg = astar(grid, waypoints[i], waypoints[i + 1]);
    if (!leg) continue;
    distance += leg.distance;
    const cells = path.length && sameCell(path[path.length - 1], leg.path[0]) ? leg.path.slice(1) : leg.path;
    path.push(...cells);
  }
  return { path, distance };
}

