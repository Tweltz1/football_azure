import type { PhotoAnalysis, TextLine } from '../../modules/tote-native';

export type Suggestion = { name: string; from: 'photo' | 'text'; sure: boolean };

/** Scene, building and very broad labels from Apple's classifier that are never things in a tote. */
const SKIP = new Set([
  'indoor', 'outdoor', 'structure', 'building', 'house', 'room', 'interior_room', 'interior_shop', 'office', 'kitchen',
  'bedroom', 'bathroom', 'garage', 'portal', 'door', 'doorway', 'window', 'wall', 'ceiling', 'floor', 'flooring',
  'wood_processed', 'wood_natural', 'material', 'object', 'pattern', 'texture', 'color', 'black', 'white', 'blue',
  'red', 'green', 'sky', 'land', 'water', 'people', 'adult', 'child', 'hand', 'finger', 'arm', 'leg', 'foot',
  'furniture', 'shelf', 'shelves', 'table', 'desk', 'counter', 'cabinet', 'machine', 'equipment', 'tool',
  'conveyance', 'vehicle', 'screenshot', 'text', 'document', 'printed_page', 'liquid', 'decoration', 'structure_other',
  'storage_box', 'box', 'container',
]);

/** Apple's label → the name most people would write on a tote list. */
const FRIENDLY: Record<string, string> = {
  textile: 'Cloth', cloth: 'Cloth', fabric: 'Cloth', linen: 'Linens', clothing: 'Clothes', apparel: 'Clothes',
  shirt: 'Shirt', tshirt: 'T-shirt', jacket: 'Jacket', footwear: 'Shoes', shoes: 'Shoes', blanket: 'Blanket',
  towel: 'Towel', cardboard_box: 'Cardboard box', cardboard: 'Cardboard', paper: 'Papers', art: 'Artwork',
  drawing: 'Drawing', sketch: 'Drawing', illustration: 'Drawing', painting: 'Painting', book: 'Books',
  kitchenware: 'Kitchenware', housewares: 'Housewares', tableware: 'Dishes', plate: 'Plates', bowl: 'Bowls',
  cookware: 'Pots and pans', food_container: 'Food containers', tupperware: 'Food containers', bottle: 'Bottles',
  plastic_bag: 'Plastic bags', bag: 'Bags', bubble_wrap: 'Bubble wrap', consumer_electronics: 'Electronics',
  cable: 'Cables', wire: 'Cables', cord: 'Cables', computer: 'Computer', computer_keyboard: 'Keyboard',
  computer_mouse: 'Mouse', headphones: 'Headphones', remote_control: 'Remote', toy: 'Toys', ball: 'Ball',
  decoration_christmas: 'Christmas decorations', christmas_decoration: 'Christmas decorations', lights: 'Lights',
  candle: 'Candles', flashlight: 'Flashlight', battery: 'Batteries', tape: 'Tape', scissors: 'Scissors',
  hand_tool: 'Hand tools', power_tool: 'Power tools', screwdriver: 'Screwdriver', wrench: 'Wrench', hammer: 'Hammer',
};

function friendly(label: string): string {
  const key = label.toLowerCase();
  if (FRIENDLY[key]) return FRIENDLY[key];
  const s = key.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Cleans an OCR phrase: drops symbols, stray numbers and one-letter scraps ("(7) «Ichy" → ""). */
export function cleanPhrase(raw: string): string {
  const words = raw
    .replace(/[®™©«»“”"(){}\[\]|*•·]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ''))
    .filter((w) => w.length >= 2 && (w.match(/\p{L}/gu)?.length ?? 0) >= Math.ceil(w.length * 0.6));
  const phrase = words.join(' ');
  if (words.length === 1 && phrase.length < 5) return '';
  return (phrase.match(/\p{L}/gu)?.length ?? 0) >= 4 && phrase.length <= 40 ? phrase : '';
}

/** Joins lines printed together (same size, stacked or side by side), e.g. "Olive" + "Garden" → "Olive Garden". */
export function mergeLines(lines: TextLine[]): { text: string; size: number }[] {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: TextLine[][] = [];
  for (const line of sorted) {
    const g = groups.find((grp) => {
      const last = grp[grp.length - 1];
      const sameSize = Math.max(last.h, line.h) / Math.min(last.h, line.h) < 1.6;
      const gapBelow = line.y - (last.y + last.h);
      const stacked = gapBelow > -last.h * 0.5 && gapBelow < Math.max(last.h, line.h) * 0.9;
      const overlapX = Math.min(last.x + last.w, line.x + line.w) - Math.max(last.x, line.x) > -Math.max(last.h, line.h);
      const sideBySide = Math.abs(line.y - last.y) < last.h * 0.5 && line.x - (last.x + last.w) < last.h * 1.5 && line.x > last.x;
      return sameSize && ((stacked && overlapX) || sideBySide) && grp.length < 4;
    });
    if (g) g.push(line);
    else groups.push([line]);
  }
  return groups.map((grp) => ({ text: grp.map((l) => l.text).join(' '), size: Math.max(...grp.map((l) => l.h)) }));
}

function titleCase(s: string): string {
  return s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()) : s;
}

/**
 * Turns what the iPhone saw into item suggestions: things it recognized (best first; only confident ones come
 * pre-ticked), then up to 6 cleaned phrases read from labels and packaging (never pre-ticked).
 */
export function suggestionsFrom(result: PhotoAnalysis): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  const push = (s: Suggestion) => {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  const things = result.labels
    .filter((l) => !SKIP.has(l.label.toLowerCase()))
    .map((l) => ({ ...l, score: l.confidence + Math.min(l.regions ?? 1, 4) * 0.04 }))
    .filter((l) => l.confidence >= 0.3 || (l.confidence >= 0.2 && (l.regions ?? 1) >= 2))
    .sort((a, b) => b.score - a.score);
  for (const l of things) {
    push({ name: friendly(l.label), from: 'photo', sure: l.confidence >= 0.6 || (l.confidence >= 0.45 && (l.regions ?? 1) >= 2) });
    if (out.length >= 12) break;
  }

  const phrases = result.lines?.length ? mergeLines(result.lines.filter((l) => l.confidence >= 0.6)).sort((a, b) => b.size - a.size).map((p) => p.text) : result.text;
  let count = 0;
  for (const raw of phrases) {
    const phrase = cleanPhrase(raw);
    if (!phrase) continue;
    push({ name: titleCase(phrase), from: 'text', sure: false });
    if (++count >= 6) break;
  }
  return out;
}
