import { COLD_DEPARTMENTS, guessDepartment, NON_FOOD_DEPARTMENTS } from '../departments';
import { coldDepartmentOfAisle, StoreProfile } from '../storeProfile';
import { Cell, ItemLocation, ListItem } from '../types';
import { buildGenericLayout, cellForLocation, parseAisleNumber, StoreLayout } from './layout';
import { buildBlockLayout } from './blockPlan';
import { AnyPlan, buildPlanLayout, isBlockPlan } from './plan';
import { distanceMatrix, orderNodes, orderTiers, tourLength, walkPath } from './tour';

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

/** How much longer (share, plus steps) the preferred shopping order may make the walk. */
const EXTRA_WALK = 0.15;
const EXTRA_STEPS = 12;

/** 0 non-food, 1 shelf-stable food, 2 fresh (produce, meat, deli), 3 frozen and dairy. */
function tierOf(item: ListItem, loc: ItemLocation, profile?: StoreProfile): number {
  if (isCold(loc, profile)) return 3;
  const dept = loc.kind === 'department' ? loc.department : loc.kind === 'aisle' && loc.department ? loc.department : guessDepartment(item.name);
  if (COLD_DEPARTMENTS.includes(dept)) return 3;
  if (NON_FOOD_DEPARTMENTS.includes(dept)) return 0;
  return dept === 'produce' || dept === 'meat' || dept === 'deli' ? 2 : 1;
}

/**
 * Plans the walk: entrance -> every unchecked item -> checkout.
 * With `coldLast`, non-food comes first and fresh, frozen and dairy last, where the layout allows it
 * without much extra walking (frozen and dairy are always last).
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

  // Group items that are picked from the same spot. A stop's tier is its earliest item's.
  const byCell = new Map<string, RouteStop & { tier: number }>();
  const offMap: ListItem[] = [];
  for (const item of todo) {
    const loc = placeable(item);
    const cell = cellForLocation(layout, loc);
    if (!cell) {
      offMap.push(item);
      continue;
    }
    const key = `${cell.x},${cell.y}`;
    const stop = byCell.get(key) ?? { cell, items: [], tier: 3 };
    stop.items.push(item);
    stop.tier = Math.min(stop.tier, tierOf(item, loc, opts.profile));
    byCell.set(key, stop);
  }
  const all = [...byCell.values()];

  // Node 0 = entrance, 1..n = stops, n+1 = the end of the walk (the store side of the checkouts).
  const end = layout.checkoutIn ?? layout.checkout;
  const D = distanceMatrix(layout.grid, [layout.entrance, ...all.map((s) => s.cell), end]);
  const nodes = all.map((_, i) => i + 1);
  const of = (pick: (tier: number) => boolean) => nodes.filter((n) => pick(all[n - 1].tier));
  let order: number[];
  if (!opts.coldLast) {
    order = orderNodes(D, 0, nodes, all.length + 1);
  } else {
    // Shopping order, most wanted first: non-food, then shelf-stable food, then fresh, then frozen & dairy.
    // Each is kept only while it costs little extra walking over the plain "cold last" walk.
    const options = [
      [of((t) => t === 0), of((t) => t === 1), of((t) => t === 2), of((t) => t === 3)],
      [of((t) => t <= 1), of((t) => t === 2), of((t) => t === 3)],
      [of((t) => t <= 2), of((t) => t === 3)],
    ].map((tiers) => {
      const o = orderTiers(D, 0, tiers, all.length + 1);
      return { order: o, length: tourLength(D, [0, ...o, all.length + 1]) };
    });
    const base = options[options.length - 1].length;
    order = options.find((o) => o.length <= base * (1 + EXTRA_WALK) + EXTRA_STEPS)!.order;
  }
  const ordered: RouteStop[] = order.map((n) => ({ cell: all[n - 1].cell, items: all[n - 1].items }));

  const { path, distance } = walkPath(layout.grid, [layout.entrance, ...ordered.map((s) => s.cell), ...(layout.checkoutIn ? [layout.checkoutIn] : []), layout.checkout]);
  if (offMap.length) ordered.push({ cell: layout.checkout, items: offMap, offMap: true });
  return { layout, stops: ordered, path, distance };
}
