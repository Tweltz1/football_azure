// Diet labels worked out from a recipe's ingredients, so scanned and linked recipes get them too.
// These are a guide, not a guarantee: packaged foods (broth, sausage, seasoning mixes) vary by brand.
import { properNouns } from './caps';
import type { Recipe, RecipeTag } from './recipes';

export type Diet = 'gluten-free' | 'dairy-free' | 'vegetarian' | 'vegan' | 'pescatarian' | 'nut-free' | 'egg-free';

/** Meats and proteins a shopper can leave out of their meal plan ("no fish", "no chicken"). */
export type Protein = 'beef' | 'pork' | 'chicken' | 'turkey' | 'fish' | 'shellfish';

const has = (name: string, words: RegExp) => words.test(name.toLowerCase());

// "Safe" look-alikes are checked first: corn tortillas, coconut milk, peanut butter and so on.
const GLUTEN_OK = /\b(corn tortillas?|corn taco shells?|tortilla chips|rice noodles|gluten[- ]free|tamari|cornstarch|corn ?meal|buckwheat|oats? milk)\b/;
const GLUTEN =
  /\b(flour|bread|breadcrumbs|panko|buns?|rolls?|tortillas?|taco shells?|pasta|spaghetti|fettuccine|linguine|penne|macaroni|lasagna|noodles|couscous|barley|bulgur|farro|soy sauce|teriyaki|hoisin|croutons|crackers|pancake mix|biscuit|pizza dough|pie crust|bagels?|croissants?|english muffins?|beer|seitan|cream of|soup mix|gravy|caesar dressing|pretzels?|cereal|oats?)\b/;
const DAIRY_OK = /\b(coconut milk|coconut cream|almond milk|oat milk|soy milk|peanut butter|almond butter|cream of tartar|dairy[- ]free|vegan)\b/;
const DAIRY =
  /\b(milk|cheese|cheddar|mozzarella|parmesan|ricotta|feta|cotija|queso|butter|buttermilk|cream|half and half|yogurt|ghee|whey|alfredo|caesar dressing|ranch|garlic bread|pancake mix|pesto)\b/;
const VEG_BROTH = /\b((vegetable|veggie|mushroom) (broth|stock))\b/;
// Broth and stock with no animal named are usually chicken or beef.
const ANY_MEAT = /\b(lamb|veal|duck|venison|bison|goat|gelatin|broth|stock)\b/;
const NOT_PORK = /\b(chicken|turkey|beef|veggie|plant[- ]based) (sausage|bacon|hot dogs?|pepperoni)\b/;

const PROTEINS: Record<Protein, { bad: RegExp; ok?: RegExp }> = {
  beef: { bad: /\b(beef|steak|chuck roast|pot roast|rump roast|brisket|sirloin|ribeye|meatballs?|pepperoni|hot dogs?|corned|pastrami)\b/, ok: /\b(turkey|chicken|plant[- ]based|veggie) (meatballs?|pepperoni|hot dogs?)\b/ },
  pork: { bad: /\b(pork|bacon|ham|sausages?|pepperoni|salami|prosciutto|pancetta|chorizo|bratwurst|hot dogs?|lard)\b/, ok: NOT_PORK },
  chicken: { bad: /\bchicken\b/ },
  turkey: { bad: /\bturkey\b/ },
  fish: { bad: /\b(fish|salmon|tuna|cod|tilapia|halibut|trout|mahi|catfish|sardines?|anchov(y|ies)|caesar dressing|worcestershire)\b/ },
  shellfish: { bad: /\b(shrimp|prawns?|crab|lobster|scallops?|clams?|mussels|oysters?|crawfish)\b/ },
};
// Peanuts and tree nuts. Coconut, nutmeg and butternut squash aren't nuts here.
const NUTS =
  /\b(nuts?|peanuts?|peanut butter|almonds?|almond (milk|butter|flour)|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|pine nuts|pesto|praline|nutella|marzipan)\b/;
const NUTS_OK = /\b(nutmeg|butternut|coconut|water chestnuts?|nut[- ]free)\b/;
const EGGS = /\b(eggs?|mayonnaise|mayo|egg noodles|meringue|aioli|caesar dressing|pancake mix)\b/;
const EGGS_OK = /\b(eggplants?|egg[- ]free|vegan mayo)\b/;
const NOT_VEGAN = /\b(honey|gelatin)\b/;

const contains = (name: string, bad: RegExp, ok?: RegExp) => {
  const n = name.toLowerCase();
  return has(ok ? n.replace(new RegExp(ok.source, 'g'), ' ') : n, bad);
};

/** Does this ingredient have this meat or protein in it? */
export const hasProtein = (name: string, p: Protein) => contains(name, PROTEINS[p].bad, PROTEINS[p].ok);
const isLandMeat = (n: string) =>
  hasProtein(n, 'beef') || hasProtein(n, 'pork') || hasProtein(n, 'chicken') || hasProtein(n, 'turkey') || contains(n, ANY_MEAT, VEG_BROTH);
const isSeafood = (n: string) => hasProtein(n, 'fish') || hasProtein(n, 'shellfish');

/** Diet labels that every item in the list fits. Pantry staples count too (flour, butter). */
export function dietsOf(items: { item: string }[]): Diet[] {
  const names = items.map((i) => i.item);
  if (!names.length) return [];
  const out: Diet[] = [];
  const none = (test: (n: string) => boolean) => !names.some(test);
  if (none((n) => contains(n, GLUTEN, GLUTEN_OK))) out.push('gluten-free');
  const dairyFree = none((n) => contains(n, DAIRY, DAIRY_OK));
  if (dairyFree) out.push('dairy-free');
  const noLandMeat = none(isLandMeat);
  const vegetarian = noLandMeat && none(isSeafood);
  if (vegetarian) out.push('vegetarian');
  const eggFree = none((n) => contains(n, EGGS, EGGS_OK));
  if (vegetarian && dairyFree && eggFree && none((n) => contains(n, NOT_VEGAN))) out.push('vegan');
  if (noLandMeat) out.push('pescatarian');
  if (none((n) => contains(n, NUTS, NUTS_OK))) out.push('nut-free');
  if (eggFree) out.push('egg-free');
  return out;
}

