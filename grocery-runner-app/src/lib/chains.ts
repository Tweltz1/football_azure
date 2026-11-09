import { StoreChain } from './types';

// aisles: a typical store's aisle count, used as the starting value (the shopper can change it).
export const CHAINS: { chain: StoreChain; label: string; aisles: number }[] = [
  { chain: 'kroger', label: 'Kroger family', aisles: 24 },
  { chain: 'walmart', label: 'Walmart', aisles: 24 },
  { chain: 'target', label: 'Target', aisles: 16 },
  { chain: 'hyvee', label: 'Hy-Vee', aisles: 20 },
  { chain: 'costco', label: 'Costco', aisles: 20 },
  { chain: 'aldi', label: 'Aldi', aisles: 5 },
  { chain: 'woodmans', label: "Woodman's", aisles: 40 },
  { chain: 'other', label: 'Other', aisles: 20 },
];

export const chainInfo = (chain: StoreChain) => CHAINS.find((c) => c.chain === chain) ?? CHAINS[CHAINS.length - 1];
