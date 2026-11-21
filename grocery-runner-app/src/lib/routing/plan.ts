// Real floor plans for stores whose layout we know (from the store's own published map).
// Every other store uses the generic plan in layout.ts. Pure logic, no React.
import type { StoreProfile } from '../storeProfile';
import { Cell, Department, Store } from '../types';
import { StoreGrid } from './grid';
import { MAX_BAY, StoreLayout, Zone } from './layout';

/** A place along the walls or the front. "left-back" = left wall, toward the back. */
export type Spot =
  | 'left-front' | 'left' | 'left-back'
  | 'back-left' | 'back' | 'back-right'
  | 'right-back' | 'right' | 'right-front'
  | 'front-left' | 'front-right';

export type StorePlan = {
  name: string;
  /** Matched by chain and position (within ~300 m); a plan without a position is the chain's typical layout. */
  chain: Store['chain'];
  lat?: number;
  lon?: number;
  /** A chain's usual layout rather than this store's own map: shoppers' answers can move departments. */
  typical?: boolean;
  /** Numbered center aisles. */
  aisles: number;
  /** Which side aisle 1 is on. */
  aisleOne: 'left' | 'right';
  /** Departments along the walls and front, with the name to show. */
  walls: Partial<Record<Department, { at: Spot; label: string }>>;
  /** Numbered aisles that are really wall cases. */
  wallAisles?: Record<number, Spot>;
  /** Short lettered aisles in a row in front of the checkouts, A on this side. */
  frontLetters?: 'left' | 'right';
  /** Named spots ("SODA"), with an optional label to draw. */
  named?: Record<string, { at: Spot; label?: string }>;
  entrance: 'left' | 'middle' | 'right';
  checkout: 'left' | 'middle' | 'right';
};

/**
 * Woodman's Markets Altoona, 2855 Woodman Drive. From the store's published map (woodmans-food.com):
 * produce on the right wall with bakery in the front-right corner, dairy and meat across the back,
 * frozen down the left wall (aisles 24-26), soda & water front-left, aisles 1-23 numbered from the
 * produce side, and health & beauty, candy, cards and pet in short lettered aisles A-Z in front of
 * the checkouts, A on the right.
 */
export const WOODMANS_ALTOONA: StorePlan = {
  name: "Woodman's Altoona",
  chain: 'woodmans',
  lat: 44.8158,
  lon: -91.4572,
  aisles: 23,
  aisleOne: 'right',
  walls: {
    frozen: { at: 'left', label: 'Frozen' },
    dairy: { at: 'back-left', label: 'Dairy' },
    meat: { at: 'back-right', label: 'Meat' },
    produce: { at: 'right-back', label: 'Produce' },
    deli: { at: 'right', label: '' },
    bakery: { at: 'right-front', label: 'Bakery' },
  },
  wallAisles: { 24: 'left-front', 25: 'left', 26: 'left-back' },
  frontLetters: 'right',
  named: { SODA: { at: 'front-left', label: 'Soda & Water' }, DAIRY: { at: 'back-left' }, MEAT: { at: 'back-right' } },
  entrance: 'right',
  checkout: 'middle',
};

/**
 * A Walmart Supercenter's grocery side, as on Walmart's own store maps (e.g. Chippewa Falls): produce and
 * bakery at the front corner, deli and meat down the side wall, dairy and frozen across the back, paper,
 * cleaning and pets in the back aisles, baby and health & beauty toward general merchandise.
 */
export const WALMART_TYPICAL: StorePlan = {
  name: 'Typical Walmart Supercenter layout',
  chain: 'walmart',
  typical: true,
  aisles: 20,
  aisleOne: 'right',
  walls: {
    produce: { at: 'right-front', label: 'Produce' },
    bakery: { at: 'front-right', label: 'Bakery' },
    deli: { at: 'right', label: 'Deli' },
    meat: { at: 'right-back', label: 'Meat & Seafood' },
    dairy: { at: 'back-right', label: 'Dairy' },
    frozen: { at: 'back', label: 'Frozen' },
    household: { at: 'back-left', label: 'Paper, Cleaning & Pets' },
    pet: { at: 'back-left', label: '' },
    baby: { at: 'left-back', label: 'Baby' },
    health: { at: 'left', label: 'Health & Beauty' },
  },
  entrance: 'right',
  checkout: 'middle',
};

