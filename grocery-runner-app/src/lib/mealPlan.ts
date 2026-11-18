// Weekly meal planning: which week to show, picking meals, the week's shopping list and the prep-day
// schedule. Pure logic, no React (the screen is app/(tabs)/plan.tsx, saved state in lib/plan.tsx).
import { guessDepartment } from './departments';
import { matchesFilters } from './diet';
import type { Recipe, RecipeItem } from './recipes';
import { itemKey } from './sharedAisles';

/** Saved plan: the prep weekday (0 = Sunday), meals by date ("2026-11-22"), and the shopper's picks. */
export type MealPlan = {
  prepDay: number;
  meals: Record<string, string[]>;
  /** Filter keys from diet.ts FILTERS that "Plan my week" sticks to. */
  prefs: string[];
  /** How many dinners "Plan my week" fills. */
  perWeek: number;
  /** Prep tasks ticked off, by task id. */
  done: string[];
};

export const EMPTY_PLAN: MealPlan = { prepDay: 0, meals: {}, prefs: [], perWeek: 5, done: [] };

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date as "YYYY-MM-DD". */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * The 7 days of the plan, starting on the prep day. Today's prep day counts as this week's;
 * otherwise the week started on the last prep day (so the meals you're eating now stay visible).
 * `weeksAhead` 1 shows next week.
 */
export function planWeek(prepDay: number, today: Date, weeksAhead = 0): string[] {
  const back = (today.getDay() - prepDay + 7) % 7;
  const start = addDays(today, -back + weeksAhead * 7);
  return Array.from({ length: 7 }, (_, i) => isoDay(addDays(start, i)));
}

const shoppable = (r: Recipe) => r.items.filter((i) => !i.pantry);

/**
 * Fills the plan up to `count` meals with recipes that fit the preferences, preferring ones that
 * reuse ingredients already planned (less to buy, less waste) and skipping recent repeats.
 * `seed` changes the pick between taps of "Shuffle".
 */
export function suggestMeals(
  pool: Recipe[],
  opts: { prefs: string[]; picked: Recipe[]; avoid?: string[]; count: number; seed?: number },
): Recipe[] {
  const out: Recipe[] = [];
  const used = new Set([...opts.picked.map((r) => r.id), ...(opts.avoid ?? [])]);
  const keys = new Set(opts.picked.flatMap((r) => shoppable(r).map((i) => itemKey(i.item))));
  let fits = pool.filter((r) => !used.has(r.id) && matchesFilters(r, opts.prefs) && !r.tags?.includes('breakfast'));
  // Not enough recipes for the preferences: fall back to repeats the shopper hasn't just had, then anything that fits.
  if (fits.length < opts.count - opts.picked.length) {
    const extra = pool.filter((r) => !opts.picked.some((p) => p.id === r.id) && !fits.includes(r) && matchesFilters(r, opts.prefs));
    fits = [...fits, ...extra];
  }
  let seed = (opts.seed ?? 1) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  while (out.length + opts.picked.length < opts.count && fits.length) {
    const scored = fits.map((r) => {
      const items = shoppable(r);
      const shared = items.filter((i) => keys.has(itemKey(i.item))).length;
      return { r, score: shared / Math.max(items.length, 1) + rand() * 0.6 };
    });
    scored.sort((a, b) => b.score - a.score);
    const next = scored[0].r;
    out.push(next);
    fits = fits.filter((r) => r !== next);
    shoppable(next).forEach((i) => keys.add(itemKey(i.item)));
  }
  return out;
}

/** "Yellow onions" and "yellow onion" are the same thing to buy. */
const singular = (name: string) =>
  itemKey(name)
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/ies$/, 'y').replace(/oes$/, 'o').replace(/([^s])s$/, '$1') : w))
    .join(' ');

export type WeekItem = { name: string; amount?: string; meals: string[] };

