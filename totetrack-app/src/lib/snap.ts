import type { DetectedObject, PhotoAnalysis } from '../../modules/tote-native';

/** `object`: an item the detector outlined on its own; `photo`: a label for the whole photo; `text`: read off packaging. */
export type SnapSuggestion = { name: string; from: 'object' | 'photo' | 'text' | 'fallback'; on: boolean; qty: number };

/** What we offer when the photo is a jumble and nothing stands out clearly. */
export const MIXED_ITEMS = 'Box of mixed items';

/** Below this, Apple's photo labels are mostly guesses ("Portal" and "Door" for a box of stuff). */
const MIN_PHOTO_CONFIDENCE = 0.3;
/** At or above this, a photo label is ticked for you. Between the two it's offered but left unticked. */
const SURE_PHOTO_CONFIDENCE = 0.55;
const MAX_PHOTO = 8;
const MAX_TEXT = 4;
const MAX_OBJECTS = 10;
/** Detected items at or above this are ticked for you. */
const SURE_OBJECT_CONFIDENCE = 0.5;
const MIN_OBJECT_CONFIDENCE = 0.3;
/** Lots of separate print in one photo means lots of separate packaging, so the tote is a mix. */
const BUSY_TEXT_LINES = 8;

/**
 * Apple's classifier names scenes, rooms, building parts and materials too ("indoor", "door",
 * "textile"). None of those are things you'd pack in a tote, so they're never offered.
 */
const NOT_AN_ITEM = new Set([
  // scenes, rooms and building parts
  'indoor', 'outdoor', 'structure', 'interior_room', 'room', 'floor', 'wall', 'ceiling', 'shelf', 'shelves',
  'portal', 'door', 'doorway', 'window', 'gate', 'entrance', 'arch', 'archway', 'building', 'architecture', 'house',
  'stairs', 'staircase', 'hallway', 'office', 'kitchen', 'bathroom', 'bedroom', 'living_room', 'garage', 'warehouse',
  'store', 'shop', 'retail', 'restaurant', 'sky', 'land', 'grass', 'plant', 'tree', 'water', 'liquid', 'cityscape',
  // materials, colours and textures
  'material', 'textile', 'fabric', 'plastic', 'plastic_wrap', 'cellophane', 'foil', 'wood_processed', 'wood_natural',
  'wood', 'metal', 'glass', 'paper', 'cardboard', 'pattern', 'texture', 'black', 'white', 'blue', 'color', 'sheet',
  // too broad to be an item name
  'container', 'box', 'cardboard_box', 'storage_box', 'crate', 'carton', 'package', 'packaging', 'parcel', 'bag',
  'furniture', 'table', 'machine', 'tool', 'equipment', 'object', 'art', 'decoration', 'document', 'printed_page',
  'text', 'screenshot', 'consumer_electronics', 'clothing', 'apparel', 'conveyance', 'vehicle', 'housewares',
  'kitchenware', 'utensil', 'food', 'tableware', 'dishware', 'office_supplies', 'stationery', 'sign', 'logo', 'label',
  'drawing', 'sketch', 'illustration', 'cartoon', 'poster',
  // people
  'people', 'adult', 'child', 'hand', 'finger', 'arm', 'leg', 'foot', 'face', 'portrait',
]);

/** Labels Apple uses when the scene is a jumble. If one of these comes back, the photo is a mix. */
const CLUTTER = new Set(['clutter', 'mess', 'junk', 'debris', 'rubble', 'garbage', 'trash', 'waste', 'recycling', 'pile', 'heap']);

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

