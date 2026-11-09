// Learns aisles from the order a shopper checks items off while walking the store. Pure logic.
//
// GPS inside a store is only good to 15-60 ft and aisles are ~10 ft apart, so position alone can't
// name an aisle. Order can: an item checked off between two items known to be in aisle 7 is very
// likely in aisle 7. Rules (see the Route screen for how check-offs are collected):
//   - only check-offs made on the Route screen while the phone is at the store count;
//   - a check-off within BURST_MS of the previous one is ignored (checking off at checkout or home);
//   - a trip where most check-offs were bursts, or MANY_ITEMS+ items in under QUICK_TRIP_MS, is ignored;
//   - an item learns an aisle only when the check-offs right before and right after it, each within
//     NEIGHBOUR_MS, are in the same known aisle.
// The server weighs these at half a vote and needs two shoppers to agree before using one.

export type Checkoff = {
  itemId: string;
  name: string;
  /** Milliseconds since epoch. */
  at: number;
  /** The item's aisle when it was checked off, if one was known. */
  aisle?: string;
  /** Phone was at the store (by GPS) when it was checked off. */
  inStore: boolean;
};

export type Learned = { itemId: string; name: string; aisle: string };

export const BURST_MS = 10_000;
export const NEIGHBOUR_MS = 3 * 60_000;
export const QUICK_TRIP_MS = 2 * 60_000;
export const MANY_ITEMS = 5;

export function learnFromTrip(checkoffs: Checkoff[]): Learned[] {
  const trip = checkoffs.filter((c) => c.inStore).sort((a, b) => a.at - b.at);
  if (trip.length < 3) return [];

  const span = trip[trip.length - 1].at - trip[0].at;
  if (trip.length >= MANY_ITEMS && span < QUICK_TRIP_MS) return [];

  const burst = trip.map((c, i) => i > 0 && c.at - trip[i - 1].at < BURST_MS);
  if (burst.filter(Boolean).length > trip.length / 2) return [];

  const steady = trip.filter((_, i) => !burst[i]);
  const norm = (a?: string) => a?.trim().toUpperCase() || undefined;
  const out: Learned[] = [];
  for (let i = 1; i < steady.length - 1; i++) {
    const prev = steady[i - 1];
    const cur = steady[i];
    const next = steady[i + 1];
    if (norm(cur.aisle)) continue; // already known
    const a = norm(prev.aisle);
    if (!a || a !== norm(next.aisle)) continue;
    if (cur.at - prev.at > NEIGHBOUR_MS || next.at - cur.at > NEIGHBOUR_MS) continue;
    out.push({ itemId: cur.itemId, name: cur.name, aisle: a });
  }
  return out;
}
