// Groups the shopping list into store sections for the list screen. Pure logic, no React.
import { DEPARTMENT_LABEL, DEPARTMENT_ORDER } from './departments';
import { parseAisleNumber } from './routing/layout';
import { effectiveLocation } from './routing/planRoute';
import { Department, ListItem } from './types';

export type ListSection = { key: string; title: string; data: ListItem[] };

// Fresh departments first, then numbered aisles, then the rest in walk order (cold last).
const BEFORE_AISLES: Department[] = ['produce', 'bakery', 'deli', 'meat'];

/**
 * Items still to get, by section: departments in walk order with numbered aisles in the middle
 * ("Aisle 3" before "Aisle 12"), then everything already checked off at the bottom.
 */
export function groupList(items: ListItem[]): ListSection[] {
  const sections = new Map<string, ListSection & { rank: number }>();
  const add = (key: string, title: string, rank: number, item: ListItem) => {
    const s = sections.get(key) ?? { key, title, rank, data: [] };
    s.data.push(item);
    sections.set(key, s);
  };
  for (const item of items) {
    if (item.checked) continue;
    const loc = effectiveLocation(item);
    if (loc.kind === 'aisle') {
      const n = parseAisleNumber(loc.aisle);
      const title = /^\d+$/.test(loc.aisle) ? `Aisle ${loc.aisle}` : loc.aisle;
      add(`aisle:${loc.aisle.toUpperCase()}`, title, 100 + (n ?? 999) + (/^\d+$/.test(loc.aisle) ? 0 : 0.5), item);
    } else if (loc.kind === 'department') {
      const d = loc.department;
      const rank = BEFORE_AISLES.includes(d) ? DEPARTMENT_ORDER.indexOf(d) : 2000 + DEPARTMENT_ORDER.indexOf(d);
      add(`dept:${d}`, DEPARTMENT_LABEL[d], rank, item);
    }
  }
  const out: ListSection[] = [...sections.values()]
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    .map(({ key, title, data }) => ({ key, title, data }));
  const done = items.filter((i) => i.checked);
  if (done.length) out.push({ key: 'checked', title: 'Checked off', data: done });
  return out;
}
