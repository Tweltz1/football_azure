export type Department =
  | 'produce'
  | 'bakery'
  | 'deli'
  | 'meat'
  | 'pantry'
  | 'frozen'
  | 'dairy'
  | 'other';

/** Where an item sits in the store. Most specific first. */
export type ItemLocation =
  | {
      kind: 'aisle';
      aisle: string;
      side?: 'L' | 'R';
      bay?: number;
      /** Department the aisle belongs to, if known (used for "cold items last"). */
      department?: Department;
      source: LocationSource;
      /** For shared shopper aisles: how many shoppers agree. */
      votes?: number;
    }
  | { kind: 'department'; department: Department; source: LocationSource; votes?: number }
  | { kind: 'unknown' };

/** Where the location came from, so the UI can show how much to trust it. `store` = the store's own aisle list. */
export type LocationSource = 'kroger' | 'user' | 'community' | 'store' | 'guess';

export type ListItem = {
  id: string;
  name: string;
  /** How much, when it came from a recipe ("2 cups"). */
  amount?: string;
  checked: boolean;
  location: ItemLocation;
};

export type StoreChain = 'kroger' | 'walmart' | 'target' | 'hyvee' | 'costco' | 'aldi' | 'woodmans' | 'other';

export type Store = {
  /**
   * "kroger:01400943", "walmart:1234" (real store numbers), "target:50309" (chain + ZIP),
   * or "custom:<name>" for a store kept on this phone only. All but custom share aisles with other shoppers.
   */
  id: string;
  chain: StoreChain;
  name: string;
  address?: string;
  /** Number of numbered aisles, used to build the generic grid layout. */
  aisleCount: number;
  /** Where the store is, when it was picked on the map. Used to tell if the shopper is inside it. */
  lat?: number;
  lon?: number;
};

export type Cell = { x: number; y: number };
