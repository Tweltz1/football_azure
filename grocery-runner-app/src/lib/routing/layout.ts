import type { StoreProfile } from '../storeProfile';
import { Cell, Department, ItemLocation } from '../types';
import { StoreGrid } from './grid';

/**
 * A generic US grocery floor plan, built from the number of aisles.
 * Used for every store until a real floor plan exists for it.
 *
 *   back wall:  MEAT / SEAFOOD
 *   +---------------------------------------+
 *   |D |  |  |  |  ...  |  |  |  | DELI    |
 *   |A |1 |2 |3 |       |  |  |N | BAKERY  |
 *   |I |  |  |  |       |  |  |  | PRODUCE |
 *   |R  front cross-aisle                  |
 *   +---- checkout ------------- entrance --+
 *
 * Aisle 1 sits on the left next to dairy and is used for frozen when an item
 * has no aisle number. Numbered aisles run front to back. Paper & cleaning, pet, health & beauty
 * and baby get aisles of their own (see departmentCell) until shoppers' answers place them.
 *
 * Two things can adjust it per store:
 * - `profile`: departments shoppers have placed in numbered aisles move there (storeProfile.ts).
 * - `mirror`: the whole plan flipped left to right, for stores whose entrance is on the left
 *   (from the building outline, footprint.ts). The grid itself is symmetric, so only cells move.
 */
export type StoreLayout = {
  grid: StoreGrid;
  aisleCount: number;
  entrance: Cell;
  checkout: Cell;
  /** Walkway cell for each numbered aisle (1-based) at a given bay. */
  aisleCell: (aisle: number, bay?: number) => Cell;
  departmentCell: Record<Department, Cell>;
  /** Shelf cells per department wall, for drawing the map. */
  labels: { text: string; at: Cell }[];
  /** Department areas along the walls and front, for drawing: corners inclusive, `side` sets the text direction. */
  zones?: Zone[];
  /** Aisle names at the front end of each aisle ("1", "2", "A"). */
  aisleMarks?: { text: string; at: Cell }[];
  /** Short lettered aisles in front of the checkouts (Woodman's A-Z). */
  letterCell?: (letter: string) => Cell | null;
  /** Spots with a name instead of a number ("SODA"). */
  named?: Record<string, Cell>;
  /** Wall aisles: numbered aisles that are really wall cases (Woodman's 24-26 frozen). */
  wallAisles?: Record<number, Cell>;
  /** The store's own floor plan was used (not the generic one). */
  planName?: string;
};

export type Zone = { text: string; x1: number; y1: number; x2: number; y2: number; side: 'left' | 'right' | 'back' | 'front' };

const FRONT_ROWS = 2; // y = 0 and 1 are the front cross-aisle
const SHELF_LENGTH = 12; // cells per aisle run
export const MAX_BAY = SHELF_LENGTH;

export type LayoutOptions = { profile?: StoreProfile; mirror?: boolean };

