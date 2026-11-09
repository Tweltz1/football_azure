// Which supported chain a place found on Apple Maps belongs to, from its name.

export type Chain = 'kroger' | 'walmart' | 'target' | 'hyvee' | 'costco' | 'aldi' | 'woodmans';

/** Search words for Apple Maps, one search per entry. */
export const SEARCHES: string[] = [
  'Walmart Supercenter', 'Target', 'Hy-Vee', 'Costco', 'Aldi', "Woodman's Market", 'Kroger', "Pick 'n Save", "Mariano's",
  "Fry's Food", 'King Soopers', 'Ralphs', "Smith's Food", 'Fred Meyer', 'Harris Teeter', 'Dillons',
];

// Kroger runs many banners; all of them are served by the Kroger API.
const KROGER_BANNERS = [
  'kroger', "fry's", 'frys food', 'king soopers', 'ralphs', "smith's", 'fred meyer', 'harris teeter', 'dillons',
  'qfc', "mariano's", "pick 'n save", 'pick n save', 'metro market', 'city market', 'food 4 less', 'foods co',
  "baker's", 'gerbes', 'jay c', 'pay less', 'ruler foods',
];

const norm = (s: string) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();

/** Returns null for places that aren't a supported grocery chain (gas stations, pharmacies, Sam's Club). */
export function chainOf(name: string): Chain | null {
  const text = norm(name);
  if (/sam'?s club|pharmacy|fuel|gas|optical|vision|tire|auto care|photo|liquor/.test(text)) return null;
  if (/\bwalmart\b/.test(text)) return 'walmart';
  if (/\btarget\b/.test(text)) return 'target';
  if (/\bhy-?vee\b/.test(text)) return 'hyvee';
  if (/\bcostco\b/.test(text)) return 'costco';
  if (/\baldi\b/.test(text)) return 'aldi';
  if (/\bwoodman'?s\b/.test(text)) return 'woodmans';
  if (KROGER_BANNERS.some((b) => text.includes(b))) return 'kroger';
  return null;
}

/**
 * A stable id for a store found on Apple Maps, from its position rounded to about 100 m:
 * "aldi:g43073xm89401" is the Aldi at 43.073, -89.401.
 */
export function placeStoreKey(chain: Chain, lat: number, lon: number): string {
  const part = (v: number) => (v < 0 ? 'm' : '') + Math.abs(Math.round(v * 1000));
  return `${chain}:g${part(lat)}x${part(lon)}`;
}

/** Metres between two points (good enough for "is this the same store"). */
export function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const k = Math.PI / 180;
  const x = (b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}
