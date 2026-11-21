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

/** Walking cost through the given waypoints, using shortest distances (no path drawn). */
export function walkLength(grid: StoreGrid, waypoints: Cell[]): number {
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const v = distancesFrom(grid, waypoints[i])[grid.index(waypoints[i + 1])];
    total += v < 0 ? 1e6 : v;
  }
  return total;
}
