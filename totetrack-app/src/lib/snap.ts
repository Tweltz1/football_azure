import type { PhotoAnalysis } from '../../modules/tote-native';

/**
 * Apple's classifier names broad scenes and materials too ("indoor", "textile", "container").
 * Those aren't useful as tote items, so they're dropped.
 */
const TOO_GENERAL = new Set([
  'indoor', 'outdoor', 'structure', 'material', 'textile', 'container', 'box', 'cardboard_box', 'storage_box', 'plastic',
  'wood_processed', 'wood_natural', 'furniture', 'interior_room', 'room', 'floor', 'wall', 'shelf', 'table', 'people',
  'adult', 'child', 'hand', 'finger', 'machine', 'tool', 'equipment', 'object', 'art', 'decoration', 'pattern', 'texture',
  'shelves', 'document', 'paper', 'printed_page', 'text', 'screenshot', 'sky', 'land', 'consumer_electronics', 'liquid',
  'clothing', 'apparel', 'conveyance', 'vehicle', 'housewares', 'kitchenware', 'utensil', 'bag', 'black', 'white', 'color',
]);

function tidy(label: string): string {
  const s = label.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Turns what the iPhone saw into a short list of item names, best first, without duplicates. */
export function suggestionsFrom(result: PhotoAnalysis): { name: string; from: 'photo' | 'text' }[] {
  const seen = new Set<string>();
  const out: { name: string; from: 'photo' | 'text' }[] = [];
  const push = (name: string, from: 'photo' | 'text') => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, from });
  };
  for (const l of [...result.labels].sort((a, b) => b.confidence - a.confidence)) {
    if (TOO_GENERAL.has(l.label.toLowerCase())) continue;
    push(tidy(l.label), 'photo');
    if (out.length >= 15) break;
  }
  // Printed words on packaging ("AA Batteries", "Duct Tape"): keep short lines with real words.
  let textCount = 0;
  for (const line of result.text) {
    const s = line.replace(/\s+/g, ' ').trim();
    if (s.length < 3 || s.length > 32 || !/[a-z]{3}/i.test(s) || /^[\d\W]+$/.test(s)) continue;
    push(tidy(s.toLowerCase() === s || s.toUpperCase() === s ? s.toLowerCase() : s), 'text');
    if (++textCount >= 10) break;
  }
  return out;
}
