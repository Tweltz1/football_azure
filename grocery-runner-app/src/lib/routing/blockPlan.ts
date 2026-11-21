// Floor plans drawn block by block from a store's own published map (Walmart and Target store maps).
// Unlike the aisle plan in plan.ts, these stores don't number their aisles on the map, so items are
// walked to their department's block. Pure logic, no React.
import { Cell, Department, Store } from '../types';
import { StoreGrid } from './grid';
import { StoreLayout, Zone } from './layout';

/**
 * One area of the map, in grid cells counted from the top-left of the store map (row 0 = back wall).
 * - 'v' / 'h': shelving aisles running front-to-back / side-to-side (a shelf every other line).
 * - 'solid': wall cases or a service counter (not walkable).
 * - 'area': open floor with displays or racks (walkable).
 * - 'lanes': checkout lanes.
 * - 'void': outside the building.
 */
export type Block = {
  kind: 'v' | 'h' | 'solid' | 'area' | 'lanes' | 'void';
  c1: number;
  r1: number;
  c2: number;
  r2: number;
  label?: string;
  /** Departments shoppers walk to this block for. */
  depts?: Department[];
};

export type BlockPlan = {
  name: string;
  chain: Store['chain'];
  /** Matched by chain and distance from this point, or the town in the store's address. */
  near: { lat: number; lon: number; km: number };
  town: RegExp;
  width: number;
  height: number;
  blocks: Block[];
  entrance: { c: number; r: number };
  /** Past the checkout lanes, and the lane entry on the store side. */
  checkout: { c: number; r: number };
  checkoutIn: { c: number; r: number };
};

/**
 * Walmart Supercenter, Chippewa Falls, from Walmart's own store map: general merchandise on the left,
 * dairy across the back of the grocery side, frozen, snacks and grocery aisles down the right, meat &
 * seafood on the right wall, produce, bakery and deli at the front-right by the grocery entrance.
 */
export const WALMART_CHIPPEWA_FALLS: BlockPlan = {
  name: 'Walmart Chippewa Falls',
  chain: 'walmart',
  near: { lat: 44.9369, lon: -91.3929, km: 7 },
  town: /chippewa falls|lake hallie/i,
  width: 59,
  height: 37,
  blocks: [
    { kind: 'void', c1: 0, r1: 0, c2: 44, r2: 1 },
    { kind: 'void', c1: 57, r1: 0, c2: 58, r2: 14 },
    { kind: 'void', c1: 57, r1: 28, c2: 58, r2: 36 },
    { kind: 'void', c1: 53, r1: 32, c2: 56, r2: 36 },
    { kind: 'void', c1: 12, r1: 32, c2: 14, r2: 36 },
    { kind: 'void', c1: 25, r1: 35, c2: 39, r2: 36 },
    { kind: 'v', c1: 0, r1: 3, c2: 6, r2: 8, label: 'Sports' },
    { kind: 'v', c1: 7, r1: 3, c2: 14, r2: 8, label: 'Toys' },
    { kind: 'v', c1: 15, r1: 3, c2: 26, r2: 8, label: 'Electronics' },
    { kind: 'v', c1: 27, r1: 3, c2: 30, r2: 8, label: 'Arts & Crafts' },
    { kind: 'v', c1: 31, r1: 3, c2: 34, r2: 8, label: 'Household Paper', depts: ['household'] },
    { kind: 'v', c1: 35, r1: 3, c2: 36, r2: 8, label: 'Cleaning' },
    { kind: 'v', c1: 37, r1: 3, c2: 43, r2: 8, label: 'Pets', depts: ['pet'] },
    { kind: 'solid', c1: 45, r1: 0, c2: 56, r2: 1, label: 'Dairy', depts: ['dairy'] },
    { kind: 'solid', c1: 56, r1: 2, c2: 56, r2: 9 },
    { kind: 'solid', c1: 56, r1: 10, c2: 56, r2: 14, label: 'Deli' },
    { kind: 'solid', c1: 56, r1: 15, c2: 58, r2: 27, label: 'Meat & Seafood', depts: ['meat'] },
    { kind: 'h', c1: 46, r1: 3, c2: 54, r2: 8, label: 'Frozen & Alcohol', depts: ['frozen'] },
    { kind: 'h', c1: 46, r1: 10, c2: 54, r2: 14, label: 'Snacks & Bev' },
    { kind: 'h', c1: 46, r1: 16, c2: 54, r2: 24, label: 'Grocery', depts: ['pantry', 'other'] },
    { kind: 'area', c1: 45, r1: 25, c2: 53, r2: 30, label: 'Fresh Produce', depts: ['produce'] },
    { kind: 'solid', c1: 54, r1: 28, c2: 56, r2: 31, label: 'Bakery', depts: ['bakery'] },
    { kind: 'solid', c1: 47, r1: 31, c2: 52, r2: 32, label: 'Deli', depts: ['deli'] },
    { kind: 'h', c1: 0, r1: 10, c2: 6, r2: 24, label: 'Hardware & Auto' },
    { kind: 'h', c1: 9, r1: 10, c2: 18, r2: 24, label: 'Home' },
    { kind: 'h', c1: 20, r1: 10, c2: 23, r2: 17, label: 'Office & Party' },
    { kind: 'v', c1: 20, r1: 19, c2: 23, r2: 24, label: 'Beauty' },
    { kind: 'area', c1: 25, r1: 10, c2: 43, r2: 24, label: 'Clothing & Shoes' },
    { kind: 'area', c1: 35, r1: 10, c2: 43, r2: 14, label: 'Baby', depts: ['baby'] },
    { kind: 'lanes', c1: 20, r1: 26, c2: 43, r2: 29, label: 'Checkout' },
    { kind: 'v', c1: 0, r1: 27, c2: 4, r2: 31, label: 'Seasonal' },
    { kind: 'v', c1: 5, r1: 27, c2: 8, r2: 31, label: 'Personal Care' },
    { kind: 'v', c1: 9, r1: 27, c2: 18, r2: 31, label: 'Health & Pharmacy', depts: ['health'] },
    { kind: 'area', c1: 0, r1: 32, c2: 11, r2: 36, label: 'Garden' },
  ],
  entrance: { c: 45, r: 36 },
  checkout: { c: 33, r: 30 },
  checkoutIn: { c: 33, r: 25 },
};

