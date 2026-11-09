// Reads a recipe (a photo, pasted text, or a recipe web page) and returns a shopping list.
// Uses the Claude API with ANTHROPIC_API_KEY, which lives only in Supabase secrets, never in the app.
import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0';

export const recipesReady = () => Boolean(Deno.env.get('ANTHROPIC_API_KEY'));

let client: Anthropic | null = null;
const claude = () => (client ??= new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }));

export type RecipeItem = { item: string; amount: string; pantry: boolean };
export type ReadRecipe = { title: string; servings: string; items: RecipeItem[] };

const MAX_IMAGE_B64 = 6_000_000; // about 4.5 MB of JPEG; the app sends ~1600 px wide photos
const MAX_TEXT = 20_000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'servings', 'items', 'isRecipe'],
  properties: {
    isRecipe: { type: 'boolean', description: 'False if the input is not a recipe or ingredient list.' },
    title: { type: 'string' },
    servings: { type: 'string', description: 'For example "4 servings", or empty if not stated.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['item', 'amount', 'pantry'],
        properties: {
          item: { type: 'string', description: 'What to look for in a grocery store, e.g. "yellow onion", "chicken thighs".' },
          amount: { type: 'string', description: 'Total amount the recipe needs, e.g. "2 cups", or empty.' },
          pantry: { type: 'boolean', description: 'True for staples most kitchens already have.' },
        },
      },
    },
  },
} as const;

const SYSTEM = `You turn recipes into grocery shopping lists.
Return one entry per thing to buy, named the way a shopper would look for it in a US grocery store:
drop preparation words ("diced", "softened", "to taste"), merge repeats across sections (two lines of butter
become one "butter" entry with the combined amount), and keep useful qualifiers ("unsalted butter",
"boneless chicken thighs"). Skip water and anything that is made earlier in the same recipe.
Mark pantry true for staples most home kitchens already have: salt, black pepper, cooking oils, sugar,
all-purpose flour, baking soda, baking powder, common dried spices. A recipe photo may be handwritten,
a cookbook page, or a screen; read every ingredient you can see. If the input is not a recipe or an
ingredient list, set isRecipe false and return an empty items list.`;

/** Only plain https pages on public hostnames. */
function safeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('That link does not look right.');
  }
  const host = url.hostname;
  if (
    url.protocol !== 'https:' ||
    url.port ||
    !host.includes('.') ||
    /^[\d.]+$/.test(host) ||
    host.includes(':') ||
    /(^|\.)(localhost|local|internal)$/.test(host)
  ) {
    throw new Error('Use a normal https recipe link.');
  }
  return url;
}

/** Recipe sites publish schema.org Recipe data in JSON-LD; use it when present, else the page text. */
async function textFromPage(raw: string): Promise<string> {
  const res = await fetch(safeUrl(raw), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShopStride recipe reader)', Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Could not open that page (${res.status}).`);
  const html = (await res.text()).slice(0, 2_000_000);

  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const found = findRecipe(JSON.parse(m[1]));
      if (found) {
        const lines = (found.recipeIngredient ?? found.ingredients ?? []) as unknown[];
        if (lines.length) {
          return [`Title: ${found.name ?? ''}`, `Yield: ${found.recipeYield ?? ''}`, 'Ingredients:', ...lines.map(String)].join(
            '\n',
          );
        }
      }
    } catch {}
  }
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_TEXT);
}

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

export async function readRecipe(body: Record<string, unknown>): Promise<ReadRecipe> {
  if (!recipesReady()) throw new Error('Recipe reading is not switched on yet.');

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (typeof body.image === 'string') {
    if (body.image.length > MAX_IMAGE_B64) throw new Error('That photo is too large.');
    const mediaType = IMAGE_TYPES.find((t) => t === body.mediaType) ?? 'image/jpeg';
    if (mediaType === 'image/heic') throw new Error('Send the photo as a JPEG.');
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: body.image } });
    content.push({ type: 'text', text: 'Make a shopping list from this recipe photo.' });
  } else if (typeof body.url === 'string') {
    content.push({ type: 'text', text: `Make a shopping list from this recipe page:\n\n${await textFromPage(body.url)}` });
  } else if (typeof body.text === 'string' && body.text.trim().length > 10) {
    content.push({ type: 'text', text: `Make a shopping list from this recipe:\n\n${body.text.slice(0, MAX_TEXT)}` });
  } else {
    throw new Error('Send a photo, a link, or the recipe text.');
  }

  const response = await claude().beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') throw new Error('Could not read that recipe.');
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Could not read that recipe.');
  const parsed = JSON.parse(text.text) as ReadRecipe & { isRecipe: boolean };
  if (!parsed.isRecipe || !parsed.items.length) throw new Error("That doesn't look like a recipe. Try a clearer photo.");
  return {
    title: parsed.title.trim().slice(0, 80) || 'My recipe',
    servings: parsed.servings.trim().slice(0, 40),
    items: parsed.items
      .map((i) => ({ item: i.item.trim().slice(0, 60), amount: i.amount.trim().slice(0, 40), pantry: !!i.pantry }))
      .filter((i) => i.item)
      .slice(0, 60),
  };
}