/** A Target's market side, as on Target's store mode maps: grocery down the right, household at the back. */
export const TARGET_TYPICAL: StorePlan = {
  name: 'Typical Target layout',
  chain: 'target',
  typical: true,
  aisles: 16,
  aisleOne: 'right',
  walls: {
    produce: { at: 'right', label: 'Produce' },
    meat: { at: 'right-front', label: 'Meat' },
    dairy: { at: 'right-back', label: 'Dairy' },
    frozen: { at: 'back-right', label: 'Frozen' },
    household: { at: 'back', label: 'Household' },
    pet: { at: 'back-left', label: 'Pets' },
    baby: { at: 'left-back', label: 'Baby' },
    health: { at: 'left', label: 'Health & Beauty' },
  },
  entrance: 'left',
  checkout: 'middle',
};

export const STORE_PLANS: StorePlan[] = [WOODMANS_ALTOONA, WALMART_TYPICAL, TARGET_TYPICAL];

function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const k = Math.PI / 180;
  const x = (b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  return Math.hypot(x, (b.lat - a.lat) * k) * 6371000;
}

/** The known floor plan for this store, if we have one. */
export function planFor(store: Pick<Store, 'chain' | 'lat' | 'lon'> | null | undefined): StorePlan | null {
  if (!store) return null;
  if (store.lat != null && store.lon != null) {
    const pos = { lat: store.lat, lon: store.lon };
    const own = STORE_PLANS.find((p) => p.chain === store.chain && p.lat != null && p.lon != null && metres(pos, { lat: p.lat, lon: p.lon }) <= 300);
    if (own) return own;
  }
  return STORE_PLANS.find((p) => p.typical && p.chain === store.chain) ?? null;
}

const SHELF = MAX_BAY;

