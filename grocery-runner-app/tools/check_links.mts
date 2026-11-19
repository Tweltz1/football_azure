// Reads real recipe pages with the app's own parser (src/lib/recipeText.ts) and prints what a shopper
// would get: title, every ingredient, every step with its minutes, and the total. Flags pages where the
// ingredient or step count doesn't match the page's own recipe data. Run by grocery-runner-store.yml ([stride-links]).
import { parseRecipePage } from '../src/lib/recipeText';

const URLS = [
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
const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

// The page's own counts, straight from its JSON-LD, to compare with what the parser kept.
function sourceCounts(html: string) {
  let ing = 0, steps = 0;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const t = m[1];
    const i = t.match(/"recipeIngredient"\s*:\s*\[([\s\S]*?)\]/);
    if (i) ing = Math.max(ing, (i[1].match(/"(?:[^"\\]|\\.)*"/g) ?? []).length);
    steps = Math.max(steps, (t.match(/"@type"\s*:\s*"HowToStep"/g) ?? []).length);
  }
  return { ing, steps };
}

let problems = 0;
for (const url of URLS) {
  console.log(`\n=== ${url}`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': SAFARI, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' } });
    if (!res.ok) { console.log(`  HTTP ${res.status} (site refused the runner)`); continue; }
    const html = await res.text();
    const r = parseRecipePage(html);
    const src = sourceCounts(html);
    console.log(`  title: ${r.title} | servings: ${r.servings} | total: ${r.minutes ?? '?'} min | image: ${r.imageUrl ? 'yes' : 'no'}`);
    console.log(`  ingredients: ${r.items.length} (page lists ${src.ing})`);
    for (const it of r.items) console.log(`    - [${it.amount}] ${it.item}${it.note ? ` (${it.note})` : ''}${it.pantry ? ' *pantry' : ''}`);
    console.log(`  steps: ${r.steps?.length ?? 0} (page has ${src.steps} HowToSteps)`);
    for (const [n, s] of (r.steps ?? []).entries()) console.log(`    ${n + 1}. (${s.minutes} min) ${s.text.slice(0, 160)}`);
    if (src.ing && r.items.length < src.ing) { problems++; console.log(`  !! ${src.ing - r.items.length} ingredient lines dropped`); }
    if (src.steps && (r.steps?.length ?? 0) < src.steps) { problems++; console.log('  !! steps missing'); }
  } catch (e) {
    problems++;
    console.log(`  !! failed: ${(e as Error).message}`);
  }
}
console.log(`\n${problems} problem(s)`);
