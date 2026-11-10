// Turns Apple Vision's photo labels (ItemVisionPlugin in the iPhone app) into a Curbsy title, category and
// tags. Vision's labels are lower-case identifiers like "chair", "washing_machine" or "teddy_bear", each with
// a confidence from 0 to 1, and they include the scene too ("outdoor", "grass", "sky"), which we skip.

// Words that point to each category. A label matches when one of its words (or the whole label) is listed.
const CATEGORY_WORDS = {
  furniture: ['furniture', 'chair', 'sofa', 'couch', 'table', 'desk', 'bed', 'dresser', 'cabinet', 'cupboard', 'shelf',
    'bookshelf', 'bookcase', 'bench', 'stool', 'ottoman', 'wardrobe', 'mattress', 'nightstand', 'armchair', 'recliner',
    'futon', 'headboard', 'drawer', 'sideboard', 'hutch', 'cushion', 'pillow'],
  appliances: ['appliance', 'refrigerator', 'fridge', 'freezer', 'washing', 'washer', 'dryer', 'dishwasher', 'microwave',
    'oven', 'stove', 'heater', 'fan', 'air_conditioner', 'vacuum', 'humidifier', 'dehumidifier'],
  electronics: ['television', 'tv', 'computer', 'laptop', 'monitor', 'keyboard', 'printer', 'speaker', 'speakers',
    'phone', 'tablet', 'camera', 'console', 'game_console', 'stereo', 'radio', 'headphones', 'electronics', 'router',
    'projector', 'cable', 'watch', 'wristwatch', 'smartwatch', 'cellphone', 'battery', 'batteries', 'charger', 'flashlight'],
  home: ['lamp', 'light', 'chandelier', 'mirror', 'rug', 'carpet', 'curtain', 'blanket', 'vase', 'frame', 'picture_frame',
    'clock', 'kitchen', 'cookware', 'pot', 'pan', 'dish', 'dishware', 'plate', 'bowl', 'cup', 'mug', 'glass', 'utensil',
    'basket', 'box', 'storage', 'bin', 'trash', 'garbage', 'wastebasket', 'recycling', 'container', 'candle', 'decoration', 'artwork', 'painting', 'blender', 'toaster',
    'kettle', 'coffee'],
  kids: ['crib', 'stroller', 'pram', 'car_seat', 'high_chair', 'baby', 'diaper', 'playpen', 'bassinet'],
  clothing: ['clothing', 'clothes', 'shirt', 'jacket', 'coat', 'dress', 'pants', 'jeans', 'shoe', 'shoes', 'boot', 'boots',
    'sneaker', 'hat', 'sweater', 'hoodie', 'skirt', 'bag', 'handbag', 'backpack', 'purse', 'scarf'],
  books: ['book', 'books', 'magazine', 'record', 'vinyl', 'cd', 'dvd', 'comic'],
  sports: ['bicycle', 'bike', 'ball', 'basketball', 'football', 'soccer', 'baseball', 'golf', 'skateboard', 'skis', 'ski',
    'snowboard', 'kayak', 'canoe', 'treadmill', 'weights', 'dumbbell', 'exercise', 'tent', 'camping', 'fishing',
    'surfboard', 'helmet', 'scooter', 'sled', 'racket', 'tennis'],
  tools: ['tool', 'tools', 'hammer', 'saw', 'drill', 'wrench', 'screwdriver', 'ladder', 'toolbox', 'power_tool',
    'workbench', 'compressor', 'generator', 'tape_measure', 'measure', 'measuring', 'glue', 'adhesive', 'tape', 'pliers',
    'clamp', 'level', 'nail', 'nails', 'screw', 'screws', 'bolt', 'sandpaper', 'caulk', 'toolkit'],
  garden: ['lawn_mower', 'mower', 'plant', 'flowerpot', 'pot_plant', 'planter', 'wheelbarrow', 'hose', 'rake', 'shovel',
    'grill', 'barbecue', 'patio', 'garden', 'firewood', 'birdhouse'],
  building: ['lumber', 'wood', 'plank', 'brick', 'bricks', 'tile', 'tiles', 'door', 'window', 'pipe', 'paint', 'fence',
    'pallet', 'sink', 'toilet', 'bathtub', 'cabinetry', 'drywall', 'concrete', 'stone', 'tire', 'wheel'],
  toys: ['toy', 'toys', 'teddy_bear', 'doll', 'stuffed_animal', 'puzzle', 'game', 'board_game', 'lego', 'action_figure',
    'playhouse', 'swing'],
};