function tidy(label: string): string {
  const s = label.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function words(s: string): string[] {
  return s.toLowerCase().split(/[\s\-/&.]+/).filter(Boolean);
}

/**
 * Cleans one printed line and decides whether it could be an item name. Returns null for
 * OCR noise ("(7) «Ichy"), cut-off fragments ("Olive K"), company names and small print.
 */
export function plausibleText(raw: string, height?: number): { name: string; score: number } | null {
  let s = raw.replace(/[®™©℠]/g, '').replace(/\s+/g, ' ').trim();
  // Leading list numbers and bullets: "1 Certificate of Calibration", "• Duct tape".
  s = s.replace(/^(\d{1,2}[.)]?|[•·*\-–—])\s+/, '').trim();
  if (s.length < 3 || s.length > 32) return null;
  // Anything beyond letters, digits, spaces and - & ' . / is usually a misread.
  if (/[^A-Za-z0-9 \-&'./]/.test(s)) return null;
  const parts = s.split(' ');
  if (parts.length > 5) return null;
  // Every word needs a vowel or to be a short code like "AA", "9V", "USB-C"; single loose letters mean a cut-off line.
  for (const w of parts) {
    if (w.length === 1 && !/^[aA&0-9]$/.test(w)) return null;
    if (/^[A-Za-z]{4,}$/.test(w) && !/[aeiouy]/i.test(w)) return null;
  }
  const letters = (s.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 3 || letters / s.replace(/ /g, '').length < 0.6) return null;
  const ws = words(s);
  if (ws.some((w) => PACKAGING_WORDS.has(w))) return null;
  // CamelCase run-ons ("AtlasScientific") are logos, not item names.
  if (parts.length === 1 && /[a-z][A-Z]/.test(s)) return null;

  const namesAnItem = ws.some((w) => ITEM_NOUNS.has(w));
  const bigPrint = height !== undefined && height >= 0.04;
  // A single word only counts when it names a thing ("Batteries"); lone brand words ("Garden") don't.
  if (!namesAnItem && (parts.length < 2 || !bigPrint)) return null;

  // ALL CAPS print reads better in sentence case, but keep codes like "AA", "9V" and "USB" as printed.
  const name =
    s === s.toUpperCase() || s === s.toLowerCase()
      ? tidy(parts.map((w) => (keepCaps(w) ? w : w.toLowerCase())).join(' '))
      : tidy(s);
  return { name, score: (namesAnItem ? 1 : 0) + (height ?? 0) * 5 };
}

const SMALL_WORDS = new Set(['of', 'to', 'in', 'on', 'at', 'by', 'or', 'an', 'is', 'it', 'my', 'and', 'the', 'for', 'new', 'use', 'all']);
/** Short codes like "AA", "9V", "USB", "TV" stay in capitals. */
function keepCaps(w: string): boolean {
  if (w !== w.toUpperCase() || !/[A-Z]/.test(w) || w.length > 4 || SMALL_WORDS.has(w.toLowerCase())) return false;
  return /\d/.test(w) || w.length <= 2 || !/[AEIOU]/.test(w);
}

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
  const better = o.refined.find(
    (r) => r.confidence >= 0.45 && !NOT_AN_ITEM.has(r.label.toLowerCase()) && !CLUTTER.has(r.label.toLowerCase()),
  );
  if (better) return tidy(better.label);
  const key = o.label.toLowerCase().replace(/[\s_-]+/g, '');
  if (key in OBJECT_NAMES) return OBJECT_NAMES[key];
  return tidy(o.label);
}

/** Turns what the iPhone saw into a short list of item names, best first, without duplicates. */
export function suggestionsFrom(result: PhotoAnalysis): SnapSuggestion[] {
  const labels = [...result.labels].sort((a, b) => b.confidence - a.confidence);
  const textLines = result.textInfo ?? result.text.map((text) => ({ text, confidence: 1, height: undefined as number | undefined }));

  const photo = labels.filter((l) => l.confidence >= MIN_PHOTO_CONFIDENCE && !NOT_AN_ITEM.has(l.label.toLowerCase()) && !CLUTTER.has(l.label.toLowerCase()));
  const text = textLines
    .map((l) => plausibleText(l.text, l.height))
    .filter((t): t is { name: string; score: number } => t !== null)
    .sort((a, b) => b.score - a.score);

  // Separate items the detector outlined, grouped by name with a count ("Cup" x 3).
  const objects = new Map<string, { name: string; qty: number; best: number }>();
  for (const o of result.objects ?? []) {
    if (o.confidence < MIN_OBJECT_CONFIDENCE) continue;
    const name = objectName(o);
    if (!name) continue;
    const key = name.toLowerCase();
    const prev = objects.get(key);
    objects.set(key, { name, qty: (prev?.qty ?? 0) + 1, best: Math.max(prev?.best ?? 0, o.confidence) });
  }
  const found = [...objects.values()].sort((a, b) => b.best - a.best).slice(0, MAX_OBJECTS);
  const sureObjects = found.filter((o) => o.best >= SURE_OBJECT_CONFIDENCE);

  const sure = photo.filter((l) => l.confidence >= SURE_PHOTO_CONFIDENCE);
  const looksCluttered =
    labels.some((l) => CLUTTER.has(l.label.toLowerCase()) && l.confidence >= 0.15) ||
    textLines.length >= BUSY_TEXT_LINES ||
    sure.length === 0;

  const seen = new Set<string>();
  const out: SnapSuggestion[] = [];
  const push = (s: SnapSuggestion) => {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  // Items found one by one come first; they're the most reliable.
  for (const o of found) push({ name: o.name, from: 'object', on: o.best >= SURE_OBJECT_CONFIDENCE, qty: o.qty });
  // A jumbled photo where nothing was picked out clearly gets one catch-all entry, ticked,
  // so one tap still records something useful.
  if (looksCluttered && sureObjects.length === 0) push({ name: MIXED_ITEMS, from: 'fallback', on: true, qty: 1 });
  for (const l of photo.slice(0, MAX_PHOTO)) {
    push({ name: tidy(l.label), from: 'photo', on: !looksCluttered && sureObjects.length === 0 && l.confidence >= SURE_PHOTO_CONFIDENCE, qty: 1 });
  }
  for (const t of text.slice(0, MAX_TEXT)) push({ name: t.name, from: 'text', on: false, qty: 1 });
  return out;
}
