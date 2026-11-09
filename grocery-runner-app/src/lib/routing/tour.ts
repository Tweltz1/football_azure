import { Cell } from '../types';
import { astar } from './astar';
import { sameCell, StoreGrid } from './grid';

/** Walking distance from one cell to every reachable cell (unit-cost BFS). */
function distancesFrom(grid: StoreGrid, from: Cell): Int32Array {
  const dist = new Int32Array(grid.width * grid.height).fill(-1);
  const queue: Cell[] = [from];
  dist[grid.index(from)] = 0;
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    const d = dist[grid.index(c)];
    for (const n of grid.neighbours(c)) {
      const ni = grid.index(n);
      if (dist[ni] === -1) {
        dist[ni] = d + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

/**
 * Order of stops that keeps total walking short, for a fixed start and end.
 * Nearest-neighbour to get a decent tour, then 2-opt to remove crossings.
 * Exact TSP is not worth it: lists are small and this is within a few % of optimal.
 * Returns indices into `stops`.
 */
export function orderStops(grid: StoreGrid, start: Cell, stops: Cell[], end: Cell): number[] {
  if (stops.length <= 1) return stops.map((_, i) => i);
  // Node 0 = start, 1..n = stops, n+1 = end.
  const nodes = [start, ...stops, end];
  const maps = nodes.map((c) => distancesFrom(grid, c));
  const d = (a: number, b: number) => {
    const v = maps[a][grid.index(nodes[b])];
    return v < 0 ? 1e6 : v; // unreachable stops sink to the end
  };

  const n = stops.length;
  const remaining = new Set(Array.from({ length: n }, (_, i) => i + 1));
  const tour: number[] = [];
  let cur = 0;
  while (remaining.size) {
    let best = -1;
    let bestD = Infinity;
    for (const r of remaining) {
      const dist = d(cur, r);
      if (dist < bestD) {
        bestD = dist;
        best = r;
      }
    }
    tour.push(best);
    remaining.delete(best);
    cur = best;
  }

  const full = [0, ...tour, n + 1];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < full.length - 2; i++) {
      for (let k = i + 1; k < full.length - 1; k++) {
        const delta =
          d(full[i - 1], full[k]) + d(full[i], full[k + 1]) - d(full[i - 1], full[i]) - d(full[k], full[k + 1]);
        if (delta < 0) {
          // Reverse full[i..k]. Grid distances are symmetric, so the inner legs do not change.
          full.splice(i, k - i + 1, ...full.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return full.slice(1, -1).map((i) => i - 1);
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
