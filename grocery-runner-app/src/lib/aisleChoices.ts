// "Which aisle?" choices after a guessed item is checked off on the Route screen. Pure logic.
import { parseAisleNumber } from './routing/layout';
import { ListItem } from './types';

/** True when the item's place is only the app's guess (no aisle from the shopper, the store or other shoppers). */
export function needsAisle(item: ListItem): boolean {
  const loc = item.location;
  if (loc.kind === 'unknown') return true;
  if (loc.kind === 'department') return loc.source === 'guess' || loc.source === 'kroger';
  return loc.source === 'guess';
}

/**
 * Likely aisles for the item at `stopIndex` of the walk: the known aisles of the stops just before and
 * after it, each with its neighbours, nearest stops first. At most `max`, in aisle order.
 */
export function aisleChoices(stops: { items: ListItem[] }[], stopIndex: number, max = 5): string[] {
  const known = (s: { items: ListItem[] } | undefined): number[] =>
    (s?.items ?? []).flatMap((i) =>
      i.location.kind === 'aisle' && i.location.source !== 'guess' ? [parseAisleNumber(i.location.aisle) ?? -1] : [],
    ).filter((n) => n > 0);
  const picked: number[] = [];
  const add = (n: number) => {
    if (n > 0 && !picked.includes(n) && picked.length < max) picked.push(n);
  };
  const anchors: number[] = [];
  for (let d = 1; d <= 3 && anchors.length < 2; d++) {
    for (const s of [stops[stopIndex - d], stops[stopIndex + d]]) {
      const n = known(s)[0];
      if (n && !anchors.includes(n)) anchors.push(n);
    }
  }
  for (const a of anchors) add(a);
  if (anchors.length === 2) {
    const [lo, hi] = [Math.min(...anchors), Math.max(...anchors)];
    for (let n = lo + 1; n < hi; n++) add(n);
  }
  for (const a of anchors) {
    add(a - 1);
    add(a + 1);
  }
  return picked.sort((x, y) => x - y).map(String);
}