// Scene, people and very general labels: never the thing being given away.
const SKIP = new Set(['outdoor', 'indoor', 'sky', 'grass', 'tree', 'trees', 'road', 'street', 'sidewalk', 'structure',
  'building', 'house', 'housewares', 'room', 'interior_room', 'interior', 'floor', 'flooring', 'wall', 'ceiling', 'people',
  'person', 'adult', 'child', 'baby_face', 'face', 'hand', 'animal', 'dog', 'cat', 'pet', 'vehicle', 'car', 'land',
  'plant_other', 'foliage', 'yard', 'lawn', 'material', 'textile', 'wood_processed', 'wood_natural', 'raw_glass',
  'raw_metal', 'metal', 'plastic', 'document', 'screenshot', 'text', 'night_sky', 'snow', 'water', 'cloudy', 'sunset_sunrise',
  'liquid', 'machine', 'conveyance', 'equipment']);

// Labels that mean the photo isn't of a giveaway item (Curbsy doesn't list people or animals).
export const NOT_AN_ITEM = new Set(['people', 'person', 'adult', 'child', 'animal', 'dog', 'cat', 'pet', 'screenshot', 'document']);

const categoryOf = (label) => {
  const words = [label, ...label.split('_')];
  for (const [category, list] of Object.entries(CATEGORY_WORDS)) {
    if (words.some((w) => list.includes(w))) return category;
  }
  return null;
};

