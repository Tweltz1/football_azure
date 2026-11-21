// The built-in recipe library: recipes from big recipe sites' collection pages, preloaded so there is
// plenty to pick from. Only facts are kept (title, servings, time, ingredients); the steps and photos
// are the site's own and stay there, so each recipe links to its source page instead.
import { titleCase } from './caps';
import { LIBRARY_DATA } from './libraryData';
import type { Recipe, RecipeTag } from './recipes';

/** One generated row: items are [item, amount, pantry (1/0), note?]. */
export type LibraryRow = {
  id: string;
  title: string;
  servings: string;
  minutes?: number;
  url: string;
  tags: string[];
  items: [string, string, 0 | 1, string?][];
};

// A picture for the card from the dish's name, first match wins.
const EMOJI: [RegExp, string][] = [
  [/overnight oats|oatmeal|porridge|granola|muesli/i, '🥣'],
  [/pancake|waffle|french toast|crepe/i, '🥞'],
  [/egg|frittata|omelet|shakshuka|quiche/i, '🍳'],
  [/smoothie|shake/i, '🥤'],
  [/muffin|scone|bread|toast|bagel/i, '🍞'],
  [/taco|burrito|quesadilla|enchilada|fajita|nacho/i, '🌮'],
  [/pizza|flatbread/i, '🍕'],
  [/burger|sloppy/i, '🍔'],
  [/sandwich|wrap|panini|melt/i, '🥪'],
  [/soup|stew|chowder|chili|bisque|gumbo|pho|ramen/i, '🍲'],
  [/curry|dal|dhal|masala|korma/i, '🍛'],
  [/pasta|spaghetti|penne|linguine|fettuccine|lasagna|mac|noodle|orzo|gnocchi|ziti|rigatoni|bucatini|orecchiette/i, '🍝'],
  [/rice|risotto|paella|bowl/i, '🍚'],
  [/stir[- ]?fry|lo mein|fried rice|teriyaki/i, '🥡'],
  [/salmon|cod|fish|tuna|halibut|tilapia|trout/i, '🐟'],
  [/shrimp|prawn|scallop|crab|lobster|clam|mussel/i, '🍤'],
  [/chicken|turkey/i, '🍗'],
  [/steak|beef|meatball|meatloaf|brisket|short rib|pot roast/i, '🥩'],
  [/pork|ham|bacon|sausage|chorizo/i, '🥓'],
  [/salad|slaw/i, '🥗'],
  [/potato|fries/i, '🥔'],
  [/cauliflower|broccoli|kale|spinach|zucchini|squash|eggplant|vegetable|veggie|mushroom/i, '🥦'],
  [/bean|lentil|chickpea|tofu|tempeh/i, '🫘'],
  [/pie|cake|cookie|brownie|crumble|cobbler|pudding/i, '🍰'],
];
const emojiFor = (title: string) => EMOJI.find(([re]) => re.test(title))?.[1] ?? '🍽️';

const TAGS: RecipeTag[] = ['healthy', 'family', 'one pot', 'slow cooker', 'breakfast', 'grill'];

export const LIBRARY: Recipe[] = LIBRARY_DATA.map((r) => ({
  id: r.id,
  title: titleCase(r.title),
  servings: r.servings,
  ...(r.minutes ? { minutes: r.minutes } : {}),
  emoji: emojiFor(r.title),
  tags: [
    ...r.tags.filter((t): t is RecipeTag => (TAGS as string[]).includes(t)),
    ...(/slow cooker|crock ?pot/i.test(r.title) ? (['slow cooker'] as RecipeTag[]) : []),
    ...(/one[- ]pot|one[- ]pan|sheet[- ]pan|skillet/i.test(r.title) ? (['one pot'] as RecipeTag[]) : []),
    ...(/grill/i.test(r.title) ? (['grill'] as RecipeTag[]) : []),
  ].filter((t, i, all) => all.indexOf(t) === i),
  url: r.url,
  items: r.items.map(([item, amount, pantry, note]) => ({ item, amount, pantry: pantry === 1, ...(note ? { note } : {}) })),
  source: 'suggested' as const,
}));

/** "Food Network" for a foodnetwork.com address: the site the steps are on. */
export function siteName(url: string): string {
  const host = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const known: Record<string, string> = {
    'foodnetwork.com': 'Food Network',
    'heraldsun.com.au': 'delicious.',
    'delicious.com.au': 'delicious.',
    '101cookbooks.com': '101 Cookbooks',
    'bbcgoodfood.com': 'BBC Good Food',
    'loveandlemons.com': 'Love & Lemons',
  };
  return known[host] ?? host;
}
