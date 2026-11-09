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
    }
  | { kind: 'department'; department: Department; source: LocationSource }
  | { kind: 'unknown' };

/** Where the location came from, so the UI can show how much to trust it. */
export type LocationSource = 'kroger' | 'user' | 'community' | 'guess';

export type ListItem = {
  id: string;
  name: string;
  checked: boolean;
  location: ItemLocation;
};

export type StoreChain = 'kroger' | 'other';

export type Store = {
  id: string; // "kroger:01400943" or "custom:<uuid>"
  chain: StoreChain;
  name: string;
  address?: string;
  /** Number of numbered aisles, used to build the generic grid layout. */
  aisleCount: number;
};

export type Cell = { x: number; y: number };
