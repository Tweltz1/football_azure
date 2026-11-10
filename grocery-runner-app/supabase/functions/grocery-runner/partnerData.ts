// Partner stores: layouts and weekly deals that a store sends us itself. Pure logic, no Deno APIs,
// so the app's tests can run it too. The tables and endpoints are in partners.ts and ../store-portal.
import { cleanAisle, DEPARTMENTS, itemKey } from './votes.ts';

/** One line of a store's layout: a category (or product) and where it is. */
export type LayoutRow = { category: string; aisle?: string; department?: string };

/** One advertised item. Dates are YYYY-MM-DD. */
export type DealRow = { item: string; price?: string; starts?: string; ends?: string };

/** Store-submitted locations always beat shopper votes; this is what the app is told they "weigh". */
export const OFFICIAL_VOTES = 99;

/** How far (metres) an Apple Maps pin may be from the store's saved location and still be that store. */
export const SAME_STORE_METRES = 300;

const DEPARTMENT_WORDS: Record<string, string> = {
  produce: 'produce',
  fruit: 'produce',
  vegetables: 'produce',
  bakery: 'bakery',
  deli: 'deli',
  meat: 'meat',
  meats: 'meat',
  seafood: 'meat',
  butcher: 'meat',
  frozen: 'frozen',
  'frozen foods': 'frozen',
  dairy: 'dairy',
  pantry: 'pantry',
  grocery: 'pantry',
};

/** "Produce", "Frozen Foods" -> a department the app knows, else null. */
export function departmentFrom(text: string): string | null {
  const d = DEPARTMENT_WORDS[itemKey(text).replace(/ (department|dept|section)$/, '')];
  return d && DEPARTMENTS.includes(d) ? d : null;
}

/** Looks like an aisle rather than a product name: has a digit, is one letter, or says "aisle". */
function aisleFrom(text: string): string | null {
  const t = text.trim();
  if (!/\d/.test(t) && !/^[A-Za-z]$/.test(t) && !/^aisle\s/i.test(t)) return null;
  return cleanAisle(t);
}

// ---------------------------------------------------------------------------------------------
// CSV / pasted text

/** Splits CSV (quotes, commas or tabs) into rows of trimmed cells. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const delim = text.includes('\t') && !text.includes(',') ? '\t' : ',';
  let cell = '';
  let row: string[] = [];
  let quoted = false;
  const push = () => {
    row.push(cell.trim());
    cell = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell.trim()) quoted = true;
    else if (c === delim) push();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      push();
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += c;
  }
  push();
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const findCol = (header: string[], words: RegExp) => header.findIndex((h) => words.test(h.toLowerCase()));

/**
 * Reads a layout a store manager pasted or uploaded. Accepts, one entry per line:
 *   - a header row with "category"/"item"/"product" and "aisle" (and maybe "department") columns
 *   - "Cereal, 7" or "7, Cereal" (category and aisle in either order)
 *   - "Aisle 7: cereal, oatmeal, pop-tarts" or "7, cereal, oatmeal" (one aisle, many categories)
 *   - "Produce: apples, bananas" (a department instead of an aisle)
 * Returns the rows it understood and the lines it skipped.
 */
