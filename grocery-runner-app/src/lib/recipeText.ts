// Turns recipe text (from a photo, a web page or a paste) into shopping items, entirely on the phone.
// No AI service: rules for quantities, units and preparation words, like Talk Shops' price sheet reader.
import type { TextLine } from '../../modules/recipe-reader';
import type { RecipeItem } from './recipes';
import { itemKey } from './sharedAisles';

export type ParsedRecipe = { title: string; servings: string; items: RecipeItem[] };

// Recipe sites print scale and unit buttons next to the heading ("Ingredients 1x 2x 3x", "US Customary Metric").
const SITE_BUTTONS = String.raw`(?:\s*(?:\d+(?:\.\d+)?\s*x|us customary|us|metric|imperial|scale|servings?|\||·))*`;
const INGREDIENTS_HEADING = new RegExp(
  String.raw`^\s*(ingredients?|what you('|’)?ll need|you('|’)?ll need|shopping list)\s*:?${SITE_BUTTONS}\s*$`,
  'i',
);
// Buttons and labels recipe sites and apps put around the ingredient list. Seen in screenshots and page text.
const SITE_CHROME =
  /^(?:us customary|us|metric|imperial|us\s*\/\s*metric|\d+(?:\.\d+)?x(?:\s+\d+(?:\.\d+)?x)*|scale|cook mode|prevent your screen from going dark|keep screen awake|print( recipe)?|pin( recipe)?|save( recipe)?|share|jump to recipe|rate (this )?recipe|leave a review|add to (shopping )?list|add all to (shopping )?list|shop ingredients|on sale|check all|uncheck all|copy ingredients|convert units|original recipe.*|ingredient substitutions|video|watch( video)?|gather (your )?ingredients|advertisement|ad|sponsored|skip to content|jump to video|serves?|servings?|yield|cups?|grams|oz|ounces?)$/i;
const STOP_HEADING =
  /^\s*(directions?|instructions?|method|steps?|preparation|how to make( it)?|to make|notes?|nutrition( facts| information)?|equipment|step 1\b)\s*:?/i;
const SERVINGS = /\b(serves|servings?|makes|yield)\b\s*:?\s*([\d½¼¾⅓⅔ -]+[a-z ]{0,20})/i;

const FRACTIONS: Record<string, string> = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8' };
const NUM = String.raw`(?:\d+\s+\d\/\d|\d+\/\d+|\d+(?:\.\d+)?)`;
const QTY = new RegExp(String.raw`^(?:about\s+|approx\.?\s+)?${NUM}(?:\s*(?:-|–|to)\s*${NUM})?`, 'i');
const UNITS = [
  'cups?', 'c\\.', 'tablespoons?', 'tbsps?\\.?', 'tbs\\.?', 'T\\.?', 'teaspoons?', 'tsps?\\.?', 't\\.',
  'ounces?', 'oz\\.?', 'fl\\.? oz\\.?', 'pounds?', 'lbs?\\.?', 'grams?', 'g', 'kilograms?', 'kg', 'ml', 'milliliters?',
  'liters?', 'l', 'quarts?', 'qts?\\.?', 'pints?', 'pts?\\.?', 'gallons?', 'gal\\.?', 'cans?', 'jars?', 'bottles?',
  'packages?', 'pkgs?\\.?', 'packets?', 'envelopes?', 'boxes?', 'bags?', 'containers?', 'sticks?', 'cloves?', 'heads?',
  'bunch(?:es)?', 'sprigs?', 'stalks?', 'slices?', 'pieces?', 'pinch(?:es)?', 'dash(?:es)?', 'handfuls?', 'large',
  'medium', 'small',
];
const UNIT = new RegExp(String.raw`^(?:${UNITS.join('|')})(?=\s|$|\))`, 'i');
// Removed from the item name: they say how to prepare it, not what to buy.
const PREP =
  /\b(finely|coarsely|roughly|thinly|freshly|lightly|well|very|chopped|(?:diced|crushed|stewed)(?!\s+(?:tomato|red pepper|pineapple))|minced|sliced|grated|shredded|peeled|seeded|cored|trimmed|halved|quartered|cubed|melted|softened|beaten|divided|drained|rinsed|packed|sifted|toasted|cooked|uncooked|room temperature|at room temperature|cut into [^,]+|plus more[^,]*|or more[^,]*|to taste|for serving|for garnish|for topping|for dusting|optional|if desired|as needed)\b/gi;