/**
 * Target, Eau Claire, from Target's store mode map. The map names only some areas (Toy Shop, Holiday
 * Market, Household, Grocery, Home Decor, School/Office), so the rest are drawn without names and
 * departments it doesn't show (pet, baby, health & beauty) are listed as not on the map.
 */
export const TARGET_EAU_CLAIRE: BlockPlan = {
  name: 'Target Eau Claire',
  chain: 'target',
  near: { lat: 44.8113, lon: -91.4985, km: 15 },
  town: /eau claire/i,
  width: 47,
  height: 28,
  blocks: [
    { kind: 'void', c1: 41, r1: 0, c2: 46, r2: 3 },
    { kind: 'v', c1: 0, r1: 0, c2: 23, r2: 3, label: 'Toy Shop' },
    { kind: 'v', c1: 24, r1: 0, c2: 40, r2: 3, label: 'Holiday Market' },
    { kind: 'h', c1: 0, r1: 5, c2: 6, r2: 20, label: 'Home Decor' },
    { kind: 'v', c1: 8, r1: 5, c2: 15, r2: 8 },
    { kind: 'area', c1: 8, r1: 9, c2: 15, r2: 11 },
    { kind: 'area', c1: 17, r1: 5, c2: 23, r2: 11 },
    { kind: 'h', c1: 25, r1: 5, c2: 38, r2: 9, label: 'Household', depts: ['household'] },
    { kind: 'area', c1: 25, r1: 10, c2: 32, r2: 11 },
    { kind: 'h', c1: 34, r1: 11, c2: 38, r2: 20 },
    { kind: 'v', c1: 8, r1: 13, c2: 15, r2: 16 },
    { kind: 'area', c1: 8, r1: 17, c2: 15, r2: 20 },
    { kind: 'area', c1: 17, r1: 13, c2: 32, r2: 20 },
    { kind: 'h', c1: 40, r1: 6, c2: 46, r2: 20, label: 'Grocery', depts: ['pantry', 'frozen', 'dairy', 'meat', 'produce', 'bakery', 'deli', 'other'] },
    { kind: 'area', c1: 40, r1: 21, c2: 46, r2: 25 },
    { kind: 'lanes', c1: 11, r1: 22, c2: 37, r2: 23, label: 'Checkout' },
    { kind: 'v', c1: 0, r1: 22, c2: 9, r2: 27, label: 'School & Office' },
    { kind: 'solid', c1: 25, r1: 25, c2: 33, r2: 27, label: 'Restrooms' },
    { kind: 'solid', c1: 38, r1: 26, c2: 46, r2: 27, label: 'Starbucks' },
  ],
  entrance: { c: 12, r: 27 },
  checkout: { c: 24, r: 24 },
  checkoutIn: { c: 24, r: 21 },
};