/** Everything the week's meals need, each thing once, with the amounts from every recipe that uses it. */
export function weekShopping(recipes: Recipe[]): WeekItem[] {
  const byKey = new Map<string, WeekItem & { amounts: string[] }>();
  for (const r of recipes) {
    for (const it of shoppable(r)) {
      const key = singular(it.item);
      if (!key) continue;
      const row = byKey.get(key) ?? { name: it.item, amounts: [], meals: [] };
      if (it.amount) row.amounts.push(it.amount);
      if (!row.meals.includes(r.title)) row.meals.push(r.title);
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].map(({ amounts, ...row }) => ({ ...row, ...(amounts.length ? { amount: amounts.join(' + ') } : {}) }));
}

export type PrepTask = { id: string; title: string; detail: string; icon: string };

const GRAINS = /\b(rice|quinoa|pasta|spaghetti|penne|noodles|orzo|couscous|farro|potato(es)?|sweet potato(es)?|beans|lentils)\b/i;
const SAUCES = /\b(sauce|dressing|marinade|salsa|pesto|vinaigrette)\b/i;
const NOT_CHOPPED = /\b(lettuce mix|spring mix|baby spinach|spinach|berries|strawberries|blueberries|grapes|bananas?)\b/i;

const list = (names: string[]) => {
  const u = [...new Set(names)];
  return u.length <= 2 ? u.join(' and ') : `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
};

/**
 * A prep-day checklist for the week, in a sensible kitchen order: start the long cooks, prep proteins,
 * wash and chop produce for every meal at once, make sauces, then pack each meal with its day.
 */
export function prepSchedule(week: { date: string; recipes: Recipe[] }[]): PrepTask[] {
  const all = week.flatMap((d) => d.recipes);
  if (!all.length) return [];
  const uses = (test: (i: RecipeItem) => boolean) => {
    const found: { item: string; meal: string }[] = [];
    for (const r of all) for (const i of r.items) if (test(i)) found.push({ item: i.item, meal: r.title });
    return found;
  };
  const tasks: PrepTask[] = [];
  const longCooks = all.filter((r) => r.tags?.includes('slow cooker') || (r.minutes ?? 0) >= 60);
  if (longCooks.length)
    tasks.push({ id: 'long', icon: '⏲️', title: 'Start the long cooks first', detail: list(longCooks.map((r) => r.title)) });
  const grains = uses((i) => GRAINS.test(i.item));
  if (grains.length)
    tasks.push({ id: 'grains', icon: '🍚', title: `Cook a batch of ${list(grains.map((g) => g.item.toLowerCase()))}`, detail: `For ${list(grains.map((g) => g.meal))}` });
  const protein = uses((i) => guessDepartment(i.item) === 'meat');
  if (protein.length)
    tasks.push({ id: 'protein', icon: '🥩', title: 'Portion and season the meat', detail: protein.map((p) => `${p.item} (${p.meal})`).join(' · ') });
  const veg = uses((i) => guessDepartment(i.item) === 'produce' && !NOT_CHOPPED.test(i.item));
  if (veg.length)
    tasks.push({ id: 'chop', icon: '🔪', title: `Wash and chop ${list(veg.map((v) => v.item.toLowerCase()))}`, detail: 'Store each meal’s veggies in its own container' });
  const sauces = uses((i) => SAUCES.test(i.item));
  if (sauces.length) tasks.push({ id: 'sauce', icon: '🥣', title: 'Mix sauces and dressings', detail: list(sauces.map((s) => s.item.toLowerCase())) });
  const start = fromIso(week[0].date).getTime();
  for (const d of week) {
    if (!d.recipes.length) continue;
    const day = WEEKDAYS[fromIso(d.date).getDay()];
    // Cooked food keeps about 3-4 days in the fridge; later meals go in the freezer.
    const later = Math.round((fromIso(d.date).getTime() - start) / 86400000) > 3;
    tasks.push({
      id: `pack-${d.date}`,
      icon: later ? '🧊' : '📦',
      title: `Pack ${day}: ${list(d.recipes.map((r) => r.title))}`,
      detail: later ? 'Freeze it; move it to the fridge the night before' : 'Label it and keep it in the fridge',
    });
  }
  return tasks;
}