const PANTRY = new Set(
  [
    'salt', 'kosher salt', 'sea salt', 'pepper', 'black pepper', 'ground black pepper', 'salt and pepper',
    'olive oil', 'extra virgin olive oil', 'vegetable oil', 'canola oil', 'cooking spray', 'oil', 'sugar',
    'granulated sugar', 'white sugar', 'flour', 'all purpose flour', 'baking soda', 'baking powder', 'water',
    'ice', 'ice water', 'hot water', 'warm water', 'cold water', 'vanilla', 'vanilla extract', 'garlic powder',
    'onion powder', 'paprika', 'ground cumin', 'cumin', 'dried oregano', 'oregano', 'cinnamon', 'ground cinnamon',
    'red pepper flakes', 'crushed red pepper', 'chili powder', 'nonstick cooking spray',
  ].map((s) => itemKey(s)),
);
const NOT_AN_ITEM = /^(water|ice|ice cubes|hot water|warm water|cold water|boiling water)$/i;

const normalise = (line: string) =>
  line
    .replace(/[½¼¾⅓⅔⅛]/g, (f) => ` ${FRACTIONS[f]}`)
    .replace(/^\s*(?:[-–—•*·▢□☐◦o]|\d+[.)](?=\s+\D))\s+/, '') // bullets and "1." list numbers
    .replace(/\s+/g, ' ')
    .trim();

const startsWithAmount = (line: string) => QTY.test(normalise(line)) || /^(a|an|one|two|three|a few|pinch|dash)\s/i.test(line);

/** Splits "2 cups shredded cheddar cheese, divided" into the amount and the thing to buy. */
export function parseIngredient(raw: string): RecipeItem | null {
  let line = normalise(raw);
  if (!line || line.length > 120 || STOP_HEADING.test(line) || INGREDIENTS_HEADING.test(line)) return null;
  if (SITE_CHROME.test(line.replace(/[.:!]+$/, '').trim()) || /^(serves|servings?|makes|yield)\b/i.test(line)) return null;
  if (/^for the\b.*:$/i.test(line) || /:$/.test(line)) return null; // sub-headings like "For the sauce:"

  const amount: string[] = [];
  const qty = line.match(QTY);
  if (qty) {
    amount.push(qty[0]);
    line = line.slice(qty[0].length).trim();
  } else {
    const word = line.match(/^(a|an|one|two|three|four|a few|a couple of)\s+/i);
    if (word) {
      amount.push(word[0].trim());
      line = line.slice(word[0].length);
    }
  }
  // "(14 oz)" package sizes right after the amount belong to the amount.
  const size = line.match(/^\(([^)]{1,25})\)\s*/);
  if (size) {
    amount.push(`(${size[1]})`);
    line = line.slice(size[0].length);
  }
  for (let n = 0; n < 2; n++) {
    const unit = line.match(UNIT);
    if (!unit) break;
    amount.push(unit[0]);
    line = line.slice(unit[0].length).trim();
  }
  line = line.replace(/^of\s+/i, '');

  let name = line
    .replace(/\([^)]*\)/g, ' ') // notes in brackets
    .split(/,|;|\s+-\s+|\s+–\s+/)[0] // "onion, diced" → "onion"
    .replace(/\s+or\s+.*$/i, '') // "butter or margarine" → "butter"
    .replace(PREP, ' ')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(and|of|the)\s+/i, '')
    .replace(/[\s.:,]+$/, '')
    .trim()
    .toLowerCase();
  if (name.length < 2 || !/[a-z]/.test(name) || NOT_AN_ITEM.test(name) || SITE_CHROME.test(name)) return null;
  if (name.split(' ').length > 6) return null; // a sentence, not an ingredient
  name = name.slice(0, 60);
  return { item: name, amount: amount.join(' ').replace(/\s+/g, ' ').trim(), pantry: PANTRY.has(itemKey(name)) };
}

