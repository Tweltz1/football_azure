import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';

/** One thing to pack. It points at an item in a tote, so the list knows where to grab it from. */
export type ListEntry = { id: string; toteId: string; itemId: string; name: string; packed: boolean };
export type PackingList = { id: string; name: string; entries: ListEntry[]; createdAt: number };

const KEY = 'totetrack.lists.v1';

type ListsStore = {
  lists: PackingList[];
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
  const [lists, setLists] = useState<PackingList[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setLists(JSON.parse(raw)))
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  useEffect(() => {
    if (loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(lists)).catch(() => {});
  }, [lists]);

  const store = useMemo<ListsStore>(() => {
    const edit = (id: string, fn: (l: PackingList) => PackingList) => setLists((prev) => prev.map((l) => (l.id === id ? fn(l) : l)));
    return {
      lists,
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
  }, [lists]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useLists(): ListsStore {
  const s = useContext(Ctx);
  if (!s) throw new Error('useLists must be used inside ListsProvider');
  return s;
}
