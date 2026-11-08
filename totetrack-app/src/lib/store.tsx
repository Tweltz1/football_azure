import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { deletePhoto } from './photos';
import { Item, Tote, ToteInput } from './types';

const KEY = 'totetrack.totes.v1';

type Store = {
  ready: boolean;
  totes: Tote[];
  getTote: (id: string) => Tote | undefined;
  createTote: (input: ToteInput, id?: string) => Tote;
  updateTote: (id: string, patch: Partial<ToteInput>) => void;
  deleteTote: (id: string) => void;
  addItem: (toteId: string, name: string, qty?: number) => void;
  updateItem: (toteId: string, itemId: string, patch: Partial<Omit<Item, 'id'>>) => void;
  removeItem: (toteId: string, itemId: string) => void;
  moveItem: (fromToteId: string, itemId: string, toToteId: string) => void;
};

const Ctx = createContext<Store | null>(null);

export function ToteProvider({ children }: { children: ReactNode }) {
  const [totes, setTotes] = useState<Tote[]>([]);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setTotes(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(KEY, JSON.stringify(totes)).catch(() => {});
  }, [totes]);

  const mutate = useCallback((id: string, fn: (t: Tote) => Tote) => {
    setTotes((prev) => prev.map((t) => (t.id === id ? { ...fn(t), updatedAt: Date.now() } : t)));
  }, []);

  const store = useMemo<Store>(
    () => ({
      ready,
      totes,
      getTote: (id) => totes.find((t) => t.id === id),
      createTote: (input, id) => {
        const now = Date.now();
        const tote: Tote = { ...input, id: id ?? Crypto.randomUUID(), items: [], createdAt: now, updatedAt: now };
        setTotes((prev) => [tote, ...prev.filter((t) => t.id !== tote.id)]);
        return tote;
      },
      updateTote: (id, patch) => mutate(id, (t) => ({ ...t, ...patch })),
      deleteTote: (id) => {
        const t = totes.find((x) => x.id === id);
        deletePhoto(t?.photo);
        setTotes((prev) => prev.filter((x) => x.id !== id));
      },
      addItem: (toteId, name, qty = 1) => {
        const clean = name.trim();
        if (!clean) return;
        mutate(toteId, (t) => {
          const existing = t.items.find((i) => i.name.toLowerCase() === clean.toLowerCase());
          if (existing) {
            return { ...t, items: t.items.map((i) => (i === existing ? { ...i, qty: i.qty + qty } : i)) };
          }
          return { ...t, items: [{ id: Crypto.randomUUID(), name: clean, qty }, ...t.items] };
        });
      },
      updateItem: (toteId, itemId, patch) =>
        mutate(toteId, (t) => ({ ...t, items: t.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) })),
      removeItem: (toteId, itemId) => mutate(toteId, (t) => ({ ...t, items: t.items.filter((i) => i.id !== itemId) })),
      moveItem: (fromToteId, itemId, toToteId) => {
        setTotes((prev) => {
          const item = prev.find((t) => t.id === fromToteId)?.items.find((i) => i.id === itemId);
          if (!item || fromToteId === toToteId) return prev;
          const now = Date.now();
          return prev.map((t) => {
            if (t.id === fromToteId) return { ...t, items: t.items.filter((i) => i.id !== itemId), updatedAt: now };
            if (t.id === toToteId) return { ...t, items: [item, ...t.items], updatedAt: now };
            return t;
          });
        });
      },
    }),
    [ready, totes, mutate],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useTotes(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useTotes must be used inside ToteProvider');
  return s;
}

export function itemCount(t: Tote): number {
  return t.items.reduce((n, i) => n + i.qty, 0);
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
