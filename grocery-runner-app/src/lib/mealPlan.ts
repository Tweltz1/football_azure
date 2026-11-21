// Weekly meal planning: which week to show, picking meals, the week's shopping list and the prep-day
// schedule. Pure logic, no React (the screen is app/(tabs)/plan.tsx, saved state in lib/plan.tsx).
import { capFirst, properNouns, titleCase } from './caps';
import { addAmounts } from './scale';
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
  /** Recipes "Plan my week" suggested lately, newest last, so the next tap (even after Clear) picks others. */
  recent?: string[];
  /** How many times "Plan my week" has run: the shuffle's seed, saved so a relaunch doesn't repeat a pick. */
  fills?: number;
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

/** A small seeded random number maker (mulberry32): nearby seeds give unrelated numbers. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/**
 * Fills the plan up to `count` meals with recipes that fit the preferences, preferring ones that
 * reuse ingredients already planned (less to buy, less waste). Recipes in `avoid` (last week's meals and
 * the ones suggested lately) only come back when nothing else fits. `seed` changes the pick on every tap.
 */
export function suggestMeals(
  pool: Recipe[],
  opts: { prefs: string[]; picked: Recipe[]; avoid?: string[]; count: number; seed?: number },
): Recipe[] {
  const out: Recipe[] = [];
  const avoid = new Set(opts.avoid ?? []);
  const keys = new Set(opts.picked.flatMap((r) => shoppable(r).map((i) => itemKey(i.item))));
  const seen = new Set<string>();
  let fits = pool.filter((r) => {
    // Your own copy of a recipe and ours can share an id; plan each only once.
    if (seen.has(r.id) || opts.picked.some((p) => p.id === r.id)) return false;
    seen.add(r.id);
    return matchesFilters(r, opts.prefs) && !r.tags?.includes('breakfast');
  });
  const rand = seededRandom(opts.seed ?? 1);
  // Each recipe gets one random draw per fill, so the order really changes between taps.
  const luck = new Map(fits.map((r) => [r.id, rand()]));
  while (out.length + opts.picked.length < opts.count && fits.length) {
    const scored = fits.map((r) => {
      const items = shoppable(r);
      const shared = items.filter((i) => keys.has(itemKey(i.item))).length;
      return { r, score: shared / Math.max(items.length, 1) * 0.5 + luck.get(r.id)! - (avoid.has(r.id) ? 2 : 0) };
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

/**
 * `lines` break a long task down so it reads as a short list: one line per ingredient ("Yellow onion × 3 ·
 * dice", "Chili, Curry and Lentil soup") so each thing is prepped once for every meal that uses it.
 */
export type PrepTask = { id: string; title: string; detail: string; icon: string; lines?: { label: string; text: string }[] };

const RICE = /^(white |jasmine |basmati |long grain |brown )?rice$/i;
const GRAINS = /\b(rice|quinoa|pasta|spaghetti|penne|noodles|orzo|couscous|farro|potato(es)?|sweet potato(es)?|lentils)\b/i;
// Canned or cooked-from-dry beans don't need a batch cook; dry lentils do.
const GROUND = /\bground (beef|turkey|pork|chicken|sausage)\b/i;
const FRESH = /\b(lettuce|romaine|salad|spring mix|avocados?|cucumber)\b/i;
const SAUCES = /\b(sauce|dressing|marinade|vinaigrette|tahini)\b/i;
const JARRED = /\b(jar|bottle|can)\b/i;
const NOT_CHOPPED = /\b(lettuce mix|spring mix|salad mix|bagged salad|coleslaw mix|baby spinach|spinach|berries|strawberries|blueberries|grapes|bananas?|frozen)\b/i;
// How each kind of produce is usually prepped, so the line says what to do.
const PREP_VERBS: [RegExp, string][] = [
  // Green onions before plain onions.
  [/\bgreen onions?\b|\bscallions?\b/i, 'slice'],
  [/\bonions?\b|\bshallots?\b/i, 'dice'],
  [/\bgarlic\b/i, 'mince'],
  [/\bginger\b/i, 'grate'],
  [/\b(cilantro|parsley|basil|thyme|rosemary|dill|mint)\b/i, 'wash and chop'],
  [/\b(lemons?|limes?)\b/i, 'cut into wedges'],
  [/\b(broccoli|cauliflower)\b/i, 'cut into florets'],
  [/\b(potato(es)?|sweet potato(es)?)\b/i, 'cube'],
  [/\b(lettuce|romaine|kale|cabbage)\b/i, 'wash, dry and chop'],
  [/\b(avocados?)\b/i, 'slice just before eating'],
  [/\b(tomato(es)?|cherry tomatoes)\b/i, 'chop'],
  [/\b(asparagus|green beans|snap peas)\b/i, 'trim'],
];
const verbFor = (name: string) => PREP_VERBS.find(([re]) => re.test(name))?.[1] ?? 'chop';

const list = (names: string[]) => {
  const u = [...new Set(names)];
  return u.length <= 2 ? u.join(' and ') : `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
};

type Use = { item: string; amount: string; note?: string; meal: string };

/** The same ingredient across meals, once: name, all the amounts added up, and which meals use it. */
function combine(found: Use[], family: (name: string) => string | null = () => null) {
  const byKey = new Map<string, { name: string; amounts: string[]; meals: string[]; notes: string[] }>();
  for (const f of found) {
    const fam = family(f.item);
    const key = fam ?? singular(f.item);
    const row = byKey.get(key) ?? { name: fam ?? f.item, amounts: [], meals: [], notes: [] };
    row.amounts.push(f.amount);
    if (!row.meals.includes(f.meal)) row.meals.push(f.meal);
    if (f.note) row.notes.push(f.note);
    byKey.set(key, row);
  }
  // Things used in the most meals first: those save the most work.
  return [...byKey.values()]
    .map((r) => ({ ...r, amount: addAmounts(r.amounts), meals: r.meals.map(titleCase) }))
    .sort((a, b) => b.meals.length - a.meals.length);
}
const named = (name: string, amount: string) => capFirst(amount && /\d/.test(amount) ? `${name}, ${amount}` : name);

/**
 * A prep-day checklist for the week, in an efficient kitchen order: start the long cooks, get one batch of
 * each grain going, prep each meat once (splitting it between meals), chop each vegetable once for every meal
 * that uses it, make the sauces, then pack each meal with its day. It works from ingredients alone, so
 * recipes imported from a link without steps get a plan too.
 */
export function prepSchedule(week: { date: string; recipes: Recipe[] }[]): PrepTask[] {
  const all = week.flatMap((d) => d.recipes);
  if (!all.length) return [];
  const uses = (test: (i: RecipeItem) => boolean): Use[] => {
    const found: Use[] = [];
    for (const r of all) for (const i of r.items) if (test(i)) found.push({ item: i.item.toLowerCase(), amount: i.amount, note: i.note, meal: r.title });
    return found;
  };
  const tasks: PrepTask[] = [];
  const longCooks = all.filter((r) => r.tags?.includes('slow cooker') || (r.minutes ?? 0) >= 60);
  if (longCooks.length)
    tasks.push({ id: 'long', icon: '⏲️', title: 'Start the long cooks first', detail: `${list(longCooks.map((r) => titleCase(r.title)))}. They cook while you do the rest.` });

  // Jasmine, basmati and long grain rice cook the same way: one pot does every meal.
  const riceKinds = uses((i) => RICE.test(i.item) && !JARRED.test(i.amount));
  const grains = combine(uses((i) => GRAINS.test(i.item) && !JARRED.test(i.amount)), (n) =>
    RICE.test(n) && new Set(riceKinds.map((r) => r.item)).size > 1 ? 'rice' : null,
  );
  if (grains.length)
    tasks.push({
      id: 'grains',
      icon: '🍚',
      title: grains.length === 1 ? properNouns(`Cook one batch of ${grains[0].name}`) : 'Get the grains going, one pot of each',
      detail: [
        new Set(riceKinds.map((r) => r.item)).size > 1
          ? `The recipes call for ${list([...new Set(riceKinds.map((r) => r.item))])}; any one works for all of them`
          : '',
        grains.some((g) => g.meals.length > 1) ? 'Cook it all at once and split it between the meals' : 'It simmers while you prep the rest',
      ]
        .filter(Boolean)
        .join('. '),
      lines: grains.map((g) => ({ label: named(g.name, g.amount), text: list(g.meals) })),
    });

  const protein = combine(uses((i) => guessDepartment(i.item) === 'meat'));
  if (protein.length) {
    // Ground meat browns the same for tacos, chili or sauce, so it cooks once; other cuts are portioned raw.
    const ground = protein.filter((p) => p.meals.length > 1 && GROUND.test(p.name));
    const shared = protein.filter((p) => p.meals.length > 1 && !GROUND.test(p.name));
    tasks.push({
      id: 'protein',
      icon: '🥩',
      title: ground.length || shared.length ? 'Prep each meat once for every meal' : 'Portion and season the meat',
      detail: [
        ground.length ? `Brown all the ${list(ground.map((p) => p.name))} in one pan, then split it` : '',
        shared.length ? `Trim all the ${list(shared.map((p) => p.name))} at once, then season each meal’s portion its own way` : '',
        'Bag each meal’s portion',
      ]
        .filter(Boolean)
        .join('. '),
      lines: protein.map((p) => ({ label: named(p.name, p.amount), text: p.meals.length > 1 ? `split: ${list(p.meals)}` : list(p.meals) })),
    });
  }

  const veg = combine(uses((i) => guessDepartment(i.item) === 'produce' && !NOT_CHOPPED.test(i.item)));
  if (veg.length) {
    const reused = veg.filter((v) => v.meals.length > 1).length;
    tasks.push({
      id: 'chop',
      icon: '🔪',
      title: reused ? `Chop each vegetable once (${reused} go in more than one meal)` : 'Wash and chop the produce',
      detail: 'Do each one for every meal at once, then store it by meal in its own container',
      lines: veg.map((v) => ({
        label: `${named(v.name, v.amount)} · ${v.notes[0]?.match(/^[a-z ,]+/i)?.[0].trim().toLowerCase() || verbFor(v.name)}`,
        text: list(v.meals),
      })),
    });
  }

  // Only sauces you mix; a jar or bottle goes in as is.
  const sauces = combine(uses((i) => SAUCES.test(i.item) && !JARRED.test(i.amount)));
  if (sauces.length)
    tasks.push({
      id: 'sauce',
      icon: '🥣',
      title: 'Mix sauces and dressings',
      detail: 'Keep them in small jars',
      lines: sauces.map((s) => ({ label: named(s.name, s.amount), text: list(s.meals) })),
    });

  const start = fromIso(week[0].date).getTime();
  for (const d of week) {
    if (!d.recipes.length) continue;
    const day = WEEKDAYS[fromIso(d.date).getDay()];
    // Cooked food keeps about 3-4 days in the fridge; later meals go in the freezer.
    const later = Math.round((fromIso(d.date).getTime() - start) / 86400000) > 3;
    // Salads and fresh toppings don't freeze: keep the prepped parts cold and put it together that day.
    const fresh = d.recipes.some((r) => r.items.some((i) => FRESH.test(i.item)));
    tasks.push({
      id: `pack-${d.date}`,
      icon: later && !fresh ? '🧊' : '📦',
      title: `Pack ${day}: ${list(d.recipes.map((r) => titleCase(r.title)))}`,
      detail: !later
        ? 'Label it and keep it in the fridge'
        : fresh
          ? 'Freeze anything cooked; keep the greens and toppings in the fridge and put it together that day'
          : 'Freeze it; move it to the fridge the night before',
    });
  }
  return tasks;
}