/** Grid + cells for a store with a known plan. Same shape as the generic layout. */
export function buildPlanLayout(plan: StorePlan, opts: { profile?: StoreProfile } = {}): StoreLayout {
  const n = plan.aisles;
  const front = plan.frontLetters ? 4 : 2; // y 0 checkout lane, (1 short letter aisles, 2 gap), last = cross-aisle
  const width = 2 * n + 5;
  const height = front + SHELF + 2;
  const grid = new StoreGrid(width, height);
  const shelfTop = front;
  const shelfBottom = front + SHELF - 1;
  const backWalk = shelfBottom + 1;
  const backWall = height - 1;
  const rightWalk = width - 2;

  grid.blockRect(0, front, 0, backWall);
  grid.blockRect(0, backWall, width - 1, backWall);
  grid.blockRect(width - 1, front, width - 1, backWall);
  for (let x = 2; x <= 2 * n + 2; x += 2) grid.blockRect(x, shelfTop, x, shelfBottom);

  // Aisle k's walkway column, counted from the aisle-one side.
  const colOf = (k: number) => (plan.aisleOne === 'left' ? 2 * k + 1 : width - 1 - (2 * k + 1));
  const aisleCell = (aisle: number, bay = Math.ceil(SHELF / 2)): Cell => {
    const a = Math.min(Math.max(1, Math.round(aisle)), n);
    const b = Math.min(Math.max(1, Math.round(bay)), SHELF);
    return { x: colOf(a), y: shelfTop + b - 1 };
  };

  const third = Math.floor(SHELF / 3);
  const span = (lo: number, hi: number, part: 0 | 1 | 2) => {
    const len = hi - lo + 1;
    return [lo + Math.floor((len * part) / 3), lo + Math.floor((len * (part + 1)) / 3) - 1];
  };
  /** Walkway cell to stand on, and the wall cells to draw, for a spot. */
  const spot = (s: Spot): { cell: Cell; zone: Omit<Zone, 'text'> } => {
    const side = s.split('-')[0];
    const part: 0 | 1 | 2 = s.endsWith('-front') || s === 'back-left' ? 0 : s === 'left' || s === 'right' || s === 'back' ? 1 : s === 'back-right' ? 2 : s.endsWith('-back') ? 2 : 0;
    if (side === 'left' || side === 'right') {
      const [y1, y2] = span(shelfTop, backWall - 1, part);
      const x = side === 'left' ? 0 : width - 1;
      return { cell: { x: side === 'left' ? 1 : rightWalk, y: Math.floor((y1 + y2) / 2) }, zone: { x1: x, x2: x, y1, y2, side } };
    }
    if (side === 'back') {
      const [x1, x2] = span(0, width - 1, part);
      return { cell: { x: Math.floor((x1 + x2) / 2), y: backWalk }, zone: { x1, x2, y1: backWall, y2: backWall, side: 'back' } };
    }
    // front-left / front-right: a section at the front corner, beside the checkout lane
    const x1 = s === 'front-left' ? 0 : width - 1 - third;
    const x2 = s === 'front-left' ? third : width - 1;
    return { cell: { x: s === 'front-left' ? 1 : rightWalk, y: 0 }, zone: { x1, x2, y1: 0, y2: 0, side: 'front' } };
  };

  const departmentCell: Record<Department, Cell> = {
    produce: spot('right-front').cell,
    bakery: spot('right').cell,
    deli: spot('right-back').cell,
    meat: spot('back').cell,
    dairy: spot('left').cell,
    frozen: aisleCell(1),
    pantry: aisleCell(Math.ceil(n / 2)),
    other: aisleCell(Math.ceil(n / 2)),
    household: aisleCell(Math.round(n * 0.3)),
    pet: aisleCell(Math.round(n * 0.2)),
    health: aisleCell(Math.round(n * 0.8)),
    baby: aisleCell(Math.round(n * 0.7)),
  };
  const zones: Zone[] = [];
  const learned = plan.typical ? opts.profile?.departmentAisle ?? {} : {};
  for (const [dept, w] of Object.entries(plan.walls) as [Department, { at: Spot; label: string }][]) {
    const sp = spot(w.at);
    departmentCell[dept] = sp.cell;
    if (w.label && learned[dept] === undefined) zones.push({ text: w.label, ...sp.zone });
  }
  const named: Record<string, Cell> = {};
  for (const [name, v] of Object.entries(plan.named ?? {})) {
    const sp = spot(v.at);
    named[name] = sp.cell;
    if (v.label) {
      zones.push({ text: v.label, ...sp.zone });
      if (sp.zone.side === 'front') grid.blockRect(sp.zone.x1, 1, sp.zone.x2, front - 2 >= 1 ? front - 2 : 1);
    }
  }
  const wallAisles: Record<number, Cell> = {};
  for (const [a, s] of Object.entries(plan.wallAisles ?? {})) wallAisles[Number(a)] = spot(s).cell;

  // Lettered aisles: short shelves at y = 1, A nearest the given side, between the front corner sections.
  let letterCell: StoreLayout['letterCell'];
  const aisleMarks = Array.from({ length: n }, (_, i) => ({ text: String(i + 1), at: { x: colOf(i + 1), y: front - 1 } }));
  if (plan.frontLetters) {
    const lo = 2 + third;
    const hi = width - 3 - third;
    for (let x = lo; x <= hi; x += 2) grid.blockRect(x, 1, x, 1);
    const cols: number[] = [];
    for (let x = lo + 1; x < hi; x += 2) cols.push(x);
    if (plan.frontLetters === 'right') cols.reverse();
    const at = (i: number) => cols[Math.min(cols.length - 1, Math.floor((i * cols.length) / 26))];
    letterCell = (letter) => (/^[A-Z]$/.test(letter) ? { x: at(letter.charCodeAt(0) - 65), y: 1 } : null);
    for (const l of ['A', 'E', 'J', 'N', 'S', 'X']) aisleMarks.push({ text: l, at: { x: letterCell(l)!.x, y: 0 } });
  }

  // Departments shoppers placed in a numbered aisle at this store still move there.
  for (const [dept, aisle] of Object.entries(opts.profile?.departmentAisle ?? {}) as [Department, number][]) {
    if (plan.walls[dept] && !plan.typical) continue; // the store's own map wins over answers
    departmentCell[dept] = wallAisles[aisle] ?? aisleCell(aisle);
  }

  const xAt = (where: 'left' | 'middle' | 'right') => (where === 'left' ? 1 : where === 'right' ? rightWalk : Math.floor(width / 2));
  return {
    grid,
    aisleCount: n,
    entrance: { x: xAt(plan.entrance), y: 0 },
    checkout: { x: xAt(plan.checkout), y: 0 },
    aisleCell: (a, bay) => wallAisles[Math.round(a)] ?? aisleCell(a, bay),
    departmentCell,
    labels: [],
    zones,
    aisleMarks,
    letterCell,
    named,
    wallAisles,
    planName: plan.name,
  };
}
