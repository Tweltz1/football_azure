// This week's deals, out-of-stock items and a short store notice from partner stores (sent through the
// store portal by the store's managers). Only stores that have signed up have any; for every other store
// the backend answers with nothing.
import { useEffect, useState } from 'react';
import { backendConfigured, callBackend } from './api';
import { isShared, itemKey } from './sharedAisles';
import { Store } from './types';

export type Deal = { item: string; price?: string; ends?: string };
export type Deals = Record<string, Deal>;
export type Out = { item: string; until?: string };
export type ListDeals = { deals: Deals; outs: Record<string, Out> };

/** Deals at this store that match the item names, keyed by itemKey(name). */
export async function fetchDeals(storeId: string, names: string[]): Promise<Deals> {
  return (await fetchListDeals(storeId, names)).deals;
}

/** Deals and out-of-stock marks at this store that match the item names. */
export async function fetchListDeals(storeId: string, names: string[]): Promise<ListDeals> {
  if (!backendConfigured || !names.length) return NONE;
  const res = await callBackend<{ deals?: Deals; outs?: Record<string, Out> }>({
    body: { action: 'deals', store: storeId, items: names },
  });
  return { deals: res.deals ?? {}, outs: res.outs ?? {} };
}

export const dealFor = (d: ListDeals, name: string): Deal | undefined => d.deals[itemKey(name)];
export const outFor = (d: ListDeals, name: string): Out | undefined => d.outs[itemKey(name)];

/** "On sale: $2.99 · Cheerios 12 oz" (the store's own wording, so "milk" on sale as almond milk is clear). */
export function dealText(d: Deal, name: string): string {
  const what = itemKey(d.item) === itemKey(name) ? '' : ` · ${d.item}`;
  return `On sale${d.price ? `: ${d.price}` : ' this week'}${what}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-30" -> "Nov 30". */
export function shortDate(iso?: string): string | null {
  const m = iso?.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${MONTHS[+m[1] - 1]} ${+m[2]}` : null;
}

/** "Out of stock here · back Nov 30" */
export function outText(o: Out): string {
  const back = shortDate(o.until);
  return `Out of stock here${back ? ` · back by ${back}` : ''}`;
}

const NONE: ListDeals = { deals: {}, outs: {} };

/** Deals and out-of-stock marks for the chosen store and these items, refetched when either changes. */
export function useDeals(store: Store | null, names: string[]): ListDeals {
  const key = names.map(itemKey).sort().join('|');
  const storeId = isShared(store) ? store.id : null;
  const want = storeId && key ? `${storeId}#${key}` : null;
  const [got, setGot] = useState<{ want: string; deals: ListDeals } | null>(null);
  useEffect(() => {
    if (!storeId || !key) return;
    let live = true;
    const done = (deals: ListDeals) => live && setGot({ want: `${storeId}#${key}`, deals });
    fetchListDeals(storeId, key.split('|'))
      .then(done)
      .catch(() => done(NONE));
    return () => {
      live = false;
    };
  }, [storeId, key]);
  // While a changed list loads, keep showing this store's last answer (never another store's).
  return got && want && got.want.startsWith(`${storeId}#`) ? got.deals : NONE;
}

export type StoreInfo = { store: string | null; notice: string | null; deals: Deal[] };
const NO_INFO: StoreInfo = { store: null, notice: null, deals: [] };

/** A partner store's notice and every deal this week (the "Deals this week" screen). */
export async function fetchStoreInfo(storeId: string): Promise<StoreInfo> {
  if (!backendConfigured) return NO_INFO;
  const res = await callBackend<Partial<StoreInfo>>({ body: { action: 'store-info', store: storeId } });
  return { store: res.store ?? null, notice: res.notice ?? null, deals: res.deals ?? [] };
}

/** The chosen store's notice and deals; empty for stores that aren't partners. */
export function useStoreInfo(store: Store | null): StoreInfo {
  const storeId = isShared(store) ? store.id : null;
  const [got, setGot] = useState<{ id: string; info: StoreInfo } | null>(null);
  useEffect(() => {
    if (!storeId) return;
    let live = true;
    fetchStoreInfo(storeId)
      .then((info) => live && setGot({ id: storeId, info }))
      .catch(() => live && setGot({ id: storeId, info: NO_INFO }));
    return () => {
      live = false;
    };
  }, [storeId]);
  return got && got.id === storeId ? got.info : NO_INFO;
}
