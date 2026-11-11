import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { DEMO, demoLists } from './demo';
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';

/** One thing to pack. It points at an item in a tote, so the list knows where to grab it from. */
export type ListEntry = { id: string; toteId: string; itemId: string; name: string; packed: boolean };
export type PackingList = { id: string; name: string; entries: ListEntry[]; createdAt: number };

const KEY = 'totetrack.lists.v1';
/** When the lists last changed on this phone, so sync knows which side is newer. */
const AT_KEY = 'totetrack.lists.at';

type ListsStore = {
  lists: PackingList[];
  ready: boolean;
  /** When the lists last changed on this phone (0 = never). */
  updatedAt: number;
  /** Takes the account's lists from the cloud (newer than this phone's). */
  replaceAll: (lists: PackingList[], at: number) => void;
  /** Removes every list from this phone (on sign-out; the account's copy is kept). */
  forgetPhone: () => void;
  getList: (id: string) => PackingList | undefined;
  createList: (name: string) => PackingList;
  renameList: (id: string, name: string) => void;
  deleteList: (id: string) => void;
  addEntry: (listId: string, e: Omit<ListEntry, 'id' | 'packed'>) => void;
  removeEntry: (listId: string, entryId: string) => void;
  togglePacked: (listId: string, entryId: string) => void;
  resetPacked: (listId: string) => void;
};

const Ctx = createContext<ListsStore | null>(null);

export function ListsProvider({ children }: { children: ReactNode }) {
  const [lists, setRawLists] = useState<PackingList[]>([]);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setRawLists(JSON.parse(raw));
        else if (DEMO) setRawLists(demoLists());
        const at = Number(await AsyncStorage.getItem(AT_KEY)) || 0;
        // Lists saved before sync existed count as changed now, so they go up on first sign-in.
        setUpdatedAt(at || (raw && JSON.parse(raw).length ? Date.now() : 0));
      } catch {
        // keep whatever loaded
      }
      loaded.current = true;
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(KEY, JSON.stringify(lists)).catch(() => {});
    AsyncStorage.setItem(AT_KEY, String(updatedAt)).catch(() => {});
  }, [lists, updatedAt]);

  /** Every change made on this phone moves its clock forward. */
  const setLists = (fn: (prev: PackingList[]) => PackingList[]) => {
    setRawLists(fn);
    setUpdatedAt(Date.now());
  };

  const store = useMemo<ListsStore>(() => {
    const edit = (id: string, fn: (l: PackingList) => PackingList) => setLists((prev) => prev.map((l) => (l.id === id ? fn(l) : l)));
    return {
      lists,
      ready,
      updatedAt,
      replaceAll: (next, at) => {
        setRawLists(next);
        setUpdatedAt(at);
      },
      forgetPhone: () => {
        setRawLists([]);
        setUpdatedAt(0);
      },
      getList: (id) => lists.find((l) => l.id === id),
      createList: (name) => {
        const list: PackingList = { id: Crypto.randomUUID(), name: name.trim() || 'Packing list', entries: [], createdAt: Date.now() };
        setLists((prev) => [list, ...prev]);
        return list;
      },
      renameList: (id, name) => edit(id, (l) => ({ ...l, name: name.trim() || l.name })),
      deleteList: (id) => setLists((prev) => prev.filter((l) => l.id !== id)),
      addEntry: (listId, e) =>
        edit(listId, (l) =>
          l.entries.some((x) => x.itemId === e.itemId) ? l : { ...l, entries: [...l.entries, { ...e, id: Crypto.randomUUID(), packed: false }] },
        ),
      removeEntry: (listId, entryId) => edit(listId, (l) => ({ ...l, entries: l.entries.filter((x) => x.id !== entryId) })),
      togglePacked: (listId, entryId) =>
        edit(listId, (l) => ({ ...l, entries: l.entries.map((x) => (x.id === entryId ? { ...x, packed: !x.packed } : x)) })),
      resetPacked: (listId) => edit(listId, (l) => ({ ...l, entries: l.entries.map((x) => ({ ...x, packed: false })) })),
    };
  }, [lists, ready, updatedAt]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useLists(): ListsStore {
  const s = useContext(Ctx);
  if (!s) throw new Error('useLists must be used inside ListsProvider');
  return s;
}
