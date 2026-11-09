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

export function buildGenericLayout(aisleCount: number): StoreLayout {
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

  const aisleCell = (aisle: number, bay = Math.ceil(SHELF_LENGTH / 2)): Cell => {
    const a = Math.min(Math.max(1, Math.round(aisle)), n);
    const b = Math.min(Math.max(1, Math.round(bay)), SHELF_LENGTH);
    return { x: 2 * a + 1, y: shelfTop + b - 1 };
  };

  const mid = (a: number, b: number) => Math.floor((a + b) / 2);
  const departmentCell: Record<Department, Cell> = {
    produce: { x: rightWalk, y: shelfTop + 2 },
    bakery: { x: rightWalk, y: mid(shelfTop, shelfBottom) + 1 },
    deli: { x: rightWalk, y: shelfBottom },
    meat: { x: mid(1, rightWalk), y: backWalk },
    pantry: aisleCell(Math.ceil(n / 2)),
    frozen: aisleCell(1),
    dairy: { x: 1, y: mid(shelfTop, shelfBottom) },
    other: aisleCell(Math.ceil(n / 2)),
  };

  return {
    grid,
    aisleCount: n,
    entrance: { x: rightWalk, y: 0 },
    checkout: { x: 3, y: 0 },
    aisleCell,
    departmentCell,
    labels: [
      { text: 'Dairy', at: { x: 0, y: mid(shelfTop, backWall) } },
      { text: 'Meat & Seafood', at: { x: mid(0, width - 1), y: backWall } },
      { text: 'Produce', at: { x: width - 1, y: shelfTop + 2 } },
      { text: 'Bakery', at: { x: width - 1, y: mid(shelfTop, shelfBottom) + 1 } },
      { text: 'Deli', at: { x: width - 1, y: shelfBottom } },
    ],
  };
}

/** Turns "14", "A14", "Aisle 14" into 14. Returns null for "Front", "Endcap" etc. */
export function parseAisleNumber(aisle: string): number | null {
  const m = aisle.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
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
