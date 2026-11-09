import { COLD_DEPARTMENTS, guessDepartment } from '../departments';
import { Cell, ItemLocation, ListItem } from '../types';
import { buildGenericLayout, cellForLocation, parseAisleNumber, StoreLayout } from './layout';
import { orderStops, walkPath } from './tour';

export type RouteStop = { cell: Cell; items: ListItem[] };

export type PlannedRoute = {
  layout: StoreLayout;
  stops: RouteStop[];
  path: Cell[];
  /** Walking distance in grid cells (roughly 1.5 m / 5 ft each). */
  distance: number;
};

/** Location to route with: the item's own, else a department guessed from its name. */
export function effectiveLocation(item: ListItem): ItemLocation {
  if (item.location.kind !== 'unknown') return item.location;
  return { kind: 'department', department: guessDepartment(item.name), source: 'guess' };
}

function isCold(loc: ItemLocation): boolean {
  if (loc.kind === 'department') return COLD_DEPARTMENTS.includes(loc.department);
  return loc.kind === 'aisle' && !!loc.department && COLD_DEPARTMENTS.includes(loc.department);
}

/**
 * Plans the walk: entrance -> every unchecked item -> checkout.
 * With `coldLast`, frozen and dairy are picked up after everything else.
 */
export function planRoute(
  items: ListItem[],
  aisleCount: number,
  opts: { coldLast?: boolean } = {},
): PlannedRoute {
  const todo = items.filter((i) => !i.checked);

  // Make room for any aisle number higher than the store's aisle count.
  const highest = Math.max(
    aisleCount,
    ...todo.map((i) => (i.location.kind === 'aisle' ? parseAisleNumber(i.location.aisle) ?? 0 : 0)),
  );
  const layout = buildGenericLayout(highest);

  // Group items that are picked from the same spot.
  const byCell = new Map<string, RouteStop & { cold: boolean }>();
  for (const item of todo) {
    const loc = effectiveLocation(item);
    const cell = cellForLocation(layout, loc);
    if (!cell) continue;
    const key = `${cell.x},${cell.y}`;
    const stop = byCell.get(key) ?? { cell, items: [], cold: true };
    stop.items.push(item);
    stop.cold = stop.cold && isCold(loc);
    byCell.set(key, stop);
  }
  const all = [...byCell.values()];

  const groups = opts.coldLast ? [all.filter((s) => !s.cold), all.filter((s) => s.cold)] : [all];
  const ordered: RouteStop[] = [];
  let from = layout.entrance;
  groups.forEach((group, gi) => {
    if (!group.length) return;
    // Aim the first group toward where the next one starts, so the hand-off is short.
    const nextGroup = groups.slice(gi + 1).find((g) => g.length);
    const to = nextGroup ? nextGroup[0].cell : layout.checkout;
    const order = orderStops(layout.grid, from, group.map((s) => s.cell), to);
    for (const i of order) ordered.push({ cell: group[i].cell, items: group[i].items });
    from = ordered[ordered.length - 1].cell;
  });

  const { path, distance } = walkPath(layout.grid, [layout.entrance, ...ordered.map((s) => s.cell), layout.checkout]);
  return { layout, stops: ordered, path, distance };
}