export function parseLayout(text: string): { rows: LayoutRow[]; skipped: string[] } {
  const rows: LayoutRow[] = [];
  const skipped: string[] = [];
  const add = (category: string, aisle: string | null, department: string | null) => {
    const name = category.trim();
    if (!itemKey(name) || (!aisle && !department)) return false;
    rows.push({ category: name, ...(aisle ? { aisle } : {}), ...(department ? { department } : {}) });
    return true;
  };
  // "Aisle 7: a, b" and "Produce - a, b" lines are not CSV; turn the label into a first cell.
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*((?:aisle\s*)?[A-Za-z0-9][A-Za-z0-9 ]{0,20}?)\s*(?:[:–—]|\s-\s)\s*/i, (_m, label) => `${label},`))
    .join('\n');
  const table = parseCsv(lines);
  if (!table.length) return { rows, skipped };

  const header = table[0].map((h) => h.toLowerCase());
  const catCol = findCol(header, /^(category|categories|item|items|product|products|name|description)s?$/);
  const aisleCol = findCol(header, /^(aisle|aisle ?(#|no|number)|location)$/);
  const deptCol = findCol(header, /^(department|dept|section|area)$/);
  if (catCol >= 0 && (aisleCol >= 0 || deptCol >= 0)) {
    for (const r of table.slice(1)) {
      const aisleText = aisleCol >= 0 ? (r[aisleCol] ?? '') : '';
      const deptText = deptCol >= 0 ? (r[deptCol] ?? '') : '';
      // The aisle column may name a department instead ("Produce").
      const aisleIsDept = departmentFrom(aisleText);
      const aisle = aisleIsDept ? null : cleanAisle(aisleText.replace(/^aisle\s*/i, ''));
      const dept = departmentFrom(deptText) ?? aisleIsDept;
      // A "category" cell may hold several, "cereal; oatmeal".
      const cats = (r[catCol] ?? '').split(';').filter((c) => c.trim());
      let ok = false;
      for (const c of cats) ok = add(c, aisle, dept) || ok;
      if (!ok) skipped.push(r.join(', '));
    }
    return { rows, skipped };
  }

  for (const r of table) {
    const cells = r.flatMap((c) => c.split(';')).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) {
      skipped.push(r.join(', '));
      continue;
    }
    const [first, ...rest] = cells;
    const last = cells[cells.length - 1];
    let ok = false;
    const firstAisle = aisleFrom(first);
    const firstDept = firstAisle ? null : departmentFrom(first);
    if (firstAisle || firstDept) {
      // "7, cereal, oatmeal" / "Produce, apples": one place, many categories.
      for (const c of rest) ok = add(c, firstAisle, firstDept) || ok;
    } else {
      const lastAisle = aisleFrom(last);
      const lastDept = lastAisle ? null : departmentFrom(last);
      if (lastAisle || lastDept) {
        // "Cereal, 7" / "Bananas, Produce" (a middle department column is allowed: "Ice cream, Frozen, 12").
        const midDept = cells.length > 2 ? departmentFrom(cells[cells.length - 2]) : null;
        const cats = cells.slice(0, midDept ? -2 : -1);
        for (const c of cats) ok = add(c, lastAisle, lastDept ?? midDept) || ok;
      }
    }
    if (!ok) skipped.push(r.join(', '));
  }
  return { rows, skipped };
}

/** "2026-11-15", "11/15", "11/15/2026", "Nov 15" -> "2026-11-15" (year from `today` when missing). */
export function parseDate(text: string, today: string): string | null {
  const t = text.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) return iso(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +today.slice(0, 4), +m[1], +m[2]);
  m = t.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  if (m && months.includes(m[1].toLowerCase())) {
    return iso(m[3] ? +m[3] : +today.slice(0, 4), months.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  }
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 2000 || y > 2100) return null;
  return date.toISOString().slice(0, 10);
}

export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const cleanPrice = (p: string) => p.trim().replace(/\s+/g, ' ').slice(0, 40);

/**
 * Reads a deals list: "item, price, ends" per line (header optional; "starts" column allowed).
 * A deal with no end date runs 7 days from `today`, a weekly ad.
 */
export function parseDeals(text: string, today: string): { rows: DealRow[]; skipped: string[] } {
  const rows: DealRow[] = [];
  const skipped: string[] = [];
  const table = parseCsv(text);
  if (!table.length) return { rows, skipped };
  const header = table[0].map((h) => h.toLowerCase());
  let itemCol = findCol(header, /^(item|items|product|products|name|description|deal)$/);
  let priceCol = findCol(header, /^(price|sale price|deal price|offer|sale)$/);
  let startCol = findCol(header, /^(start|starts|from|start date|valid from|begins)$/);
  let endCol = findCol(header, /^(end|ends|until|through|thru|end date|expires|valid until|valid through)$/);
  let body = table;
  if (itemCol >= 0) body = table.slice(1);
  else [itemCol, priceCol, endCol, startCol] = [0, 1, 2, -1];
  for (const r of body) {
    const item = (r[itemCol] ?? '').trim().slice(0, 80);
    if (!itemKey(item)) {
      if (r.some(Boolean)) skipped.push(r.join(', '));
      continue;
    }
    const endText = endCol >= 0 ? (r[endCol] ?? '') : '';
    const startText = startCol >= 0 ? (r[startCol] ?? '') : '';
    const ends = parseDate(endText, today);
    const starts = parseDate(startText, today);
    if ((endText.trim() && !ends) || (startText.trim() && !starts)) {
      skipped.push(r.join(', '));
      continue;
    }
    const price = priceCol >= 0 ? cleanPrice(r[priceCol] ?? '') : '';
    rows.push({
      item,
      ...(price ? { price } : {}),
      ...(starts ? { starts } : {}),
      ends: ends ?? addDays(starts ?? today, 6),
    });
  }
  return { rows, skipped };
}

// ---------------------------------------------------------------------------------------------
// Matching a shopper's list to a store's categories and deals

const SIZE = /^(\d+(\.\d+)?|\d+(oz|lb|lbs|ct|pk|g|kg|ml|l|qt|gal)|oz|lb|lbs|ct|pk|pack|count|ea|each|g|kg|ml|qt|gal|fl|for|per|or|and|the|of|a)$/;

