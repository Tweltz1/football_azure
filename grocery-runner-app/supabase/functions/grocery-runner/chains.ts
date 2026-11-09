// Which supported chain an OpenStreetMap shop belongs to. Pure logic, shared with the app's tests.

export type Chain = 'kroger' | 'walmart' | 'target' | 'hyvee' | 'costco' | 'aldi' | 'woodmans';

// Kroger runs many banners; all of them are served by the Kroger API.
const KROGER_BANNERS = [
  'kroger', "fry's", 'frys food', 'king soopers', 'ralphs', "smith's", 'fred meyer', 'harris teeter', 'dillons',
  'qfc', "mariano's", "pick 'n save", 'pick n save', 'metro market', 'city market', 'food 4 less', 'foods co',
  "baker's", 'gerbes', 'jay c', 'pay less', 'ruler foods',
];

const norm = (s: string) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();

/** Uses OSM's brand tag first, then the shop name. Returns null for chains we don't support. */
export function chainOf(tags: Record<string, string | undefined>): Chain | null {
  const text = norm(`${tags.brand ?? ''} | ${tags.name ?? ''}`);
  if (/sam'?s club|walmart (neighborhood )?pharmacy|fuel|gas station/.test(text)) return null;
  if (/\bwalmart\b/.test(text)) return 'walmart';
  if (/\btarget\b/.test(text)) return 'target';
  if (/\bhy-?vee\b/.test(text)) return 'hyvee';
  if (/\bcostco\b/.test(text)) return 'costco';
  if (/\baldi\b/.test(text)) return 'aldi';
  if (/\bwoodman'?s\b/.test(text)) return 'woodmans';
  if (KROGER_BANNERS.some((b) => text.includes(b))) return 'kroger';
  return null;
}

/** "walmart:osm-n123456": a stable id for a store found on OpenStreetMap. */
export const osmStoreKey = (chain: Chain, type: string, id: number) => `${chain}:osm-${type[0]}${id}`;
