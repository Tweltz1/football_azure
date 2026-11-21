// In-store stock for the list at a Kroger-family store (Kroger, Pick 'n Save, Metro Market, Mariano's, ...).
// Kroger's official product API tells, per store, whether an item is in stock, running low or out.
// No other chain publishes stock the app may use, so every other store shows nothing here.
import { useEffect, useState } from 'react';
import { backendConfigured } from './api';
import { itemKey } from './sharedAisles';
import { krogerStock, Stock, StockCheck } from './storePick';
import { Store } from './types';

export type StockMap = Record<string, StockCheck>;

/** Answers are kept a while per store + item, so reopening the list does not ask Kroger again. */
const KEEP_MS = 20 * 60_000;
const seen = new Map<string, { at: number; check: StockCheck }>();

export const isKrogerStore = (store: Store | null): store is Store =>
  !!store && store.chain === 'kroger' && store.id.startsWith('kroger:');

/** Splits names into ones with a fresh saved answer and ones still to ask about (each name once). */
export function splitFresh(storeId: string, names: string[], now = Date.now()) {
  const have: StockMap = {};
  const ask: string[] = [];
  const done = new Set<string>();
  for (const name of names) {
    const k = itemKey(name);
    if (!k || done.has(k)) continue;
    done.add(k);
    const hit = seen.get(`${storeId}#${k}`);
    if (hit && now - hit.at < KEEP_MS) have[k] = hit.check;
    else ask.push(name);
  }
  return { have, ask };
}

export function remember(storeId: string, checks: StockCheck[], now = Date.now()) {
  for (const c of checks) seen.set(`${storeId}#${itemKey(c.item)}`, { at: now, check: c });
}

export const stockFor = (stock: StockMap, name: string): StockCheck | undefined => stock[itemKey(name)];

export type StockNote = { text: string; tone: 'good' | 'warn' | 'bad' };

/** What to say under an item, or null when there is nothing worth showing. */
export function stockText(c: StockCheck | undefined): StockNote | null {
  if (!c) return null;
  const price = c.price != null ? ` · $${c.price.toFixed(2)}` : '';
  const levels: Record<Stock, StockNote | null> = {
    high: { text: `In stock${price}`, tone: 'good' },
    low: { text: `Running low here${price}`, tone: 'warn' },
    out: { text: 'Out of stock at this store', tone: 'bad' },
    unknown: null,
  };
  return levels[c.stock] ?? null;
}

const NONE: StockMap = {};

/** Stock for these items at the chosen store, when it is a Kroger-family store. */
export function useStock(store: Store | null, names: string[]): StockMap {
  const key = [...new Set(names.map(itemKey))].sort().join('|');
  const storeId = isKrogerStore(store) ? store.id : null;
  const [got, setGot] = useState<{ storeId: string; stock: StockMap } | null>(null);
  useEffect(() => {
    if (!storeId || !key || !backendConfigured) return;
    let live = true;
    const { have, ask } = splitFresh(storeId, names);
    const merge = (add: StockMap) =>
      setGot((g) => ({ storeId, stock: { ...(g?.storeId === storeId ? g.stock : {}), ...add } }));
    if (Object.keys(have).length) merge(have);
    if (!ask.length) return;
    // Wait a moment so typing several items in a row sends one request.
    const timer = setTimeout(() => {
      krogerStock(storeId.replace('kroger:', ''), ask)
        .then((checks) => {
          remember(storeId, checks);
          if (!live) return;
          const add: StockMap = {};
          for (const c of checks) add[itemKey(c.item)] = c;
          merge(add);
        })
        .catch(() => {}); // offline, or Kroger lookups not switched on yet
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // names is captured through key (same items, same order of asking does not matter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, key]);
  return got && storeId && got.storeId === storeId ? got.stock : NONE;
}
