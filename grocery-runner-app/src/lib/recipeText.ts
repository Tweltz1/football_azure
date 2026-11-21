// Turns recipe text (from a photo, a web page or a paste) into shopping items, entirely on the phone.
// No AI service: rules for quantities, units and preparation words, like Talk Shops' price sheet reader.
import type { TextLine } from '../../modules/recipe-reader';
import type { RecipeItem } from './recipes';
import { itemKey } from './sharedAisles';

export type ParsedRecipe = {
  title: string;
  servings: string;
  items: RecipeItem[];
  imageUrl?: string;
  minutes?: number;
  steps?: { text: string; minutes: number }[];
};

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
  /\b(finely|coarsely|roughly|thinly|freshly|lightly|well|very|chopped|(?:diced|crushed|stewed)(?!\s+(?:tomato|red pepper|pineapple))|minced|sliced|grated|shredded|peeled|seeded|cored|trimmed|halved|quartered|picked|deseeded|de-seeded|in half|cubed|melted|softened|beaten|divided|drained|rinsed|packed|sifted|toasted|cooked|uncooked|room temperature|at room temperature|cut into [^,]+|plus more[^,]*|or more[^,]*|to taste|for serving|for garnish|for topping|for dusting|optional|if desired|as needed)\b/gi;
const PANTRY = new Set(
  [
    'salt', 'kosher salt', 'sea salt', 'pepper', 'black pepper', 'ground black pepper', 'salt and pepper',
    'salt and black pepper', 'salt and ground black pepper', 'kosher salt and pepper', 'salt and freshly ground black pepper',
    'olive oil', 'extra virgin olive oil', 'vegetable oil', 'canola oil', 'cooking spray', 'oil', 'sugar',
    'granulated sugar', 'white sugar', 'flour', 'all purpose flour', 'baking soda', 'baking powder', 'water',
    'ice', 'ice water', 'hot water', 'warm water', 'cold water', 'vanilla', 'vanilla extract', 'garlic powder',
    'onion powder', 'paprika', 'ground cumin', 'cumin', 'dried oregano', 'oregano', 'cinnamon', 'ground cinnamon',
    'red pepper flakes', 'crushed red pepper', 'chili powder', 'nonstick cooking spray',
  ].map((s) => itemKey(s)),
);
// A first comma part made only of these is still describing the thing: "boneless, skinless chicken".
const DESCRIBING =
  /^(?:(?:boneless|skinless|bone-in|skin-on|fresh|large|small|medium|ripe|lean|extra[- ]lean|organic|unsalted|salted|low[- ]sodium|reduced[- ]sodium|plain|whole|raw|dry|hot|sweet|mild|firm|thick[- ]cut|thin[- ]cut|center[- ]cut|seedless|frozen|canned)\s*)+$/i;
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
  // "heaping cups", "scant teaspoon": how full, part of the amount.
  const fill = line.match(/^(heaping|heaped|level|scant|rounded|generous|good)\s+/i);
  if (fill) {
    amount.push(fill[1]);
    line = line.slice(fill[0].length);
  }
  // "(14 oz)" package sizes right after the amount belong to the amount, also written without
  // brackets as recipe plugins print them: "2 4 oz cans", "1 15-ounce can".
  const size = line.match(/^\(([^)]{1,25})\)\s*/) ?? line.match(/^(\d+(?:\.\d+)?\s*-?\s*(?:fl\.?\s*oz|oz|ounces?|ml|g|grams?|lbs?|pounds?)\.?)\s+(?=\S)/i);
  if (size) {
    amount.push(`(${size[1].replace(/\s*-\s*/, ' ')})`);
    line = line.slice(size[0].length);
  }
  for (let n = 0; n < 2; n++) {
    const unit = line.match(UNIT);
    if (!unit) break;
    amount.push(unit[0]);
    line = line.slice(unit[0].length).trim();
  }
  line = line.replace(/^of\s+/i, '');
  // "2 x 400g tins plum tomatoes": the pack size is part of the amount.
  const packs = line.match(/^x\s+(\d+(?:\.\d+)?\s*(?:fl\.?\s*oz|oz|ml|g|kg|lbs?)\.?)\s+((?:tins?|cans?|packs?|packets?|jars?|bottles?|cartons?|bags?|boxes)\s+)?/i);
  if (packs) {
    amount.push(`x ${packs[1].replace(/\s+/g, '')}${packs[2] ? ' ' + packs[2].trim() : ''}`);
    line = line.slice(packs[0].length);
  }

  // Notes in brackets, nested too: WP Recipe Maker writes "onion ((diced))" and "chicken (, cooked)".
  const notes: string[] = [];
  let bare = line;
  for (let n = 0; n < 4 && /\([^()]*\)/.test(bare); n++) {
    bare = bare.replace(/\(([^()]*)\)/g, (_, inner: string) => {
      notes.push(inner);
      return ' ';
    });
  }
  bare = bare.replace(/\(.*$/, ' ').replace(/[()]/g, ' ');
  // "onion, diced" → "onion" + note "diced". Leading describing words stay with the name:
  // "boneless, skinless chicken breasts" is all one thing to buy.
  const parts = bare.split(/,|;|\s+-\s+|\s+–\s+/);
  let head = parts.shift() ?? '';
  while (parts.length && DESCRIBING.test(head.trim()) && parts[0].trim()) head = `${head} ${parts.shift()}`;
  notes.push(...parts);
  const prepWords: string[] = [];
  const alternative = head.match(/\s+or\s+.*$/i)?.[0];
  let name = head
    .replace(/\s+or\s+.*$/i, '') // "butter or margarine" → "butter"
    .replace(PREP, (w) => {
      prepWords.push(w.toLowerCase());
      return ' ';
    })
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(and|of|the)\s+/i, '')
    .replace(/\s+(and|or|of|with|in)\s*$/i, '')
    .replace(/[\s.:,]+$/, '')
    .trim()
    .toLowerCase();
  if (prepWords.length) notes.unshift(prepWords.join(' '));
  if (alternative) notes.push(alternative.trim());
  const note = notes
    .map((n) => n.replace(/\*+/g, '').replace(/^[\s,;:-]+|[\s,;:.-]+$/g, '').replace(/\s+/g, ' ').trim())
    .filter((n) => n && n.length < 60 && /[a-z]/i.test(n))
    .filter((n, i, all) => all.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i)
    .join(', ')
    .slice(0, 80);
  if (name.length < 2 || !/[a-z]/.test(name) || NOT_AN_ITEM.test(name) || SITE_CHROME.test(name)) return null;
  if (name.split(' ').length > 6) return null; // a sentence, not an ingredient
  name = name.slice(0, 60);
  const out: RecipeItem = { item: name, amount: amount.join(' ').replace(/\s+/g, ' ').trim(), pantry: PANTRY.has(itemKey(name)) };
  if (note) out.note = note;
  return out;
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
export function ingredientLines(lines: string[], structured = false): string[] {
  // A recipe page's own ingredient data has one ingredient per entry; never join entries together.
  if (structured) return lines.map((l) => l.trim()).filter((l) => l && !INGREDIENTS_HEADING.test(l));
  const start = lines.findIndex((l) => INGREDIENTS_HEADING.test(l));
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const stop = rest.findIndex((l) => STOP_HEADING.test(l));
    return joinWrapped(stop >= 0 ? rest.slice(0, stop) : rest);
  }
  const joined = joinWrapped(lines);
  return joined.filter((l) => startsWithAmount(l) && normalise(l).split(' ').length <= 14);
}

