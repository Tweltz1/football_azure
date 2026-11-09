import type { DetectedObject, PhotoAnalysis, TextLine } from '../../modules/tote-native';

/**
 * `object`: a separate item the object detector outlined; `photo`: what Apple's classifier saw in the
 * photo or part of it; `text`: read off packaging; `fallback`: the catch-all for a jumbled photo.
 */
export type Suggestion = { name: string; from: 'object' | 'photo' | 'text' | 'fallback'; sure: boolean; qty: number };

/** What we offer when the photo is a jumble and nothing stands out clearly. */
export const MIXED_ITEMS = 'Box of mixed items';
const MIN_OBJECT_CONFIDENCE = 0.3;
/** Detected items at or above this are ticked for you. */
const SURE_OBJECT_CONFIDENCE = 0.5;
const MAX_OBJECTS = 10;
/** Lots of separate print in one photo means lots of separate packaging, so the tote is a mix. */
const BUSY_TEXT_LINES = 8;

/** Labels Apple uses when the scene is a jumble. If one of these comes back, the photo is a mix. */
const CLUTTER = new Set(['clutter', 'mess', 'junk', 'debris', 'rubble', 'garbage', 'trash', 'waste', 'recycling', 'pile', 'heap']);


/** Scene, building and very broad labels from Apple's classifier that are never things in a tote. */
const SKIP = new Set([
  'indoor', 'outdoor', 'structure', 'building', 'house', 'room', 'interior_room', 'interior_shop', 'office', 'kitchen',
  'bedroom', 'bathroom', 'garage', 'portal', 'door', 'doorway', 'window', 'wall', 'ceiling', 'floor', 'flooring',
  'wood_processed', 'wood_natural', 'material', 'object', 'pattern', 'texture', 'color', 'black', 'white', 'blue',
  'red', 'green', 'sky', 'land', 'water', 'people', 'adult', 'child', 'hand', 'finger', 'arm', 'leg', 'foot',
  'furniture', 'shelf', 'shelves', 'table', 'desk', 'counter', 'cabinet', 'machine', 'equipment', 'tool',
  'conveyance', 'vehicle', 'screenshot', 'text', 'document', 'printed_page', 'liquid', 'decoration', 'structure_other',
  'storage_box', 'box', 'container', 'gate', 'entrance', 'arch', 'archway', 'architecture', 'stairs', 'staircase',
  'hallway', 'living_room', 'warehouse', 'store', 'shop', 'retail', 'restaurant', 'cityscape', 'sign', 'logo', 'label',
]);

/**
 * Words that show up on packaging but are never the thing itself: legal text, company names,
 * slogans, instructions. A printed line that contains one of these is dropped.
 */
const PACKAGING_WORDS = new Set([
  'certificate', 'calibration', 'warranty', 'warning', 'caution', 'danger', 'ingredients', 'nutrition', 'serving',
  'servings', 'calories', 'net', 'wt', 'oz', 'lbs', 'ml', 'made', 'manufactured', 'distributed', 'imported', 'product',
  'products', 'model', 'serial', 'lot', 'batch', 'patent', 'pending', 'barcode', 'recycle', 'recyclable', 'recycled',
  'dishwasher', 'microwave', 'bpa', 'new', 'improved', 'original', 'premium', 'quality', 'brand',
  'inc', 'llc', 'ltd', 'co', 'corp', 'corporation', 'company', 'industries', 'industrial', 'technologies', 'technology',
  'labs', 'laboratories', 'systems', 'solutions', 'robotics', 'scientific', 'environmental', 'international', 'group',
  'kitchen', 'restaurant', 'grill', 'cafe', 'bar', 'trial', 'sample', 'instructions', 'directions', 'contents',
  'www', 'com', 'http', 'https', 'visit', 'call', 'tel', 'fax', 'email', 'customer', 'service', 'keep',
  'away', 'children', 'reach', 'use', 'only', 'see', 'open', 'here', 'tear', 'peel', 'fragile',
  'this', 'shipping', 'ship', 'deliver', 'delivery', 'return', 'address', 'to', 'from',
  'authentic', 'since', 'est', 'official', 'licensed', 'certified',
]);

/**
 * Common things people keep in totes. A printed line naming one of these ("AA Batteries",
 * "Duct Tape", "Extension Cord") is very likely the item itself.
 */
