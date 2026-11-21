import { COLD_DEPARTMENTS, guessDepartment } from '../departments';
import { coldDepartmentOfAisle, StoreProfile } from '../storeProfile';
import { Cell, ItemLocation, ListItem } from '../types';
import { buildGenericLayout, cellForLocation, parseAisleNumber, StoreLayout } from './layout';
import { buildBlockLayout } from './blockPlan';
import { AnyPlan, buildPlanLayout, isBlockPlan } from './plan';
import { orderStops, walkLength, walkPath } from './tour';

/** `offMap`: items whose department the store's map doesn't show, listed last and not drawn. */
export type RouteStop = { cell: Cell; items: ListItem[]; offMap?: boolean };

export type PlannedRoute = {
  layout: StoreLayout;
  stops: RouteStop[];
  path: Cell[];
  /** Walking distance in grid cells (roughly 1.5 m / 5 ft each). */
  distance: number;
};

const MAX_AISLES = 80;

/** Location to route with: the item's own, else a department guessed from its name. */
export function effectiveLocation(item: ListItem): ItemLocation {
  if (item.location.kind !== 'unknown') return item.location;
  return { kind: 'department', department: guessDepartment(item.name), source: 'guess' };
}

function isCold(loc: ItemLocation, profile?: StoreProfile): boolean {
  if (loc.kind === 'department') return COLD_DEPARTMENTS.includes(loc.department);
  if (loc.kind !== 'aisle') return false;
  if (loc.department) return COLD_DEPARTMENTS.includes(loc.department);
  // An aisle shoppers have shown to be the frozen or dairy aisle at this store.
  const n = parseAisleNumber(loc.aisle);
  return n !== null && !!coldDepartmentOfAisle(profile, n);
}

/**
 * Plans the walk: entrance -> every unchecked item -> checkout.
 * With `coldLast`, frozen and dairy are picked up after everything else.
 */
export function planRoute(
  items: ListItem[],
  aisleCount: number,
  opts: { coldLast?: boolean; profile?: StoreProfile; mirror?: boolean; plan?: AnyPlan | null } = {},
): PlannedRoute {
  const todo = items.filter((i) => !i.checked);

  // Make room for any aisle number higher than the store's aisle count.
  // A typo like "140" or "2026" is not an aisle: ignore numbers past MAX_AISLES when sizing the map.
  const highest = Math.max(
    aisleCount,
    ...todo.map((i) => {
      const n = i.location.kind === 'aisle' ? parseAisleNumber(i.location.aisle) ?? 0 : 0;
      return n <= MAX_AISLES ? n : 0;
    }),
    ...Object.values(opts.profile?.departmentAisle ?? {}),
  );
  const layout = !opts.plan
    ? buildGenericLayout(highest, { profile: opts.profile, mirror: opts.mirror })
    : isBlockPlan(opts.plan)
      ? buildBlockLayout(opts.plan)
      : buildPlanLayout(opts.plan, { profile: opts.profile });

  // A map without aisle numbers: an item's aisle can't be placed, so walk to its department.
  const placeable = (item: ListItem): ItemLocation => {
    const loc = effectiveLocation(item);
    if (!layout.noAisleNumbers || loc.kind !== 'aisle') return loc;
    return { kind: 'department', department: loc.department ?? guessDepartment(item.name), source: 'guess' };
  };

  // Group items that are picked from the same spot.
  const byCell = new Map<string, RouteStop & { cold: boolean }>();
  const offMap: ListItem[] = [];
  for (const item of todo) {
    const loc = placeable(item);
    const cell = cellForLocation(layout, loc);
    if (!cell) {
      offMap.push(item);
      continue;
    }
    const key = `${cell.x},${cell.y}`;
    const stop = byCell.get(key) ?? { cell, items: [], cold: true };
    stop.items.push(item);
    stop.cold = stop.cold && isCold(loc, opts.profile);
    byCell.set(key, stop);
  }
  const all = [...byCell.values()];

  const warm = opts.coldLast ? all.filter((s) => !s.cold) : all;
  const cold = opts.coldLast ? all.filter((s) => s.cold) : [];
  const ordered: RouteStop[] = [];
  const place = (group: typeof all, from: Cell, to: Cell) => orderStops(layout.grid, from, group.map((s) => s.cell), to).map((i) => group[i]);
  if (!warm.length || !cold.length) {
    ordered.push(...place(warm.length ? warm : cold, layout.entrance, layout.checkout));
  } else {
    // Frozen and dairy last: try handing off to each cold stop and keep the shortest whole walk.
    let best: { stops: typeof all; length: number } | null = null;
    for (const handoff of cold) {
      const first = place(warm, layout.entrance, handoff.cell);
      const second = place(cold, first[first.length - 1].cell, layout.checkout);
      const stops = [...first, ...second];
      const length = walkLength(layout.grid, [layout.entrance, ...stops.map((s) => s.cell), layout.checkout]);
      if (!best || length < best.length) best = { stops, length };
    }
    ordered.push(...best!.stops);
  }
  for (let i = 0; i < ordered.length; i++) ordered[i] = { cell: ordered[i].cell, items: ordered[i].items };

  const { path, distance } = walkPath(layout.grid, [layout.entrance, ...ordered.map((s) => s.cell), layout.checkout]);
  if (offMap.length) ordered.push({ cell: layout.checkout, items: offMap, offMap: true });
  return { layout, stops: ordered, path, distance };
}
