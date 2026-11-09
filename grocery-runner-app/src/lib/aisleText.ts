// Reads aisle numbers out of screenshots from store apps (Walmart: "Aisle A38", "Section 3";
// Woodman's: "Aisle U - Shelf A02") and matches them to items on the list. Pure logic, no React.
import type { TextLine } from '../../modules/recipe-reader';
import { ListItem } from './types';

export type FoundAisle = { aisle: string; bay?: number; /** Text of the product card it belongs to. */ context: string };
export type AisleMatch = { item: ListItem; aisle: string; bay?: number };

// "Aisle" in any case, then a code: A38, 14, 14B, U. Letter-only codes must be capitals so
// "Aisle unavailable" or "aisle info" are not read as aisles.
const AISLE = /\b[Aa][Ii][Ss][Ll][Ee]\s*[:#-]?\s*([A-Za-z]{1,2}\s?\d{1,3}[A-Za-z]?|\d{1,3}[A-Za-z]?|[A-Z]{1,2})(?![A-Za-z0-9])/;
const SECTION = /\b(?:section|bay)\s*[:#-]?\s*(\d{1,3})\b/i;

const STOP = new Set(['the', 'and', 'with', 'for', 'of', 'a', 'an', 'oz', 'lb', 'ct', 'pack', 'great', 'value', 'fresh']);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

/**
 * Every aisle mention in the screenshot, each with the text of its product card: the lines from just
 * after the previous aisle mention down to this one (search results list one card per product), or
 * the whole screenshot when there is only one aisle (a product page).
 */
export function findAisles(lines: TextLine[]): FoundAisle[] {
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const hits: { index: number; aisle: string; bay?: number }[] = [];
  sorted.forEach((line, index) => {
    const m = line.text.match(AISLE);
    if (!m) return;
    const aisle = m[1].replace(/\s+/g, '').toUpperCase();
    // Section is usually on the same line or the next one.
    const sec = line.text.match(SECTION) ?? sorted[index + 1]?.text.match(SECTION);
    hits.push({ index, aisle, bay: sec ? parseInt(sec[1], 10) : undefined });
  });
  return hits.map((h, i) => {
    const from = hits.length === 1 ? 0 : i === 0 ? 0 : hits[i - 1].index + 1;
    const to = hits.length === 1 ? sorted.length : h.index + 1;
    return { aisle: h.aisle, bay: h.bay, context: sorted.slice(from, to).map((l) => l.text).join(' ') };
  });
}

/** True when every word of the item name appears in the product text ("milk" in "Whole Milk, 1 Gallon"). */
export function nameMatches(itemName: string, text: string): boolean {
  const need = words(itemName);
  if (!need.length) return false;
  const have = new Set(words(text));
  return need.every((w) => have.has(w));
}

/**
 * Pairs found aisles with list items. With `onlyItem` (opened from one item), the first aisle in the
 * screenshot goes to that item. Otherwise each product card goes to the list item whose name it contains.
 */
export function matchAisles(found: FoundAisle[], items: ListItem[], onlyItem?: ListItem): AisleMatch[] {
  if (onlyItem) {
    const best = found.find((f) => nameMatches(onlyItem.name, f.context)) ?? found[0];
    return best ? [{ item: onlyItem, aisle: best.aisle, bay: best.bay }] : [];
  }
  const out: AisleMatch[] = [];
  for (const f of found) {
    const item = items.find((i) => !out.some((o) => o.item.id === i.id) && nameMatches(i.name, f.context));
    if (item) out.push({ item, aisle: f.aisle, bay: f.bay });
  }
  return out;
}
