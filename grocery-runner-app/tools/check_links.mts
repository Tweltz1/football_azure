// Reads real recipe pages with the app's own parser (src/lib/recipeText.ts) and prints what a shopper
// would get: title, every ingredient, every step with its minutes, and the total. Flags pages where the
// ingredient or step count doesn't match the page's own recipe data. Run by grocery-runner-store.yml ([stride-links]).
import { hasRecipeData, parseCollectionPage, parseIngredient, parseRecipePage, splitLine } from '../src/lib/recipeText';

const DEFAULT_URLS = [
  'https://tastesbetterfromscratch.com/creamy-white-chicken-chili/',
  'https://www.allrecipes.com/recipe/16354/easy-meatloaf/',
  'https://www.budgetbytes.com/one-pot-creamy-cajun-chicken-pasta/',
  'https://www.simplyrecipes.com/recipes/perfect_guacamole/',
  'https://www.recipetineats.com/chicken-stir-fry/',
  'https://natashaskitchen.com/beef-stroganoff/',
  'https://pinchofyum.com/the-best-soft-chocolate-chip-cookies',
  'https://cafedelites.com/chicken-tikka-masala/',
  'https://www.foodnetwork.com/recipes/ree-drummond/simple-perfect-chili-recipe-2107099',
  'https://www.seriouseats.com/the-food-lab-best-chocolate-chip-cookie-recipe',
  'https://sallysbakingaddiction.com/best-banana-bread-recipe/',
  'https://www.bbcgoodfood.com/recipes/best-spaghetti-bolognese-recipe',
  'https://www.delish.com/cooking/recipe-ideas/a19636089/creamy-tuscan-chicken-recipe/',
  'https://www.loveandlemons.com/vegetable-soup/',
];
// tools/links.txt (one link per line) replaces the default list when present. A collection page
// ("20 healthy dinners") is expanded into every recipe it links to.
// The app's tsconfig has no Node types, so fs comes in untyped.
const fs = await import('node:fs' as string);
const listed: string[] = fs.existsSync('tools/links.txt')
  ? String(fs.readFileSync('tools/links.txt', 'utf8')).split('\n').map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith('#'))
  : [];
// "list: <link>" shows the recipes a collection links to without reading each one.
const LIST_ONLY = new Set(listed.filter((l) => l.startsWith('list:')).map((l) => l.slice(5).trim()));
const URLS = listed.length ? listed.map((l) => l.replace(/^list:\s*/, '')) : DEFAULT_URLS;
const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

// The page's own counts, straight from its JSON-LD, to compare with what the parser kept.
function sourceCounts(html: string) {
  let ing = 0, steps = 0, lines: string[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const t = m[1];
    const i = t.match(/"recipeIngredient"\s*:\s*\[([\s\S]*?)\]/);
    const found = i ? (i[1].match(/"(?:[^"\\]|\\.)*"/g) ?? []).map((q) => { try { return String(JSON.parse(q)); } catch { return q; } }) : [];
    if (found.length > ing) { ing = found.length; lines = found; }
    steps = Math.max(steps, (t.match(/"@type"\s*:\s*"HowToStep"/g) ?? []).length);
  }
  return { ing, steps, lines };
}

let problems = 0;
const queue = [...URLS];
for (let qi = 0; qi < queue.length; qi++) {
  const url = queue[qi];
  console.log(`\n=== ${url}`);
  try {
    if (qi >= URLS.length) await new Promise((ok) => setTimeout(ok, 400)); // gentle on the site
    const res = await fetch(url, { headers: { 'User-Agent': SAFARI, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' } });
    if (!res.ok) { console.log(`  HTTP ${res.status} (site refused the runner)`); continue; }
    const html = await res.text();
    const r = parseRecipePage(html);
    if (!hasRecipeData(html) && qi < URLS.length) {
      const col = parseCollectionPage(html, url);
      console.log(`  collection: ${col?.title ?? 'none'} | ${col?.recipes.length ?? 0} recipe link(s)`);
      for (const l of col?.recipes ?? []) console.log(`    ${l.title} <${l.url}>`);
      if (col && !LIST_ONLY.has(url)) queue.push(...col.recipes.map((l) => l.url));
      if (col) continue;
    }
    const src = sourceCounts(html);
    console.log(`  title: ${r.title} | servings: ${r.servings} | total: ${r.minutes ?? '?'} min | image: ${r.imageUrl ? 'yes' : 'no'}`);
    console.log(`  ingredients: ${r.items.length} (page lists ${src.ing})`);
    if (process.env.DUMP) for (const l of src.lines) console.log(`    > ${l}`);
    for (const it of r.items) console.log(`    - [${it.amount}] ${it.item}${it.note ? ` (${it.note})` : ''}${it.pantry ? ' *pantry' : ''}`);
    console.log(`  steps: ${r.steps?.length ?? 0} (page has ${src.steps} HowToSteps)`);
    for (const [n, s] of (r.steps ?? []).entries()) console.log(`    ${n + 1}. (${s.minutes} min) ${s.text.slice(0, 160)}`);
    // A line counts as dropped only if the parser threw it away; the same thing listed twice
    // ("garlic" in the marinade and the sauce) is merged into one shopping line on purpose.
    // Water is left out on purpose.
    const dropped = src.lines.filter((l) => !/^[\d\s\/]*(?:cups?|tablespoons?|teaspoons?)?\s*(?:hot |cold |warm |boiling )?water\b/i.test(l) && splitLine(l.replace(/<[^>]+>/g, ' ')).some((p) => !parseIngredient(p)));
    if (src.ing > r.items.length) console.log(`  (${src.ing - r.items.length - dropped.length} repeated ingredient(s) merged into one line)`);
    for (const l of dropped) console.log(`  -- skipped: ${l}`);
    if (dropped.length) { problems++; console.log(`  !! ${dropped.length} ingredient line(s) skipped`); }
    if (src.steps && (r.steps?.length ?? 0) < src.steps) { problems++; console.log('  !! steps missing'); }
  } catch (e) {
    problems++;
    console.log(`  !! failed: ${(e as Error).message}`);
  }
}
console.log(`\n${problems} problem(s)`);