/** Which of these meats and proteins the recipe has, e.g. ['chicken']. */
export function proteinsOf(items: { item: string }[]): Protein[] {
  return (Object.keys(PROTEINS) as Protein[]).filter((p) => items.some((i) => hasProtein(i.item, p)));
}

export type Filter = { key: string; label: string; test: (r: Recipe, diets: Diet[]) => boolean };

const tagged = (tag: RecipeTag) => (r: Recipe) => !!r.tags?.includes(tag);

const diet = (key: Diet, label: string): Filter => ({ key, label, test: (_, d) => d.includes(key) });
const without = (p: Protein, label: string): Filter => ({ key: `no-${p}`, label, test: (r) => !r.items.some((i) => hasProtein(i.item, p)) });

/** Every filter a recipe can be checked against. A recipe must match every one that is on. */
export const FILTERS: Filter[] = [
  { key: 'quick', label: 'Quick (30 min)', test: (r) => !!r.minutes && r.minutes <= 30 },
  { key: 'healthy', label: 'Healthy', test: tagged('healthy') },
  { key: 'family', label: 'Family', test: tagged('family') },
  diet('vegetarian', 'Vegetarian'),
  diet('vegan', 'Vegan'),
  diet('pescatarian', 'Pescatarian'),
  diet('gluten-free', 'Gluten-free'),
  diet('dairy-free', 'Dairy-free'),
  diet('nut-free', 'Nut-free'),
  diet('egg-free', 'Egg-free'),
  without('beef', 'No beef'),
  without('pork', 'No pork'),
  without('chicken', 'No chicken'),
  without('turkey', 'No turkey'),
  without('fish', 'No fish'),
  without('shellfish', 'No shellfish'),
  { key: 'one pot', label: 'One pot', test: tagged('one pot') },
  { key: 'slow cooker', label: 'Slow cooker', test: tagged('slow cooker') },
  { key: 'grill', label: 'Grill', test: tagged('grill') },
  { key: 'breakfast', label: 'Breakfast', test: tagged('breakfast') },
];

export const labelOf = (key: string) => FILTERS.find((f) => f.key === key)?.label ?? key;

/** The chips across the top of the Recipes screen (the "No beef" kind live in the meal plan's preferences). */
export const RECIPE_CHIPS = ['quick', 'healthy', 'family', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'one pot', 'slow cooker', 'grill', 'breakfast'];

/** The meal plan's preference groups. "Diet" and "Leave out" are rules; "We like" is taste. */
export const PREF_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Diet', keys: ['vegetarian', 'vegan', 'pescatarian'] },
  { title: 'Allergies and intolerances', keys: ['gluten-free', 'dairy-free', 'nut-free', 'egg-free'] },
  { title: 'Leave out', keys: ['no-beef', 'no-pork', 'no-chicken', 'no-turkey', 'no-fish', 'no-shellfish'] },
  { title: 'We like', keys: ['quick', 'healthy', 'family', 'one pot', 'slow cooker'] },
];

/** Preference keys that are about what a recipe may contain (diets, allergies, meats left out), not taste. */
export const RULE_KEYS = PREF_GROUPS.slice(0, 3).flatMap((g) => g.keys);
export const rulesOf = (prefs: string[]) => prefs.filter((k) => RULE_KEYS.includes(k));

export function matchesFilters(r: Recipe, on: string[]): boolean {
  if (!on.length) return true;
  const diets = dietsOf(r.items);
  return FILTERS.filter((f) => on.includes(f.key)).every((f) => f.test(r, diets));
}

/**
 * Why a recipe breaks the shopper's diet rules, e.g. ["chicken broth (no chicken)"]. Empty when it fits.
 * Taste preferences like "Quick" are ignored.
 */
export function conflictsOf(r: Recipe, prefs: string[]): string[] {
  const out: string[] = [];
  const diets = dietsOf(r.items);
  for (const key of rulesOf(prefs)) {
    const f = FILTERS.find((x) => x.key === key);
    if (!f || f.test(r, diets)) continue;
    // Name the ingredient that breaks the rule, when one does on its own.
    const culprit = r.items.find((i) => !f.test({ ...r, items: [i] }, dietsOf([i])));
    out.push(culprit ? `${properNouns(culprit.item.toLowerCase())} (${labelOf(key).toLowerCase()})` : labelOf(key).toLowerCase());
  }
  return out;
}

/** Short labels for a recipe card, diet first. Vegan says it all, so it hides vegetarian and dairy-free. */
export function labelsOf(r: Recipe): string[] {
  const diets = dietsOf(r.items);
  const shown = (['vegan', 'vegetarian', 'gluten-free', 'dairy-free'] as Diet[]).filter(
    (d) => diets.includes(d) && !(diets.includes('vegan') && (d === 'vegetarian' || d === 'dairy-free')),
  );
  return [...shown.map(labelOf), ...(r.tags ?? []).map(labelOf)];
}

/** "vegetarian, gluten-free and no fish", for sentences. */
export function describePrefs(prefs: string[]): string {
  const words = prefs.map((k) => labelOf(k).toLowerCase().replace(/ \(30 min\)/, ''));
  return words.length <= 2 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
