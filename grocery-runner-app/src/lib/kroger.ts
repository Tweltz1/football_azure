import { callBackend } from './api';
import { departmentFromKrogerCategory } from './departments';
import { ItemLocation } from './types';

export type KrogerAisle = {
  number?: string;
  description?: string;
  side?: string;
  bayNumber?: string;
  shelfNumber?: string;
};

export type KrogerProduct = {
  productId: string;
  description: string;
  brand?: string;
  categories: string[];
  aisleLocations: KrogerAisle[];
};

export const searchKrogerProducts = (term: string, locationId: string) =>
  callBackend<KrogerProduct[]>({ action: 'kroger-products', term, locationId });

/** Converts a Kroger product to a routable location. Prefers the first numbered aisle. */
export function locationFromKroger(p: KrogerProduct): ItemLocation {
  const department = departmentFromKrogerCategory(p.categories[0]) ?? undefined;
  const aisle = p.aisleLocations.find((a) => a.number && /\d/.test(a.number)) ?? p.aisleLocations[0];
  if (aisle?.number) {
    const side = aisle.side === 'L' || aisle.side === 'R' ? aisle.side : undefined;
    const bay = aisle.bayNumber ? parseInt(aisle.bayNumber, 10) : undefined;
    return {
      kind: 'aisle',
      aisle: aisle.number,
      side,
      bay: Number.isFinite(bay) ? bay : undefined,
      department,
      source: 'kroger',
    };
  }
  if (department) return { kind: 'department', department, source: 'kroger' };
  return { kind: 'unknown' };
}
