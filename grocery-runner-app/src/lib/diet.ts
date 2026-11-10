// Diet labels worked out from a recipe's ingredients, so scanned and linked recipes get them too.
// These are a guide, not a guarantee: packaged foods (broth, sausage, seasoning mixes) vary by brand.
import type { Recipe, RecipeTag } from './recipes';

export type Diet = 'gluten-free' | 'dairy-free' | 'vegetarian';

const has = (name: string, words: RegExp) => words.test(name.toLowerCase());

// "Safe" look-alikes are checked first: corn tortillas, coconut milk, peanut butter and so on.
const GLUTEN_OK = /\b(corn tortillas?|corn taco shells?|tortilla chips|rice noodles|gluten[- ]free|tamari|cornstarch|corn ?meal|buckwheat|oats? milk)\b/;
const GLUTEN =
  /\b(flour|bread|breadcrumbs|panko|buns?|rolls?|tortillas?|taco shells?|pasta|spaghetti|fettuccine|linguine|penne|macaroni|lasagna|noodles|couscous|barley|bulgur|farro|soy sauce|teriyaki|hoisin|croutons|crackers|pancake mix|biscuit|pizza dough|pie crust|bagels?|croissants?|english muffins?|beer|seitan|cream of|soup mix|gravy|caesar dressing|pretzels?|cereal|oats?)\b/;
const DAIRY_OK = /\b(coconut milk|coconut cream|almond milk|oat milk|soy milk|peanut butter|almond butter|cream of tartar|dairy[- ]free|vegan)\b/;
const DAIRY =
  /\b(milk|cheese|cheddar|mozzarella|parmesan|ricotta|feta|cotija|queso|butter|buttermilk|cream|half and half|yogurt|ghee|whey|alfredo|caesar dressing|ranch|garlic bread|pancake mix|pesto)\b/;
const MEAT =
  /\b(beef|steak|chuck|roast|brisket|pork|bacon|ham|sausage|pepperoni|salami|prosciutto|chicken|turkey|duck|lamb|veal|salmon|tuna|cod|tilapia|fish|shrimp|prawns?|crab|lobster|scallops?|clams?|mussels|anchov(y|ies)|gelatin|broth|stock|caesar dressing|worcestershire)\b/;
const VEG_BROTH = /\b(vegetable (broth|stock))\b/;

const contains = (name: string, bad: RegExp, ok: RegExp) => {
  const n = name.toLowerCase();
  return has(n.replace(ok, ' '), bad);
};

/** Diet labels that every item in the list fits. Pantry staples count too (flour, butter). */
export function dietsOf(items: { item: string }[]): Diet[] {
  const names = items.map((i) => i.item);
  if (!names.length) return [];
  const out: Diet[] = [];
  if (!names.some((n) => contains(n, GLUTEN, GLUTEN_OK))) out.push('gluten-free');
  if (!names.some((n) => contains(n, DAIRY, DAIRY_OK))) out.push('dairy-free');
  if (!names.some((n) => contains(n, MEAT, VEG_BROTH))) out.push('vegetarian');
  return out;
}

export type Filter = { key: string; label: string; test: (r: Recipe, diets: Diet[]) => boolean };

const tagged = (tag: RecipeTag) => (r: Recipe) => !!r.tags?.includes(tag);

/** The filter chips on the Recipes screen. A recipe must match every chip that is on. */
export const FILTERS: Filter[] = [
  { key: 'quick', label: 'Quick (30 min)', test: (r) => !!r.minutes && r.minutes <= 30 },
  { key: 'healthy', label: 'Healthy', test: tagged('healthy') },
  { key: 'family', label: 'Family', test: tagged('family') },
  { key: 'vegetarian', label: 'Vegetarian', test: (_, d) => d.includes('vegetarian') },
  { key: 'gluten-free', label: 'Gluten-free', test: (_, d) => d.includes('gluten-free') },
  { key: 'dairy-free', label: 'Dairy-free', test: (_, d) => d.includes('dairy-free') },
  { key: 'one pot', label: 'One pot', test: tagged('one pot') },
  { key: 'slow cooker', label: 'Slow cooker', test: tagged('slow cooker') },
  { key: 'grill', label: 'Grill', test: tagged('grill') },
  { key: 'breakfast', label: 'Breakfast', test: tagged('breakfast') },
];

export function matchesFilters(r: Recipe, on: string[]): boolean {
  if (!on.length) return true;
  const diets = dietsOf(r.items);
  return FILTERS.filter((f) => on.includes(f.key)).every((f) => f.test(r, diets));
}

/** Short labels for a recipe card, diet first. */
export function labelsOf(r: Recipe): string[] {
  const diets = dietsOf(r.items);
  return [
    ...diets.map((d) => FILTERS.find((f) => f.key === d)!.label),
    ...(r.tags ?? []).map((t) => FILTERS.find((f) => f.key === t)?.label ?? t),
  ];
}