const human = (label) => {
  const s = label.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Vision's labels form a tree: a photo of a chair also gets "furniture" (with an equal or higher score), a
// watch gets "wearable", and so on. These broad parent labels only hint at the category; they never become
// the title, or every indoor photo would be called "Furniture".
const BROAD = new Set(['furniture', 'appliance', 'home_appliance', 'kitchen_appliance', 'electronics', 'consumer_electronics',
  'clothing', 'apparel', 'accessory', 'accessories', 'wearable', 'jewelry', 'tool', 'tools', 'hand_tool', 'power_tool', 'toy',
  'toys', 'container', 'housewares', 'kitchenware', 'cookware', 'tableware', 'dishware', 'utensil', 'decoration', 'machine',
  'equipment', 'sports_equipment', 'structure', 'object', 'device', 'appliances', 'vehicle', 'conveyance', 'household_items']);

// Friendlier titles and categories for labels that need it.
const NAMES = {
  trash_can: ['Trash can', 'home'], garbage_can: ['Trash can', 'home'], wastebasket: ['Trash can', 'home'],
  waste_container: ['Trash can', 'home'], recycling_bin: ['Recycling bin', 'home'],
  watch: ['Watch', 'electronics'], wristwatch: ['Watch', 'electronics'], smartwatch: ['Smartwatch', 'electronics'],
  television: ['TV', 'electronics'], tv: ['TV', 'electronics'], cellphone: ['Phone', 'electronics'], mobile_phone: ['Phone', 'electronics'],
  sofa: ['Couch', 'furniture'], teddy_bear: ['Teddy bear', 'toys'],
};

/** A specific label at least this sure becomes the title. Below it the title stays empty. */
export const TITLE_MIN = 0.2;
/** A broad label at least this sure can still pick the category. */
const HINT_MIN = 0.3;
/** Confidence above which Apple's guess is trusted without asking Gemini (only when Gemini backup is on). */
export const CONFIDENT = 0.35;

/**
 * From Vision labels [{ label, confidence }] to { title, category, tags, confidence, confident, person }.
 * The title is the most likely specific label ("Trash can", "Watch"), or empty when Apple isn't sure.
 * Returns null when nothing usable was found.
 */
export function fromAppleLabels(labels) {
  const list = (Array.isArray(labels) ? labels : [])
    .filter((l) => l && typeof l.label === 'string' && Number.isFinite(l.confidence))
    .map((l) => ({ label: l.label.toLowerCase(), confidence: l.confidence }))
    .sort((a, b) => b.confidence - a.confidence);
  const things = list.filter((l) => !SKIP.has(l.label) && !NOT_AN_ITEM.has(l.label));
  const specific = things.filter((l) => !BROAD.has(l.label));
  const best = specific.find((l) => l.confidence >= TITLE_MIN) || null;
  // A person in the frame is fine (a watch on a wrist); it only matters when there's no item at all.
  const person = !best && list.some((l) => NOT_AN_ITEM.has(l.label) && l.confidence >= 0.6);
  const named = best ? NAMES[best.label] : null;
  let category = named ? named[1] : best ? categoryOf(best.label) : null;
  if (!category) {
    const hint = things.find((l) => l.confidence >= HINT_MIN && categoryOf(l.label));
    category = hint ? categoryOf(hint.label) : null;
  }
  if (!best && !category) return person ? { title: '', category: '', tags: [], description: '', confidence: 0, confident: false, person } : null;
  const tags = [...new Set(specific
    .filter((l) => l.confidence >= 0.15)
    .slice(0, 6)
    .map((l) => (NAMES[l.label] ? NAMES[l.label][0].toLowerCase() : l.label.replace(/_/g, ' ')))
    .concat(category && category !== 'other' ? [category] : []))].slice(0, 10);
  return {
    title: best ? (named ? named[0] : human(best.label)) : '',
    label: best ? best.label : '',
    category: category || 'other',
    tags,
    description: '',
    confidence: best ? best.confidence : 0,
    confident: !!best && best.confidence >= CONFIDENT && !!category,
    person,
  };
}

// The bundled object detector (YOLOv3-Tiny, trained on the 80 COCO objects) finds separate items. Only the
// ones people give away count; people, animals, cars and food are ignored.
const OBJECTS = {
  chair: ['Chair', 'furniture'], couch: ['Couch', 'furniture'], sofa: ['Couch', 'furniture'], bed: ['Bed', 'furniture'],
  'dining table': ['Table', 'furniture'], diningtable: ['Table', 'furniture'], bench: ['Bench', 'furniture'],
  tv: ['TV', 'electronics'], tvmonitor: ['TV', 'electronics'], laptop: ['Laptop', 'electronics'], mouse: ['Computer mouse', 'electronics'],
  remote: ['Remote', 'electronics'], keyboard: ['Keyboard', 'electronics'], 'cell phone': ['Phone', 'electronics'],
  microwave: ['Microwave', 'appliances'], oven: ['Oven', 'appliances'], toaster: ['Toaster', 'home'], sink: ['Sink', 'building'],
  refrigerator: ['Refrigerator', 'appliances'], 'hair drier': ['Hair dryer', 'appliances'], toilet: ['Toilet', 'building'],
  book: ['Books', 'books'], clock: ['Clock', 'home'], vase: ['Vase', 'home'], 'potted plant': ['Potted plant', 'garden'],
  pottedplant: ['Potted plant', 'garden'], bottle: ['Bottles', 'home'], 'wine glass': ['Wine glasses', 'home'], cup: ['Cups', 'home'],
  bowl: ['Bowls', 'home'], fork: ['Silverware', 'home'], knife: ['Silverware', 'home'], spoon: ['Silverware', 'home'],
  scissors: ['Scissors', 'home'], 'teddy bear': ['Teddy bear', 'toys'], kite: ['Kite', 'toys'], frisbee: ['Frisbee', 'sports'],
  bicycle: ['Bicycle', 'sports'], motorcycle: ['Motorcycle', 'other'], motorbike: ['Motorcycle', 'other'], skis: ['Skis', 'sports'],
  snowboard: ['Snowboard', 'sports'], 'sports ball': ['Ball', 'sports'], 'baseball bat': ['Baseball bat', 'sports'],
  'baseball glove': ['Baseball glove', 'sports'], skateboard: ['Skateboard', 'sports'], surfboard: ['Surfboard', 'sports'],
  'tennis racket': ['Tennis racket', 'sports'], backpack: ['Backpack', 'clothing'], umbrella: ['Umbrella', 'clothing'],
  handbag: ['Handbag', 'clothing'], tie: ['Ties', 'clothing'], suitcase: ['Suitcase', 'clothing'],
};

/** Below this the detector's guess isn't shown. */
export const OBJECT_MIN = 0.4;

/**
 * From detector objects [{ label, confidence, box: { x, y, w, h } }] (box 0-1, top left origin) to the
 * separate items worth listing: [{ title, category, count, confidence, box }], best first, one entry per
 * kind of item (the box of the surest one), at most 6.
 */
export function spottedItems(objects) {
  const byTitle = new Map();
  for (const o of Array.isArray(objects) ? objects : []) {
    if (!o || typeof o.label !== 'string' || !(o.confidence >= OBJECT_MIN)) continue;
    const known = OBJECTS[o.label.toLowerCase().replace(/_/g, ' ')] || OBJECTS[o.label.toLowerCase()];
    if (!known) continue;
    const [title, category] = known;
    const prev = byTitle.get(title);
    if (prev) {
      prev.count += 1;
      prev.boxes.push(o.box || null);
      if (o.confidence > prev.confidence) Object.assign(prev, { confidence: o.confidence, box: o.box });
    } else {
      byTitle.set(title, { title, category, count: 1, confidence: o.confidence, box: o.box || null, boxes: [o.box || null] });
    }
  }
  return [...byTitle.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

/** Title for a spotted item, with the count when there are several ("3 Chairs"). */
export const spottedTitle = (s) => {
  if (s.count < 2 || /s$/.test(s.title)) return s.title;
  return `${s.count} ${s.title}${/(sh|ch|x)$/.test(s.title) ? 'es' : 's'}`;
};

const plugin = () => (typeof window !== 'undefined' && window.Capacitor?.Plugins?.ItemVision) || null;

/** True in iPhone app builds that have Apple detection. */
export const hasAppleDetection = () => !!plugin();

// One of a kind ("Bottle", not "Bottles") for a single detected thing.
const ONE = { Bottles: 'Bottle', Cups: 'Cup', Bowls: 'Bowl', 'Wine glasses': 'Wine glass', Books: 'Book', Ties: 'Tie' };

/** Intersection over union of two top-left boxes. */
const iou = (a, b) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter ? inter / (a.w * a.h + b.w * b.h - inter) : 0;
};
const isBox = (b) => b && [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0;

// Our own item namer (ml/item-namer, 485 kinds). Its top guess is trusted only when it's at least this sure:
// on test pictures it was right 86% of the time then (about 1 in 6 things), and 95% at 0.9.
export const NAMER_SURE = 0.7;
const CATEGORY_KEYS = new Set(['furniture', 'appliances', 'electronics', 'home', 'kids', 'clothing', 'books', 'sports', 'tools', 'garden', 'building', 'toys', 'other']);

/** The namer's guess when it's sure: { title, label, category, confidence, source: 'namer' }, or null. */
export function namerThing(namer) {
  const g = namer && Array.isArray(namer.guesses) ? namer.guesses[0] : null;
  if (!g || typeof g.title !== 'string' || !(g.confidence >= NAMER_SURE) || g.item === false) return null;
  return { title: g.title, label: g.label, category: CATEGORY_KEYS.has(g.category) ? g.category : 'other', confidence: g.confidence, source: 'namer' };
}

/** A name for one region from Apple's labels for just that part of the photo, even a broad one ("Tool"). */
function regionThing(region) {
  const sure = namerThing(region.namer);
  if (sure) return sure;
  const named = fromAppleLabels(region.labels);
  if (named && named.title && !named.person) return { title: named.title, label: named.label, category: named.category, confidence: named.confidence };
  const top = (Array.isArray(region.labels) ? region.labels : [])
    .filter((l) => l && typeof l.label === 'string' && l.confidence >= 0.3)
    .map((l) => l.label.toLowerCase())
    .find((l) => !SKIP.has(l) && !NOT_AN_ITEM.has(l) && !['object', 'household_items', 'structure'].includes(l));
  if (!top) return null;
  return { title: human(top), label: top, category: (named && named.category) || categoryOf(top) || 'other', confidence: 0.3 };
}

/**
 * Every separate thing in the photo, one entry each: [{ title, category, box, confidence }] (box 0-1, top left).
 * From the object detector (80 known kinds) and Apple's own "where are the things" regions, each named from
 * its own part of the photo. Apple's name wins where both found the same thing.
 */
export function thingsInPhoto(res) {
  const out = [];
  const add = (t) => {
    if (!t || !t.title || !isBox(t.box)) return;
    const same = out.findIndex((o) => iou(o.box, t.box) > 0.5);
    if (same >= 0) { if (t.fromApple && !out[same].fromApple) out[same] = t; return; }
    out.push(t);
  };
  for (const o of Array.isArray(res && res.objects) ? res.objects : []) {
    if (!o || typeof o.label !== 'string' || !(o.confidence >= OBJECT_MIN)) continue;
    const known = OBJECTS[o.label.toLowerCase().replace(/_/g, ' ')] || OBJECTS[o.label.toLowerCase()];
    if (known) add({ title: ONE[known[0]] || known[0], label: o.label, source: 'detector', category: known[1], box: o.box, confidence: o.confidence });
  }
  for (const r of Array.isArray(res && res.regions) ? res.regions : []) {
    const named = r && regionThing(r);
    if (named) add({ ...named, source: named.source || 'region', box: r.box, fromApple: true });
  }
  // Left to right, top to bottom, the way people read the photo.
  return out
    .sort((a, b) => (Math.abs(a.box.y - b.box.y) > 0.25 ? a.box.y - b.box.y : a.box.x - b.box.x))
    .slice(0, 12)
    .map(({ fromApple, ...t }) => t);
}

/** Asks Apple Vision on the phone what's in the photo (a JPEG data URL). Null when it can't tell. */
export async function appleDetect(jpegDataUrl) {
  const ItemVision = plugin();
  if (!ItemVision) return null;
  try {
    const res = await ItemVision.classify({ image: jpegDataUrl });
    const things = thingsInPhoto(res);
    const apple = fromAppleLabels(res && res.labels);
    // The namer's name for a photo of one thing, when it's sure; Apple's tags and description stay.
    const sure = namerThing(res && res.namer);
    const whole = sure && !(apple && apple.person)
      ? { ...(apple || { tags: [], description: '', person: false }), ...sure, confident: true,
        tags: [...new Set([sure.title.toLowerCase(), ...((apple && apple.tags) || [])])].slice(0, 10) }
      : apple;
    if (things.length >= 2) {
      // Several things: no one name for the whole photo (the post is named after what's in it).
      return {
        title: '', category: things[0].category, description: '', person: false, confidence: things[0].confidence, confident: true,
        tags: [...new Set([...things.map((x) => x.title.toLowerCase()), ...((whole && whole.tags) || [])])].slice(0, 10),
        things,
      };
    }
    if (things.length === 1 && (!whole || !whole.title || whole.confidence < things[0].confidence)) {
      const t = things[0];
      return {
        ...(whole || { tags: [], description: '', person: false }), title: t.title, label: t.label, source: t.source, box: t.box,
        category: t.category, confidence: t.confidence, confident: t.confidence >= CONFIDENT, person: false,
      };
    }
    return whole && { ...whole, source: whole.source || 'photo' };
  } catch (error) {
    return null;
  }
}
