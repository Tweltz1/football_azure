// This week's deals from partner stores (sent through the store portal). Only stores that have
// signed up have any; for every other store the backend answers with no deals.
import { useEffect, useState } from 'react';
import { backendConfigured, callBackend } from './api';
import { isShared, itemKey } from './sharedAisles';
import { Store } from './types';

export type Deal = { item: string; price?: string; ends?: string };
export type Deals = Record<string, Deal>;

/** Deals at this store that match the item names, keyed by itemKey(name). */
export async function fetchDeals(storeId: string, names: string[]): Promise<Deals> {
  if (!backendConfigured || !names.length) return {};
  const res = await callBackend<{ deals?: Deals }>({ body: { action: 'deals', store: storeId, items: names } });
  return res.deals ?? {};
}

export const dealFor = (deals: Deals, name: string): Deal | undefined => deals[itemKey(name)];

/** "On sale: $2.99 · Cheerios 12 oz" (the store's own wording, so "milk" on sale as almond milk is clear). */
export function dealText(d: Deal, name: string): string {
  const what = itemKey(d.item) === itemKey(name) ? '' : ` · ${d.item}`;
  return `On sale${d.price ? `: ${d.price}` : ' this week'}${what}`;
}

const NONE: Deals = {};

/** Deals for the chosen store and these items, refetched when either changes. */
export function useDeals(store: Store | null, names: string[]): Deals {
  const key = names.map(itemKey).sort().join('|');
  const storeId = isShared(store) ? store.id : null;
  const want = storeId && key ? `${storeId}#${key}` : null;
  const [got, setGot] = useState<{ want: string; deals: Deals } | null>(null);
  useEffect(() => {
    if (!storeId || !key) return;
    let live = true;
    const done = (deals: Deals) => live && setGot({ want: `${storeId}#${key}`, deals });
    fetchDeals(storeId, key.split('|'))
      .then(done)
      .catch(() => done({}));
    return () => {
      live = false;
    };
  }, [storeId, key]);
  // While a changed list loads, keep showing this store's last answer (never another store's).
  return got && want && got.want.startsWith(`${storeId}#`) ? got.deals : NONE;
}