/** "Tomatoes" = "tomato", "berries" = "berry", "eggs" = "egg". */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2);
  if (w.length > 4 && /(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Meaningful words of a name, stemmed, without sizes and filler. */
export function words(name: string): string[] {
  return [...new Set(itemKey(name).split(' ').filter((w) => w && !SIZE.test(w)).map(stem))];
}

/**
 * How well a store's name for something covers a shopper's item: 2 when every word of the store's name
 * is in the item ("frozen pizza" for "digiorno frozen pizza"), 1 when the item's words are most of the
 * store's name ("peanut butter" in "peanut butter & jelly"), else 0. "butter" alone does not match
 * "peanut butter & jelly", so it is not sent to the peanut butter aisle.
 */
function coverage(item: string[], theirs: string[]): number {
  if (!item.length || !theirs.length) return 0;
  const has = (ws: string[], w: string) => ws.includes(w);
  if (theirs.every((w) => has(item, w))) return 2;
  if (item.every((w) => has(theirs, w)) && item.length * 2 >= theirs.length) return 1;
  return 0;
}

/** The store's best category for an item, preferring full matches, then the most specific name. */
export function matchCategory<T extends { category: string }>(item: string, rows: T[]): T | null {
  const iw = words(item);
  let best: { row: T; score: number; size: number } | null = null;
  for (const row of rows) {
    const cw = words(row.category);
    const score = coverage(iw, cw);
    if (!score) continue;
    if (!best || score > best.score || (score === best.score && cw.length > best.size)) best = { row, score, size: cw.length };
  }
  return best?.row ?? null;
}

/** Deals for this list: item key -> the matching deal (best match per item). */
export function matchDeals<T extends { item: string }>(items: string[], deals: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const name of items) {
    const key = itemKey(name);
    if (!key || out[key]) continue;
    const iw = words(name);
    let best: { deal: T; score: number } | null = null;
    for (const d of deals) {
      const score = coverage(iw, words(d.item)) || coverage(words(d.item), iw);
      if (score && (!best || score > best.score)) best = { deal: d, score };
    }
    if (best) out[key] = best.deal;
  }
  return out;
}

/** "aldi:g43073xm89401" -> the Apple Maps position the app rounded into the key. */
export function keyPosition(storeKey: string): { chain: string; lat: number; lon: number } | null {
  const m = storeKey.match(/^([a-z]+):g(m?)(\d{1,6})x(m?)(\d{1,6})$/);
  if (!m) return null;
  return { chain: m[1], lat: (m[2] ? -1 : 1) * (+m[3] / 1000), lon: (m[4] ? -1 : 1) * (+m[5] / 1000) };
}

export function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const k = Math.PI / 180;
  const x = (b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}

export type PartnerStore = { id: string; name: string; chain: string; lat: number | null; lon: number | null; store_key: string | null };

/** Which partner store (if any) is the store the app means by this key. */
export function findPartner<T extends PartnerStore>(storeKey: string, partners: T[]): T | null {
  const exact = partners.find((p) => p.store_key === storeKey);
  if (exact) return exact;
  const pos = keyPosition(storeKey);
  if (!pos) return null;
  let best: { p: T; m: number } | null = null;
  for (const p of partners) {
    if (p.chain !== pos.chain || p.lat == null || p.lon == null) continue;
    const m = metresBetween(pos, { lat: p.lat, lon: p.lon });
    if (m <= SAME_STORE_METRES && (!best || m < best.m)) best = { p, m };
  }
  return best?.p ?? null;
}

/** Validates a layout sent as JSON rows, the same rules as a pasted one. */
export function cleanLayoutRows(rows: unknown): LayoutRow[] | null {
  if (!Array.isArray(rows)) return null;
  const out: LayoutRow[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') return null;
    const { category, aisle, department } = r as Record<string, unknown>;
    if (typeof category !== 'string' || !itemKey(category)) return null;
    const a = aisle == null || aisle === '' ? null : cleanAisle(String(aisle));
    const d = typeof department === 'string' && department ? departmentFrom(department) : null;
    if (aisle != null && aisle !== '' && !a) return null;
    if (!a && !d) return null;
    out.push({ category: category.trim().slice(0, 80), ...(a ? { aisle: a } : {}), ...(d ? { department: d } : {}) });
  }
  return out;
}

/** Validates deals sent as JSON rows. */
export function cleanDealRows(rows: unknown, today: string): DealRow[] | null {
  if (!Array.isArray(rows)) return null;
  const out: DealRow[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') return null;
    const { item, price, starts, ends } = r as Record<string, unknown>;
    if (typeof item !== 'string' || !itemKey(item)) return null;
    const s = starts == null || starts === '' ? null : parseDate(String(starts), today);
    const e = ends == null || ends === '' ? null : parseDate(String(ends), today);
    if ((starts && !s) || (ends && !e)) return null;
    const p = price == null ? '' : cleanPrice(String(price));
    out.push({ item: item.trim().slice(0, 80), ...(p ? { price: p } : {}), ...(s ? { starts: s } : {}), ends: e ?? addDays(s ?? today, 6) });
  }
  return out;
}
