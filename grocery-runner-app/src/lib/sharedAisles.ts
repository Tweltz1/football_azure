import { callBackend } from './api';
import { Department, ItemLocation, Store } from './types';

/** `official`: from the store's own aisle list (partner stores), which the server puts ahead of votes. */
type Shared = { aisle?: string; department?: string; votes: number; total: number; official?: boolean };

/** Stores whose aisles are pooled with other shoppers. */
export const isShared = (store: Store | null): store is Store => !!store && !store.id.startsWith('custom:');

/** Shared shopper answers for these item names, keyed by the server's normalised item key. */
export async function fetchSharedAisles(store: Store, names: string[]): Promise<Record<string, ItemLocation>> {
  const raw = await callBackend<Record<string, Shared>>({ body: { action: 'aisles', store: store.id, items: names } });
  const out: Record<string, ItemLocation> = {};
  for (const [key, s] of Object.entries(raw)) {
    const from = s.official ? { source: 'store' as const } : { source: 'community' as const, votes: s.votes };
    if (s.aisle) out[key] = { kind: 'aisle', aisle: s.aisle, ...from };
    else if (s.department) out[key] = { kind: 'department', department: s.department as Department, ...from };
  }
  return out;
}

/** `learned` = from check-off order (half a vote, never replaces this phone's typed answer). */
export function voteAisle(
  store: Store,
  item: string,
  device: string,
  location: ItemLocation,
  kind: 'typed' | 'learned' = 'typed',
) {
  if (location.kind === 'unknown') return Promise.resolve();
  const body =
    location.kind === 'aisle'
      ? { action: 'vote', store: store.id, item, device, kind, aisle: location.aisle }
      : { action: 'vote', store: store.id, item, device, kind, department: location.department };
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

/** Every shared item + aisle answer at a store (for learning its layout). */
export async function fetchStoreAisles(store: Store): Promise<{ name: string; aisle: string }[]> {
  const rows = await callBackend<{ item: string; aisle: string }[]>({ body: { action: 'store-aisles', store: store.id } });
  return Array.isArray(rows) ? rows.map((r) => ({ name: r.item, aisle: r.aisle })) : [];
}

/**
 * Department fixes shared across all stores. The server only answers for items where 2+ shoppers agree
 * and they are a majority (tallyDepartments in supabase/functions/grocery-runner/votes.ts).
 */
export async function fetchSharedDepartments(names: string[]): Promise<Record<string, ItemLocation>> {
  const raw = await callBackend<Record<string, { department: string; votes: number }>>({
    body: { action: 'departments', items: names },
  });
  const out: Record<string, ItemLocation> = {};
  for (const [key, s] of Object.entries(raw ?? {})) {
    out[key] = { kind: 'department', department: s.department as Department, source: 'community', votes: s.votes };
  }
  return out;
}

/** This phone's department for an item (any store). Voting again replaces the old vote. */
export function voteDepartment(item: string, device: string, department: Department) {
  return callBackend({ body: { action: 'department-vote', item, device, department } }).then(() => undefined);
}