export function buildGenericLayout(aisleCount: number, opts: LayoutOptions = {}): StoreLayout {
  const n = Math.max(1, Math.floor(aisleCount));
  // x: 0 dairy wall, 1 left walkway, then shelf/aisle pairs, right walkway, produce wall.
  const width = 2 * n + 5;
  const height = FRONT_ROWS + SHELF_LENGTH + 2; // + back walkway + meat wall
  const grid = new StoreGrid(width, height);

  const shelfTop = FRONT_ROWS;
  const shelfBottom = FRONT_ROWS + SHELF_LENGTH - 1;
  const backWalk = shelfBottom + 1;
  const backWall = height - 1;
  const rightWalk = width - 2;

  // Perimeter walls (department cases).
  grid.blockRect(0, FRONT_ROWS, 0, backWall); // dairy (left)
  grid.blockRect(0, backWall, width - 1, backWall); // meat (back)
  grid.blockRect(width - 1, FRONT_ROWS, width - 1, backWall); // produce / bakery / deli (right)

  // Gondolas: even x between the aisles, from x = 2 to x = 2n + 2.
  for (let x = 2; x <= 2 * n + 2; x += 2) grid.blockRect(x, shelfTop, x, shelfBottom);

  const m = (c: Cell): Cell => (opts.mirror ? { x: width - 1 - c.x, y: c.y } : c);

  const aisleCell = (aisle: number, bay = Math.ceil(SHELF_LENGTH / 2)): Cell => {
    const a = Math.min(Math.max(1, Math.round(aisle)), n);
    const b = Math.min(Math.max(1, Math.round(bay)), SHELF_LENGTH);
    return m({ x: 2 * a + 1, y: shelfTop + b - 1 });
  };

  const mid = (a: number, b: number) => Math.floor((a + b) / 2);
  // Non-food aisles until the store's own answers place them: paper/cleaning and pet toward the frozen
  // side, health & beauty and baby toward the entrance (where the pharmacy usually is). Aisle 1 stays frozen.
  const share = (f: number) => aisleCell(Math.min(n, Math.max(n >= 3 ? 2 : 1, Math.round(n * f))));
  const departmentCell: Record<Department, Cell> = {
    produce: m({ x: rightWalk, y: shelfTop + 2 }),
    bakery: m({ x: rightWalk, y: mid(shelfTop, shelfBottom) + 1 }),
    deli: m({ x: rightWalk, y: shelfBottom }),
    meat: m({ x: mid(1, rightWalk), y: backWalk }),
    pantry: aisleCell(Math.ceil(n / 2)),
    frozen: aisleCell(1),
    dairy: m({ x: 1, y: mid(shelfTop, shelfBottom) }),
    other: aisleCell(Math.ceil(n / 2)),
    household: share(0.3),
    pet: share(0.2),
    health: share(0.8),
    baby: share(0.7),
  };
  const wallLabels: { dept: Department; text: string; at: Cell }[] = [
    { dept: 'dairy', text: 'Dairy', at: m({ x: 0, y: mid(shelfTop, backWall) }) },
    { dept: 'meat', text: 'Meat & Seafood', at: m({ x: mid(0, width - 1), y: backWall }) },
    { dept: 'produce', text: 'Produce', at: m({ x: width - 1, y: shelfTop + 2 }) },
    { dept: 'bakery', text: 'Bakery', at: m({ x: width - 1, y: mid(shelfTop, shelfBottom) + 1 }) },
    { dept: 'deli', text: 'Deli', at: m({ x: width - 1, y: shelfBottom }) },
  ];

  // Departments shoppers placed in a numbered aisle at this store.
  const placed = Object.entries(opts.profile?.departmentAisle ?? {}) as [Department, number][];
  for (const [dept, aisle] of placed) departmentCell[dept] = aisleCell(aisle);

  const zone = (dept: Department, text: string, x1: number, y1: number, x2: number, y2: number, side: Zone['side']): Zone | null => {
    if (placed.some(([d]) => d === dept)) return null;
    const a = m({ x: x1, y: y1 });
    const b = m({ x: x2, y: y2 });
    return { text, x1: Math.min(a.x, b.x), y1, x2: Math.max(a.x, b.x), y2, side };
  };
  const third = Math.floor(SHELF_LENGTH / 3);
  const zones = [
    zone('dairy', 'Dairy', 0, FRONT_ROWS, 0, backWall - 1, 'left'),
    zone('meat', 'Meat & Seafood', 0, backWall, width - 1, backWall, 'back'),
    zone('produce', 'Produce', width - 1, FRONT_ROWS, width - 1, FRONT_ROWS + third, 'right'),
    zone('bakery', 'Bakery', width - 1, FRONT_ROWS + third + 1, width - 1, FRONT_ROWS + 2 * third, 'right'),
    zone('deli', 'Deli', width - 1, FRONT_ROWS + 2 * third + 1, width - 1, backWall - 1, 'right'),
  ].filter((z): z is Zone => !!z);
  const aisleMarks = Array.from({ length: n }, (_, i) => ({ text: String(i + 1), at: m({ x: 2 * (i + 1) + 1, y: FRONT_ROWS - 1 }) }));

  return {
    grid,
    zones,
    aisleMarks,
    aisleCount: n,
    entrance: m({ x: rightWalk, y: 0 }),
    checkout: m({ x: 3, y: 0 }),
    aisleCell,
    departmentCell,
    labels: wallLabels.filter((l) => !placed.some(([d]) => d === l.dept)).map(({ text, at }) => ({ text, at })),
  };
}

/**
 * Turns "14", "A14", "Aisle 7" into 14 / 7. Letter-only aisles (Woodman's "U") count from A = 1.
 * Returns null for "Front", "Endcap" and the like.
 */
export function parseAisleNumber(aisle: string): number | null {
  const m = aisle.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  const letters = aisle.trim().toUpperCase().replace(/^AISLE\s*/, '');
  if (/^[A-Z]$/.test(letters)) return letters.charCodeAt(0) - 64;
  if (/^[A-Z]{2}$/.test(letters) && letters[0] === letters[1]) return 26 + letters.charCodeAt(0) - 64; // AA, BB...
  return null;
}

/** "14" -> "Aisle 14", Woodman's "J" -> "Aisle J"; named spots ("SODA", "Front") stay as they are. */
export function aisleTitle(aisle: string): string {
  return /^(\d+[A-Z]?|[A-Z]\d+|[A-Z]{1,2})$/i.test(aisle) ? `Aisle ${aisle}` : capWord(aisle);
}
const capWord = (s: string) => (s === s.toUpperCase() && s.length > 2 ? s[0] + s.slice(1).toLowerCase() : s);

/** The walkway cell a shopper stands on to pick an item, or null if it has no location. */
export function cellForLocation(layout: StoreLayout, loc: ItemLocation): Cell | null {
  if (loc.kind === 'aisle') {
    const name = loc.aisle.trim().toUpperCase().replace(/^AISLE\s*/, '');
    if (layout.named?.[name]) return layout.named[name];
    if (layout.letterCell && /^[A-Z]$/.test(name)) return layout.letterCell(name) ?? layout.departmentCell.other;
    const n = parseAisleNumber(loc.aisle);
    if (n !== null && layout.wallAisles?.[n]) return layout.wallAisles[n];
    return n === null ? layout.departmentCell.other : layout.aisleCell(n, loc.bay);
  }
  if (loc.kind === 'department') return layout.departmentCell[loc.department];
  return null;
}