export function parseRecipeLines(lines: string[], title = '', structured = false): ParsedRecipe {
  const servings = lines.map((l) => l.match(SERVINGS)).find(Boolean);
  const merged = new Map<string, RecipeItem>();
  for (const line of ingredientLines(lines, structured)) {
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

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
  const types: unknown[] = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  if (types.some((x) => typeof x === 'string' && /(^|[/:])Recipe$/.test(x))) return node;
  return findRecipe(node['@graph']) ?? findRecipe(node.mainEntity) ?? findRecipe(node.mainEntityOfPage);
}

/** Minutes a step mentions: "simmer 20-25 minutes" → 25, "bake for 1 hour" → 60, nothing → 0. */
export function stepMinutes(text: string): number {
  let most = 0;
  // "1 hr 15 mins" → 75, "10 to 15 more minutes" → 15, "40 seconds" → 1.
  const re =
    /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(?:more\s+)?(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b(?:,?\s*(?:and\s+)?(\d+)\s*(?:minutes?|mins?)\b)?/gi;
  for (const m of text.matchAll(re)) {
    const unit = m[3].toLowerCase();
    let n = Number(m[2] ?? m[1]) * (unit.startsWith('h') ? 60 : unit.startsWith('s') ? 1 / 60 : 1);
    if (unit.startsWith('h') && m[4]) n += Number(m[4]);
    if (n < 24 * 60) most = Math.max(most, n);
  }
  return most > 0 && most < 1 ? 1 : Math.round(most);
}

// deno-lint-ignore no-explicit-any
function stepsOf(node: any, out: string[] = []): string[] {
  if (!node) return out;
  if (typeof node === 'string') {
    // Some sites put every step in one string, one per line.
    node.split(/\n+/).forEach((l) => out.push(l));
  } else if (Array.isArray(node)) node.forEach((n) => stepsOf(n, out));
  else if (typeof node === 'object') {
    if (node.itemListElement) stepsOf(node.itemListElement, out); // HowToSection
    else if (node.text) out.push(String(node.text));
    else if (node.name) out.push(String(node.name));
  }
  return out;
}

/** ISO 8601 durations like "PT1H15M" → 75. */
export function isoMinutes(v: unknown): number | undefined {
  const m = typeof v === 'string' ? v.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i) : null;
  if (!m) return undefined;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 && total < 7 * 1440 ? total : undefined;
}

const stripTags = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Ingredient lines marked up in the page itself, for sites without schema.org data in a script:
 * microdata (itemprop="recipeIngredient") and the WP Recipe Maker / Tasty Recipes plugins most food blogs use.
 */
function markedIngredients(html: string): string[] {
  const out: string[] = [];
  const grab = (re: RegExp, from = html) => {
    for (const m of from.matchAll(re)) {
      const line = decode(stripTags(m[2] ?? m[1]));
      if (line && line.length < 200) out.push(line);
    }
  };
  grab(/<(li|span|p|div)[^>]+itemprop=["'](?:recipeIngredient|ingredients)["'][^>]*>([\s\S]*?)<\/\1>/gi);
  if (!out.length) grab(/<(li)[^>]+class=["'][^"']*\bwprm-recipe-ingredient\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi);
  if (!out.length) {
    const block = html.match(/class=["'][^"']*tasty-recipes?-ingredients[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i)?.[1];
    if (block) grab(/<(li)[^>]*>([\s\S]*?)<\/\1>/gi, block);
  }
  return out;
}

/** Recipe sites publish their ingredient list as schema.org Recipe data; use it, else the page's text. */
export function parseRecipePage(html: string): ParsedRecipe {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      // Some sites leave raw line breaks inside strings, which JSON doesn't allow.
      const recipe = findRecipe(JSON.parse(m[1].replace(/^\s*<!--|-->\s*$/g, '').replace(/[\u0000-\u001F]+/g, ' ')));
      const raw = recipe?.recipeIngredient ?? recipe?.ingredients ?? [];
      const lines: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\r?\n|<br\s*\/?>/i) : [];
      if (lines.length) {
        const parsed = parseRecipeLines(
          lines.map((l) => decode(stripTags(String(l)))),
          decode(stripTags(String(recipe.name ?? ''))),
          true,
        );
        const yieldText = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield;
        if (yieldText && !parsed.servings) parsed.servings = String(yieldText).slice(0, 40);
        parsed.imageUrl = imageOf(recipe.image) ?? ogImage(html);
        const steps = stepsOf(recipe.recipeInstructions)
          .map((t) => decode(stripTags(t)).replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 3)
          .slice(0, 40)
          .map((text) => ({ text: text.slice(0, 600), minutes: stepMinutes(text) }));
        if (steps.length) parsed.steps = steps;
        const minutes =
          isoMinutes(recipe.totalTime) ??
          ((isoMinutes(recipe.prepTime) ?? 0) + (isoMinutes(recipe.cookTime) ?? 0) || undefined) ??
          (steps.reduce((a, st) => a + st.minutes, 0) || undefined);
        if (minutes) parsed.minutes = minutes;
        return parsed;
      }
    } catch {}
  }
  const title = decode(
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
      '',
  ).split(/\s[|–—-]\s|\|/)[0].trim();
  const marked = markedIngredients(html);
  if (marked.length) return { ...parseRecipeLines(marked, title, true), imageUrl: ogImage(html) };
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)[^>]*>/gi, '\n');
  return { ...parseRecipeLines(decode(text).split('\n'), title), imageUrl: ogImage(html) };
}

const httpsOnly = (u: unknown) => (typeof u === 'string' && /^https:\/\/\S+$/.test(u) ? u : undefined);

/** schema.org image: a URL, an ImageObject, or a list of either. */
// deno-lint-ignore no-explicit-any
function imageOf(img: any): string | undefined {
  if (Array.isArray(img)) return imageOf(img[0]);
  if (img && typeof img === 'object') return httpsOnly(img.url ?? img.contentUrl);
  return httpsOnly(img);
}

const ogImage = (html: string) =>
  httpsOnly(
    decode(
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ??
        '',
    ),
  );

/** Pasted text: the first short line is taken as the title when it isn't an ingredient. */
export function parsePastedText(text: string): ParsedRecipe {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? '';
  const title = first && !startsWithAmount(first) && !INGREDIENTS_HEADING.test(first) && first.split(' ').length <= 10 ? first : '';
  return parseRecipeLines(title ? lines.slice(1) : lines, title);
}

/** "allrecipes.com/recipe/…" or a link with text around it → a full https:// address, else null. */
export function cleanLink(text: string): string | null {
  const v = text.trim();
  const m = v.match(/https?:\/\/[^\s<>"]+/i)?.[0] ?? (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(v) ? `https://${v}` : null);
  return m ? m.replace(/[).,]+$/, '') : null;
}

export type LinkedRecipe = { url: string; title: string };
export type RecipeCollection = { title: string; recipes: LinkedRecipe[] };

// Words that say a link goes to a recipe, without naming it ("Get the recipe").
const CTA = /^(?:get|see|view|read|open|make|try|full|print|go to)?\s*(?:the\s+)?(?:full\s+)?recipes?(?:\s+here)?\s*[»›→>]*$|^(?:read|see|learn)\s+more$|^here$/i;
// Paths that are never one recipe: site sections, people, shops and account pages.
const NOT_RECIPE_PATH =
  /\/(?:category|categories|tag|tags|author|authors|profiles?|about|contact|privacy|terms|shop|store|search|login|account|subscribe|newsletter|videos?|shows?|chefs?|topics?|collections?|packages?|galleries|gallery|wp-content|wp-admin|feed|page\/\d+)(?:\/|$)/i;

const slugTitle = (path: string) => {
  const slug = decodeURIComponent(path.replace(/\/+$/, '').split('/').pop() ?? '')
    .replace(/\.(?:html?|php)$/i, '')
    .replace(/-?\b(?:recipe\d*)\b-?/gi, ' ')
    .replace(/-?\d{4,}$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return slug ? slug[0].toUpperCase() + slug.slice(1) : '';
};

/**
 * A roundup page ("100 healthy dinners") links to many recipes and has none of its own. Finds those
 * links in order: the page's schema.org ItemList when it lists recipe pages, else links in the article
 * body that look like a single recipe on the same site. Returns null for a page with fewer than 2.
 */
export function parseCollectionPage(html: string, pageUrl: string): RecipeCollection | null {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return null;
  }
  const site = (h: string) => h.replace(/^www\./, '');
  const found = new Map<string, string>();
  const add = (href: string, title: string) => {
    let u: URL;
    try {
      u = new URL(decode(href).trim(), base);
    } catch {
      return;
    }
    if (!/^https?:$/.test(u.protocol) || site(u.host) !== site(base.host)) return;
    u.protocol = 'https:';
    u.hash = '';
    u.search = '';
    const key = u.href.replace(/\/+$/, '');
    if (key === base.href.split(/[?#]/)[0].replace(/\/+$/, '') || NOT_RECIPE_PATH.test(u.pathname)) return;
    const name = title.replace(/\s+/g, ' ').trim();
    const good = name && !CTA.test(name) && name.length <= 120 ? name : '';
    if (!found.has(key)) found.set(key, good);
    else if (!found.get(key) && good) found.set(key, good);
  };

  // 1. schema.org ItemList of pages (Allrecipes, Delish and most news-style roundups publish one).
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        const n = node as Record<string, unknown>;
        const type = ([] as unknown[]).concat(n['@type']);
        if (type.includes('ItemList') && Array.isArray(n.itemListElement)) {
          for (const el of n.itemListElement as Record<string, unknown>[]) {
            const item = (el?.item ?? el) as Record<string, unknown>;
            const url = (item?.url ?? el?.url ?? (typeof item?.['@id'] === 'string' ? item['@id'] : undefined)) as unknown;
            if (typeof url === 'string') add(url, String(item?.name ?? el?.name ?? ''));
          }
        }
        if (type.includes('BreadcrumbList')) return;
        Object.values(n).forEach(walk);
      };
      walk(JSON.parse(m[1].replace(/^\s*<!--|-->\s*$/g, '').replace(/[\u0000-\u001F]+/g, ' ')));
    } catch {}
  }

  // 2. Links in the article itself: menus, headers, footers and sidebars removed first.
  if (found.size < 2) {
    found.clear();
    let body = html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');
    const article = body.match(/<(article|main)\b[\s\S]*<\/\1>/i)?.[0];
    if (article) body = article;
    const anchors = [...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => {
      const attrs = m[1];
      const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
      const attrTitle = attrs.match(/\b(?:title|data-track-click|aria-label)\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
      const text = decode(stripTags(m[2]));
      return { href, text, title: decode(attrTitle) };
    });
    // Recipe-looking paths: "/recipe/…", "…-recipe-123", "/recipes/<who>/<dish>", or a blog post slug.
    const looksLikeRecipe = (href: string) => {
      let path: string;
      try {
        path = new URL(decode(href), base).pathname;
      } catch {
        return false;
      }
      const last = path.replace(/\/+$/, '').split('/').pop() ?? '';
      return /\/recipes?\//i.test(path) || /recipe/i.test(last) ? last.split('-').length >= 2 : last.split('-').length >= 3;
    };
    const ctas = anchors.filter((a) => CTA.test(a.text.trim()) && looksLikeRecipe(a.href));
    const pick = ctas.length >= 2 ? ctas : anchors.filter((a) => looksLikeRecipe(a.href));
    for (const a of pick) add(a.href, CTA.test(a.text.trim()) || !a.text.trim() ? a.title : a.text);
    // A link's name from elsewhere on the page ("Turkey Chili" image link next to "Get the recipe").
    for (const a of anchors) {
      if (!a.text.trim() || CTA.test(a.text.trim())) continue;
      try {
        const key = new URL(decode(a.href), base).href.split(/[?#]/)[0].replace(/^http:/, 'https:').replace(/\/+$/, '');
        if (found.has(key) && !found.get(key)) found.set(key, a.text.trim());
      } catch {}
    }
  }
  if (found.size < 2) return null;
  const title = decode(
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
      '',
  )
    .replace(/<[^>]+>/g, '')
    .split(/\s[|–—]\s|\s-\s|\|/)[0]
    .trim();
  return {
    title: title.slice(0, 100) || 'Recipes',
    recipes: [...found].slice(0, 120).map(([url, t]) => ({ url, title: (t || slugTitle(new URL(url).pathname) || url).slice(0, 100) })),
  };
}

/** True when the page publishes its own recipe data (so it's one recipe, not a roundup). */
export function hasRecipeData(html: string): boolean {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const r = findRecipe(JSON.parse(m[1].replace(/^\s*<!--|-->\s*$/g, '').replace(/[\u0000-\u001F]+/g, ' ')));
      if (r && (r.recipeIngredient ?? r.ingredients)) return true;
    } catch {}
  }
  return /itemprop=["'](?:recipeIngredient|ingredients)["']|\bwprm-recipe-ingredient\b|tasty-recipes?-ingredients/i.test(html);
}