const ITEM_NOUNS = new Set([
  'battery', 'batteries', 'tape', 'cable', 'cables', 'cord', 'cords', 'charger', 'chargers', 'adapter', 'adapters',
  'wire', 'wires', 'plug', 'plugs', 'strip', 'extension', 'light', 'lights', 'bulb', 'bulbs', 'lamp', 'lantern',
  'flashlight', 'candle', 'candles', 'ornament', 'ornaments', 'wreath', 'garland', 'tinsel', 'stocking', 'stockings',
  'screw', 'screws', 'nail', 'nails', 'bolt', 'bolts', 'nut', 'nuts', 'washer', 'washers', 'anchor', 'anchors',
  'hook', 'hooks', 'hanger', 'hangers', 'bracket', 'brackets', 'hinge', 'hinges', 'drill', 'bits', 'bit', 'saw',
  'hammer', 'wrench', 'pliers', 'screwdriver', 'level', 'glue', 'adhesive', 'caulk', 'sealant', 'paint', 'brush',
  'brushes', 'roller', 'sandpaper', 'gloves', 'glove', 'mask', 'masks', 'goggles', 'filter', 'filters', 'fuse',
  'fuses', 'switch', 'outlet', 'timer', 'remote', 'controller', 'headphones', 'earbuds', 'speaker', 'mouse',
  'keyboard', 'router', 'modem', 'camera', 'phone', 'tablet', 'laptop', 'monitor', 'sensor', 'transmitter',
  'thermometer', 'scale', 'clock', 'watch', 'radio', 'mug', 'mugs', 'cup', 'cups', 'plate', 'plates', 'bowl', 'bowls',
  'container', 'containers', 'lid', 'lids', 'jar', 'jars', 'bottle', 'bottles', 'pan', 'pans', 'pot', 'pots', 'knife',
  'knives', 'utensils', 'towel', 'towels', 'blanket', 'blankets', 'sheet', 'sheets', 'pillow', 'pillowcase',
  'sweater', 'jacket', 'coat', 'shirt', 'shirts', 'pants', 'jeans', 'socks', 'shoes', 'boots', 'hat', 'hats', 'scarf',
  'book', 'books', 'notebook', 'binder', 'folder', 'folders', 'envelopes', 'pens', 'pencils', 'markers', 'crayons',
  'stapler', 'staples', 'scissors', 'ribbon', 'yarn', 'thread', 'fabric', 'toy', 'toys', 'puzzle', 'game', 'cards',
  'lego', 'doll', 'ball', 'balls', 'frisbee', 'tent', 'sleeping', 'cooler', 'tarp', 'rope', 'bungee', 'straps',
  'vase', 'frame', 'frames', 'album', 'photos', 'costume', 'decorations', 'lights', 'tree', 'stand', 'skirt',
  'soap', 'shampoo', 'toothbrush', 'razor', 'bandages', 'medicine', 'vitamins', 'sunscreen', 'spray', 'cleaner',
  'wipes', 'sponges', 'bags', 'wrap', 'foil', 'kit', 'set', 'pack', 'refill', 'refills', 'cartridge', 'ink', 'toner',
]);

/**
 * Friendlier names for the object detector's list (the 80 COCO kinds). `null` means it isn't
 * something you'd pack: people, animals, vehicles, furniture.
 */
const OBJECT_NAMES: Record<string, string | null> = {
  person: null, bicycle: 'Bicycle', car: null, motorbike: null, motorcycle: null, aeroplane: null, airplane: null,
  bus: null, train: null, truck: null, boat: null, trafficlight: null, firehydrant: null, stopsign: null,
  parkingmeter: null, bench: null, bird: null, cat: null, dog: null, horse: null, sheep: null, cow: null,
  elephant: null, bear: null, zebra: null, giraffe: null, chair: 'Chair', sofa: null, couch: null, bed: null,
  diningtable: null, toilet: null, pottedplant: 'Potted plant', tvmonitor: 'TV / monitor', tv: 'TV / monitor',
  cellphone: 'Phone', mobilephone: 'Phone', sportsball: 'Ball', teddybear: 'Stuffed animal', hairdrier: 'Hair dryer',
  hairdryer: 'Hair dryer', wineglass: 'Wine glass', baseballbat: 'Baseball bat', baseballglove: 'Baseball glove',
  tennisracket: 'Tennis racket', hotdog: null, pizza: null, donut: null, cake: null, sandwich: null, broccoli: null,
  carrot: null, orange: null, banana: null, apple: null, refrigerator: null, oven: null, sink: null,
};

