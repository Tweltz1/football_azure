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
 * has no aisle number. Numbered aisles run front to back.
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
};

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
  const departmentCell: Record<Department, Cell> = {
    produce: m({ x: rightWalk, y: shelfTop + 2 }),
    bakery: m({ x: rightWalk, y: mid(shelfTop, shelfBottom) + 1 }),
    deli: m({ x: rightWalk, y: shelfBottom }),
    meat: m({ x: mid(1, rightWalk), y: backWalk }),
    pantry: aisleCell(Math.ceil(n / 2)),
    frozen: aisleCell(1),
    dairy: m({ x: 1, y: mid(shelfTop, shelfBottom) }),
    other: aisleCell(Math.ceil(n / 2)),
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

  return {
    grid,
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

/** The walkway cell a shopper stands on to pick an item, or null if it has no location. */
export function cellForLocation(layout: StoreLayout, loc: ItemLocation): Cell | null {
  if (loc.kind === 'aisle') {
    const n = parseAisleNumber(loc.aisle);
    return n === null ? layout.departmentCell.other : layout.aisleCell(n, loc.bay);
  }
  if (loc.kind === 'department') return layout.departmentCell[loc.department];
  return null;
}
