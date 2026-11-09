import { callBackend } from './api';
import { Department, ItemLocation, Store } from './types';

type Shared = { aisle?: string; department?: string; votes: number; total: number };

/** Stores whose aisles are pooled with other shoppers. */
export const isShared = (store: Store | null): store is Store => !!store && !store.id.startsWith('custom:');

/** Shared shopper answers for these item names, keyed by the server's normalised item key. */
export async function fetchSharedAisles(store: Store, names: string[]): Promise<Record<string, ItemLocation>> {
  const raw = await callBackend<Record<string, Shared>>({ body: { action: 'aisles', store: store.id, items: names } });
  const out: Record<string, ItemLocation> = {};
  for (const [key, s] of Object.entries(raw)) {
    if (s.aisle) out[key] = { kind: 'aisle', aisle: s.aisle, source: 'community', votes: s.votes };
    else if (s.department) {
      out[key] = { kind: 'department', department: s.department as Department, source: 'community', votes: s.votes };
    }
  }
  return out;
}

export function voteAisle(store: Store, item: string, device: string, location: ItemLocation) {
  if (location.kind === 'unknown') return Promise.resolve();
  const body =
    location.kind === 'aisle'
      ? { action: 'vote', store: store.id, item, device, aisle: location.aisle }
      : { action: 'vote', store: store.id, item, device, department: location.department };
  return callBackend({ body }).then(() => undefined);
}

/** Must match itemKey() in supabase/functions/grocery-runner/votes.ts. */
export function itemKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