function objectName(o: DetectedObject): string | null {
  // A closer look at just this spot often gives a more specific name ("Mug" rather than "Cup").
  const better = o.refined.find((r) => r.confidence >= 0.45 && !SKIP.has(r.label.toLowerCase()) && !CLUTTER.has(r.label.toLowerCase()));
  if (better) return friendly(better.label);
  const key = o.label.toLowerCase().replace(/[\s_-]+/g, '');
  if (key in OBJECT_NAMES) return OBJECT_NAMES[key];
  return friendly(o.label);
}

/**
 * Whether a cleaned packaging phrase could be an item name. Drops company names, legal and small
 * print ("Environmental Robotics", "Certificate of Calibration"); keeps phrases that name a thing
 * ("Duct Tape") or are big print of two or more words.
 */
export function plausiblePhrase(phrase: string, size?: number): boolean {
  const ws = phrase.toLowerCase().split(/[\s\-/&.]+/).filter(Boolean);
  if (ws.some((w) => PACKAGING_WORDS.has(w))) return false;
  // CamelCase run-ons ("AtlasScientific") are logos.
  if (ws.length === 1 && /[a-z][A-Z]/.test(phrase)) return false;
  if (ws.some((w) => ITEM_NOUNS.has(w))) return true;
  return ws.length >= 2 && size !== undefined && size >= 0.04;
}


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

  // Separate items the object detector outlined come first, grouped by name with a count ("Mug" x 2).
  const objects = new Map<string, { name: string; qty: number; best: number }>();
  for (const o of result.objects ?? []) {
    if (o.confidence < MIN_OBJECT_CONFIDENCE) continue;
    const name = objectName(o);
    if (!name) continue;
    const prev = objects.get(name.toLowerCase());
    objects.set(name.toLowerCase(), { name, qty: (prev?.qty ?? 0) + 1, best: Math.max(prev?.best ?? 0, o.confidence) });
  }
  for (const o of [...objects.values()].sort((a, b) => b.best - a.best).slice(0, MAX_OBJECTS)) {
    push({ name: o.name, from: 'object', sure: o.best >= SURE_OBJECT_CONFIDENCE, qty: o.qty });
  }

  const things = result.labels
    .filter((l) => !SKIP.has(l.label.toLowerCase()) && !CLUTTER.has(l.label.toLowerCase()))
    .map((l) => ({ ...l, score: l.confidence + Math.min(l.regions ?? 1, 4) * 0.04 }))
    .filter((l) => l.confidence >= 0.3 || (l.confidence >= 0.2 && (l.regions ?? 1) >= 2))
    .sort((a, b) => b.score - a.score);
  const photoStart = out.length;
  for (const l of things) {
    push({ name: friendly(l.label), from: 'photo', sure: l.confidence >= 0.6 || (l.confidence >= 0.45 && (l.regions ?? 1) >= 2), qty: 1 });
    if (out.length - photoStart >= 12) break;
  }

  // A jumbled photo where nothing stands out clearly gets one ticked catch-all, so one tap still records something.
  const lineCount = result.lines?.length ?? result.text.length;
  const cluttered = result.labels.some((l) => CLUTTER.has(l.label.toLowerCase()) && l.confidence >= 0.15) || lineCount >= BUSY_TEXT_LINES;
  if (!out.some((s) => s.sure) && (cluttered || out.length === 0 || out.length >= 4)) {
    out.unshift({ name: MIXED_ITEMS, from: 'fallback', sure: true, qty: 1 });
    seen.add(MIXED_ITEMS.toLowerCase());
  }

  const phrases = result.lines?.length
    ? mergeLines(result.lines.filter((l) => l.confidence >= 0.6)).sort((a, b) => b.size - a.size)
    : result.text.map((text) => ({ text, size: undefined }));
  let count = 0;
  for (const p of phrases) {
    const phrase = cleanPhrase(p.text);
    if (!phrase || !plausiblePhrase(phrase, p.size)) continue;
    push({ name: titleCase(phrase), from: 'text', sure: false, qty: 1 });
    if (++count >= 4) break;
  }
  return out;
}