export const BLOCK_PLANS: BlockPlan[] = [WALMART_CHIPPEWA_FALLS, TARGET_EAU_CLAIRE];

/** Crossing a step of open floor (clothing racks, displays) costs this many steps of walkway. */
const AREA_COST = 4;

/** Grid + cells for a block plan. Departments the map doesn't show are in `unmapped`. */
export function buildBlockLayout(plan: BlockPlan): StoreLayout {
  const { width, height } = plan;
  const grid = new StoreGrid(width, height);
  // Map rows count from the back wall; the grid's y grows toward the back.
  const y = (r: number) => height - 1 - r;
  const cell = (c: number, r: number): Cell => ({ x: c, y: y(r) });

  for (const b of plan.blocks) {
    if (b.kind === 'void' || b.kind === 'solid') grid.blockRect(b.c1, y(b.r1), b.c2, y(b.r2));
    if (b.kind === 'v' || b.kind === 'lanes') for (let c = b.c1; c <= b.c2; c += 2) grid.blockRect(c, y(b.r1), c, y(b.r2));
    if (b.kind === 'h') for (let r = b.r1; r <= b.r2; r += 2) grid.blockRect(b.c1, y(r), b.c2, y(r));
    // Racks and displays: shoppers walk around open-floor areas unless they're shopping in one.
    if (b.kind === 'area') grid.costRect(b.c1, y(b.r1), b.c2, y(b.r2), b.depts?.length ? 1.5 : AREA_COST);
  }

  /** The walkable cell nearest the block's middle (breadth-first from the middle, rows before columns). */
  const standAt = (b: Block): Cell => {
    const start = cell(Math.round((b.c1 + b.c2) / 2), Math.round((b.r1 + b.r2) / 2));
    const seen = new Set([grid.index(start)]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      if (grid.isWalkable(c)) return c;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (grid.inBounds(n) && !seen.has(grid.index(n))) {
          seen.add(grid.index(n));
          queue.push(n);
        }
      }
    }
    return start;
  };

  const checkout = cell(plan.checkout.c, plan.checkout.r);
  const departmentCell = {} as Record<Department, Cell>;
  for (const b of plan.blocks) for (const d of b.depts ?? []) departmentCell[d] ??= standAt(b);
  const all: Department[] = ['produce', 'bakery', 'deli', 'meat', 'pantry', 'health', 'baby', 'household', 'pet', 'other', 'frozen', 'dairy'];
  const unmapped = all.filter((d) => !departmentCell[d]);
  for (const d of unmapped) departmentCell[d] = checkout;

  const zones: Zone[] = plan.blocks.map((b) => ({
    text: b.label ?? '',
    x1: b.c1,
    x2: b.c2,
    y1: y(b.r2),
    y2: y(b.r1),
    side: 'block',
    fill: b.kind === 'void' ? 'void' : b.kind === 'solid' ? 'solid' : b.kind === 'area' ? 'area' : 'none',
  }));

  return {
    grid,
    aisleCount: 0,
    entrance: cell(plan.entrance.c, plan.entrance.r),
    checkout,
    checkoutIn: cell(plan.checkoutIn.c, plan.checkoutIn.r),
    aisleCell: () => departmentCell.pantry,
    departmentCell,
    labels: [],
    zones,
    aisleMarks: [],
    planName: plan.name,
    noAisleNumbers: true,
    unmapped,
  };
}
