import { Item, Tote } from './types';

/** Seasons and holidays a tote can be tagged with. `month` is 1-12; the reminder counts down to that day. */
export const SEASONS: { name: string; month: number; day: number; icon: string }[] = [
  { name: 'Christmas', month: 12, day: 1, icon: 'gift' },
  { name: 'Halloween', month: 10, day: 1, icon: 'moon' },
  { name: 'Thanksgiving', month: 11, day: 15, icon: 'restaurant' },
  { name: 'Easter', month: 3, day: 20, icon: 'egg' },
  { name: '4th of July', month: 7, day: 1, icon: 'sparkles' },
  { name: 'Summer', month: 6, day: 1, icon: 'sunny' },
  { name: 'Winter', month: 11, day: 15, icon: 'snow' },
  { name: 'Back to school', month: 8, day: 10, icon: 'school' },
  { name: 'Camping', month: 5, day: 15, icon: 'bonfire' },
];

const DAY = 24 * 60 * 60 * 1000;

function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Days until a season next starts (0 = today). Undefined for unknown seasons. */
export function daysUntilSeason(name: string, now = new Date()): number | undefined {
  const s = SEASONS.find((x) => x.name === name);
  if (!s) return undefined;
  const today = startOfToday(now);
  let next = new Date(today.getFullYear(), s.month - 1, s.day);
  if (next < today) next = new Date(today.getFullYear() + 1, s.month - 1, s.day);
  return Math.round((next.getTime() - today.getTime()) / DAY);
}

/** Days from today until a YYYY-MM-DD date; negative once it has passed. */
export function daysUntil(date: string, now = new Date()): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - startOfToday(now).getTime()) / DAY);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addMonths(months: number, now = new Date()): string {
  const d = startOfToday(now);
  d.setMonth(d.getMonth() + months);
  return toISODate(d);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Reads a typed date: "2027-03-15", "3/15/2027", "3/2027", "March 2027", "Mar 15 2027".
 * A month without a day means the end of that month. Returns YYYY-MM-DD or null.
 */
export function parseDate(text: string): string | null {
  const s = text.trim().toLowerCase().replace(/,/g, ' ');
  let y: number | undefined, m: number | undefined, d: number | undefined;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) [m, d, y] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})\/(\d{2,4})$/))) [m, y] = [+r[1], +r[2]];
  else if ((r = s.match(/^([a-z]+)\s+(?:(\d{1,2})\s+)?(\d{4})$/))) {
    const idx = MONTHS.indexOf(r[1].slice(0, 3));
    if (idx < 0) return null;
    m = idx + 1;
    d = r[2] ? +r[2] : undefined;
    y = +r[3];
  } else return null;
  if (y < 100) y += 2000;
  if (!m || m < 1 || m > 12) return null;
  if (d === undefined) d = new Date(y, m, 0).getDate();
  if (d < 1 || d > new Date(y, m, 0).getDate()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function expiryLabel(date: string): string {
  const n = daysUntil(date);
  if (n < 0) return `Expired ${formatDate(date)}`;
  if (n === 0) return 'Expires today';
  if (n < 60) return `Expires in ${n} day${n === 1 ? '' : 's'}`;
  return `Expires ${formatDate(date)}`;
}

/** Reads "$12.50", "12", "1,200" as a dollar amount. */
export function parseMoney(text: string): number | null {
  const n = Number(text.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 ? 2 : 0 });
}

export function toteValue(t: Tote): number {
  return t.items.reduce((sum, i) => sum + (i.value ?? 0) * i.qty, 0);
}

export const EXPIRY_WINDOW_DAYS = 30;
export const SEASON_WINDOW_DAYS = 30;

export type Reminders = {
  seasons: { season: string; days: number; totes: Tote[] }[];
  expiring: { tote: Tote; item: Item; days: number }[];
  out: { tote: Tote; item: Item }[];
};

/** Everything that needs attention: seasons coming up, items expiring soon, and items that are out. */
export function reminders(totes: Tote[], now = new Date()): Reminders {
  const bySeason = new Map<string, Tote[]>();
  for (const t of totes) if (t.season) bySeason.set(t.season, [...(bySeason.get(t.season) ?? []), t]);
  const seasons = [...bySeason.entries()]
    .map(([season, ts]) => ({ season, days: daysUntilSeason(season, now) ?? 999, totes: ts }))
    .filter((s) => s.days <= SEASON_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);
  const expiring: Reminders['expiring'] = [];
  const out: Reminders['out'] = [];
  for (const tote of totes) {
    for (const item of tote.items) {
      if (item.expires) {
        const days = daysUntil(item.expires, now);
        if (days <= EXPIRY_WINDOW_DAYS) expiring.push({ tote, item, days });
      }
      if (item.out) out.push({ tote, item });
    }
  }
  expiring.sort((a, b) => a.days - b.days);
  out.sort((a, b) => a.item.out!.at - b.item.out!.at);
  return { seasons, expiring, out };
}

export function reminderCount(r: Reminders): number {
  return r.seasons.length + r.expiring.length + r.out.length;
}

/** "3 days", "2 weeks", "4 months" since a time. */
export function timeSince(ts: number): string {
  const d = Math.max(0, Math.floor((Date.now() - ts) / DAY));
  if (d < 1) return 'less than a day';
  if (d < 14) return `${d} day${d === 1 ? '' : 's'}`;
  if (d < 60) return `${Math.floor(d / 7)} weeks`;
  return `${Math.floor(d / 30)} months`;
}