/** Joins lines that OCR split in two ("1 can (14 oz) diced" + "tomatoes, drained"). */
function joinWrapped(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const prev = out[out.length - 1];
    const continues =
      prev !== undefined &&
      !startsWithAmount(line) &&
      !/^[-–—•*·▢□☐◦]\s/.test(line) &&
      (/^[a-z(]/.test(line) || /[,(-]$/.test(prev) || /\b(and|or|of|to|in|with)$/i.test(prev)) &&
      !INGREDIENTS_HEADING.test(line) &&
      !STOP_HEADING.test(line);
    if (continues) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}

/** The ingredient lines of a recipe: after an "Ingredients" heading if there is one, else every line that starts with an amount. */
export function ingredientLines(lines: string[]): string[] {
  const start = lines.findIndex((l) => INGREDIENTS_HEADING.test(l));
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const stop = rest.findIndex((l) => STOP_HEADING.test(l));
    return joinWrapped(stop >= 0 ? rest.slice(0, stop) : rest);
  }
  const joined = joinWrapped(lines);
  return joined.filter((l) => startsWithAmount(l) && normalise(l).split(' ').length <= 14);
}

export function parseRecipeLines(lines: string[], title = ''): ParsedRecipe {
  const servings = lines.map((l) => l.match(SERVINGS)).find(Boolean);
  const merged = new Map<string, RecipeItem>();
  for (const line of ingredientLines(lines)) {
    const item = parseIngredient(line);
    if (!item) continue;
    const key = itemKey(item.item);
    const had = merged.get(key);
    if (had) had.amount = [had.amount, item.amount].filter(Boolean).join(' + ');
    else merged.set(key, item);
  }
  return {
    title: title.trim().slice(0, 80) || 'My recipe',
    servings: servings ? `${servings[1].toLowerCase()} ${servings[2].trim()}`.slice(0, 40) : '',
    items: [...merged.values()].slice(0, 60),
  };
}

/**
 * Puts photo text in reading order and picks the ingredients. Cookbook pages often have ingredients in a
 * left column and steps on the right, so after an "Ingredients" heading only lines in that column count.
 * The title is the tallest text near the top.
 */
export function parsePhotoText(found: TextLine[]): ParsedRecipe {
  const rows = found.filter((l) => l.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const heading = rows.find((l) => INGREDIENTS_HEADING.test(l.text));
  let lines = rows;
  if (heading) {
    const left = heading.x - 0.08;
    const columnRight = Math.max(heading.x + 0.45, heading.x + heading.width + 0.3);
    const inColumn = rows.filter((l) => l === heading || (l.y >= heading.y && l.x >= left && l.x < columnRight));
    // Only narrow to a column when something sits beside it (a real two-column page).
    if (rows.some((l) => l.y > heading.y && (l.x < left || l.x >= columnRight))) lines = inColumn;
  }
  const top = rows.filter((l) => l.y < 0.35 && !INGREDIENTS_HEADING.test(l.text) && !SERVINGS.test(l.text));
  const tallest = top.reduce<TextLine | null>((best, l) => (!best || l.height > best.height * 1.15 ? l : best), null);
  const title = tallest && tallest.text.split(' ').length <= 10 ? tallest.text : '';
  return parseRecipeLines(lines.map((l) => l.text), title);
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&frac12;/g, '½')
    .replace(/&frac14;/g, '¼')
    .replace(/&frac34;/g, '¾')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

// deno-lint-ignore no-explicit-any
function findRecipe(node: any): any {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  return findRecipe(node['@graph']);
}

/** Recipe sites publish their ingredient list as schema.org Recipe data; use it, else the page's text. */
export function parseRecipePage(html: string): ParsedRecipe {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const recipe = findRecipe(JSON.parse(m[1]));
      const lines: unknown[] = recipe?.recipeIngredient ?? recipe?.ingredients ?? [];
      if (lines.length) {
        const parsed = parseRecipeLines(['Ingredients', ...lines.map((l) => decode(String(l)))], decode(String(recipe.name ?? '')));
        const yieldText = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield;
        if (yieldText && !parsed.servings) parsed.servings = String(yieldText).slice(0, 40);
        return parsed;
      }
    } catch {}
  }
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').split(/[|–-]/)[0];
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)[^>]*>/gi, '\n');
  return parseRecipeLines(decode(text).split('\n'), title);
}

/** Pasted text: the first short line is taken as the title when it isn't an ingredient. */
export function parsePastedText(text: string): ParsedRecipe {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? '';
  const title = first && !startsWithAmount(first) && !INGREDIENTS_HEADING.test(first) && first.split(' ').length <= 10 ? first : '';
  return parseRecipeLines(title ? lines.slice(1) : lines, title);
}
