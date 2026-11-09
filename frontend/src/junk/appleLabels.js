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
    'projector', 'cable'],
  home: ['lamp', 'light', 'chandelier', 'mirror', 'rug', 'carpet', 'curtain', 'blanket', 'vase', 'frame', 'picture_frame',
    'clock', 'kitchen', 'cookware', 'pot', 'pan', 'dish', 'dishware', 'plate', 'bowl', 'cup', 'mug', 'glass', 'utensil',
    'basket', 'box', 'storage', 'bin', 'container', 'candle', 'decoration', 'artwork', 'painting', 'blender', 'toaster',
    'kettle', 'coffee'],
  kids: ['crib', 'stroller', 'pram', 'car_seat', 'high_chair', 'baby', 'diaper', 'playpen', 'bassinet'],
  clothing: ['clothing', 'clothes', 'shirt', 'jacket', 'coat', 'dress', 'pants', 'jeans', 'shoe', 'shoes', 'boot', 'boots',
    'sneaker', 'hat', 'sweater', 'hoodie', 'skirt', 'bag', 'handbag', 'backpack', 'purse', 'scarf'],
  books: ['book', 'books', 'magazine', 'record', 'vinyl', 'cd', 'dvd', 'comic'],
  sports: ['bicycle', 'bike', 'ball', 'basketball', 'football', 'soccer', 'baseball', 'golf', 'skateboard', 'skis', 'ski',
    'snowboard', 'kayak', 'canoe', 'treadmill', 'weights', 'dumbbell', 'exercise', 'tent', 'camping', 'fishing',
    'surfboard', 'helmet', 'scooter', 'sled', 'racket', 'tennis'],
  tools: ['tool', 'tools', 'hammer', 'saw', 'drill', 'wrench', 'screwdriver', 'ladder', 'toolbox', 'power_tool',
    'workbench', 'compressor', 'generator'],
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
  'liquid', 'machine', 'conveyance', 'equipment', 'consumer_electronics', 'container', 'decoration']);

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

/** Confidence above which Apple's best guess is used without asking Gemini. */
export const CONFIDENT = 0.35;

/**
 * From Vision labels [{ label, confidence }] to { title, category, tags, confidence, confident, person }.
 * Returns null when nothing usable was found.
 */
export function fromAppleLabels(labels) {
  const list = (Array.isArray(labels) ? labels : [])
    .filter((l) => l && typeof l.label === 'string' && Number.isFinite(l.confidence))
    .map((l) => ({ label: l.label.toLowerCase(), confidence: l.confidence }))
    .sort((a, b) => b.confidence - a.confidence);
  const person = list.some((l) => NOT_AN_ITEM.has(l.label) && l.confidence >= 0.6);
  const things = list.filter((l) => !SKIP.has(l.label));
  if (!things.length) return null;
  // The best label that maps to a category wins; otherwise the best label at all.
  const known = things.filter((l) => categoryOf(l.label));
  const best = known.find((l) => l.confidence >= 0.15) || things[0];
  const category = categoryOf(best.label) || 'other';
  const tags = [...new Set(things
    .filter((l) => l.confidence >= 0.1)
    .slice(0, 8)
    .map((l) => l.label.replace(/_/g, ' '))
    .concat(category === 'other' ? [] : [category]))].slice(0, 10);
  return {
    title: human(best.label),
    category,
    tags,
    description: '',
    confidence: best.confidence,
    confident: best.confidence >= CONFIDENT && categoryOf(best.label) !== null && !person,
    person,
  };
}

const plugin = () => (typeof window !== 'undefined' && window.Capacitor?.Plugins?.ItemVision) || null;

/** True in iPhone app builds that have Apple detection. */
export const hasAppleDetection = () => !!plugin();

/** Asks Apple Vision on the phone what's in the photo (a JPEG data URL). Null when it can't tell. */
export async function appleDetect(jpegDataUrl) {
  const ItemVision = plugin();
  if (!ItemVision) return null;
  try {
    const res = await ItemVision.classify({ image: jpegDataUrl });
    return fromAppleLabels(res && res.labels);
  } catch (error) {
    return null;
  }
}
