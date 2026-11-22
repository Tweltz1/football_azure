// Builds the request body for Instacart's "Create shopping list page" call
// (POST /idp/v1/products/products_link, Instacart Developer Platform). Pure, so tests can run it.
// The shopper opens the link, picks any Instacart store near them (Aldi, Festival, Woodman's, Costco, ...),
// and checks out on Instacart for delivery or pickup. Instacart returns no stock or aisles.

export type ListLine = { name: string; amount?: string };

const UNITS: Record<string, string> = {
  cup: 'cup', cups: 'cup', c: 'cup',
  tbsp: 'tablespoon', tablespoon: 'tablespoon', tablespoons: 'tablespoon', tbs: 'tablespoon', tb: 'tablespoon',
  tsp: 'teaspoon', teaspoon: 'teaspoon', teaspoons: 'teaspoon',
  oz: 'ounce', ounce: 'ounce', ounces: 'ounce',
  lb: 'pound', lbs: 'pound', pound: 'pound', pounds: 'pound',
  g: 'gram', gram: 'gram', grams: 'gram', kg: 'kilogram',
  ml: 'milliliter', l: 'liter', liter: 'liter', liters: 'liter',
  gallon: 'gallon', gallons: 'gallon', gal: 'gallon', quart: 'quart', quarts: 'quart', qt: 'quart', pint: 'pint', pints: 'pint',
  can: 'can', cans: 'can', package: 'package', packages: 'package', pkg: 'package', bunch: 'bunch', bunches: 'bunch',
  head: 'head', heads: 'head', clove: 'clove', cloves: 'clove', each: 'each', ct: 'each', dozen: 'dozen',
};

const FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };

/** "1 1/2 cups" -> {quantity: 1.5, unit: "cup"}; "3" -> {quantity: 3, unit: "each"}; anything else -> null. */
export function parseAmount(amount: string | undefined): { quantity: number; unit: string } | null {
  if (!amount) return null;
  let s = amount.trim().toLowerCase();
  for (const [f, v] of Object.entries(FRACTIONS)) s = s.split(f).join(` ${v} `);
  const words = s.replace(/\([^)]*\)/g, ' ').replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  let q = 0;
  let i = 0;
  for (; i < words.length; i++) {
    const w = words[i];
    const frac = w.match(/^(\d+)\/(\d+)$/);
    if (frac && Number(frac[2]) > 0) q += Number(frac[1]) / Number(frac[2]);
    else if (/^\d+(\.\d+)?$/.test(w)) q += Number(w);
    else break;
  }
  if (i === 0 || !(q > 0) || q > 1000) return null;
  const word = (words[i] ?? '').replace(/\.$/, '');
  if (!word) return { quantity: round(q), unit: 'each' };
  const unit = UNITS[word];
  return unit ? { quantity: round(q), unit } : null;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Same items in any order give the same key, so the server can reuse a link it already made. */
export function listKey(lines: ListLine[]): string {
  return lines
    .map((l) => `${l.name.trim().toLowerCase()}|${(l.amount ?? '').trim().toLowerCase()}`)
    .sort()
    .join('\n');
}

export function instacartBody(lines: ListLine[], title = 'My Shop Stride list') {
  const seen = new Set<string>();
  const line_items = [];
  for (const l of lines) {
    const name = l.name.trim().replace(/\s+/g, ' ').slice(0, 100);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const m = parseAmount(l.amount);
    const display = l.amount?.trim() ? `${name} (${l.amount.trim()})` : name;
    line_items.push({
      name,
      display_text: display,
      ...(m ? { line_item_measurements: [{ quantity: m.quantity, unit: m.unit }] } : {}),
    });
    if (line_items.length >= 100) break;
  }
  return {
    title: title.slice(0, 80),
    link_type: 'shopping_list',
    expires_in: 30,
    line_items,
    landing_page_configuration: { partner_linkback_url: 'https://weltzcraft.com/shopstride/', enable_pantry_items: false },
  };
}
