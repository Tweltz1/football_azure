import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { FamilyRow, planSync, sameItem, sharedOf as shared } from './familyMerge';
import { SharedItem, useData } from './store';
import { supabase } from './supabase';

/**
 * Family list: everyone who joins with the same code shares one grocery list. Each item is one row
 * (grocery_family_items) and the newer change wins, so two people can add and check things off at the
 * same time. Aisles stay on each phone, since people may shop at different stores. The tables and
 * functions are made by tools/setup_accounts.py.
 *
 * How a sync works: the last state both sides agreed on (`snap`) tells what changed here since then;
 * anything newer from the cloud is applied here, anything newer here goes up.
 */
export type FamilyInfo = { id: string; code: string; members: { name: string; me: boolean }[] };

type Family = {
  info: FamilyInfo | null;
  /** False until the first answer from the cloud. */
  checked: boolean;
  status: 'off' | 'syncing' | 'synced' | 'error';
  create: () => Promise<FamilyInfo>;
  join: (code: string) => Promise<void>;
  leave: () => Promise<void>;
  syncNow: () => void;
};

const Ctx = createContext<Family | null>(null);
const POLL_MS = 8000;
const infoKey = (uid: string) => `stride.family.${uid}`;
const snapKey = (list: string) => `stride.family.snap.${list}`;

const friendly = (e: unknown) => {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  return new Error(/function .* does not exist|Could not find the function/i.test(m) ? 'Family lists aren’t switched on yet. Try again later.' : m);
};

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const data = useData();
  const [state, setState] = useState<{ uid?: string; info: FamilyInfo | null; checked: boolean }>({ info: null, checked: false });
  const info = state.uid === uid ? state.info : null;
  const checked = state.uid === uid && state.checked;
  const [status, setStatus] = useState<Family['status']>('off');

  const keep = useCallback(
    (next: FamilyInfo | null) => {
      setState({ uid, info: next, checked: true });
      if (uid) AsyncStorage.setItem(infoKey(uid), JSON.stringify(next)).catch(() => {});
    },
    [uid],
  );

  const refresh = useCallback(async () => {
    if (!uid) return;
    const { data: d, error } = await supabase.rpc('grocery_family_info');
    if (!error) keep((d as FamilyInfo | null) ?? null);
    else setState((cur) => ({ uid, info: cur.uid === uid ? cur.info : null, checked: true }));
  }, [uid, keep]);

  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(infoKey(uid))
      .then((raw) => {
        const c = raw ? (JSON.parse(raw) as FamilyInfo | null) : null;
        if (c) setState((cur) => (cur.uid === uid && cur.checked ? cur : { uid, info: c, checked: false }));
      })
      .catch(() => {})
      .finally(() => refresh().catch(() => {}));
  }, [uid, refresh]);

  // ---- Sync ----
  const listId = info?.id;
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  });
  const snap = useRef<Map<string, SharedItem> | null>(null);
  const snapFor = useRef<string | null>(null);
  /** When each item first differed from `snap` on this phone. */
  const changedAt = useRef(new Map<string, number>());
  const running = useRef(false);

  const loadSnap = useCallback(async (list: string) => {
    if (snapFor.current === list && snap.current) return snap.current;
    const raw = await AsyncStorage.getItem(snapKey(list)).catch(() => null);
    const m = new Map<string, SharedItem>(raw ? (JSON.parse(raw) as SharedItem[]).map((i) => [i.id, i]) : []);
    snap.current = m;
    snapFor.current = list;
    changedAt.current = new Map();
    return m;
  }, []);

  // Note when items change here, so the newer side wins.
  useEffect(() => {
    const s = snap.current;
    if (!listId || !s || snapFor.current !== listId) return;
    const now = Date.now();
    const here = new Map(data.items.map((i) => [i.id, shared(i)]));
    for (const [id, item] of here) if ((!s.has(id) || !sameItem(s.get(id)!, item)) && !changedAt.current.has(id)) changedAt.current.set(id, now);
    for (const id of s.keys()) if (!here.has(id) && !changedAt.current.has(id)) changedAt.current.set(id, now);
  }, [data.items, listId]);

  const run = useCallback(async () => {
    const list = listId;
    if (!list || !uid || running.current || !latest.current.ready) return;
    running.current = true;
    setStatus('syncing');
    try {
      const s = await loadSnap(list);
      const started = Date.now();
      const here = new Map(latest.current.items.map((i) => [i.id, shared(i)]));
      const { data: rows, error } = await supabase.from('grocery_family_items').select('id,data,deleted,updated_at').eq('list_id', list).limit(1000);
      if (error) throw error;
      const { changed, removed, up, next } = planSync(s, here, changedAt.current, (rows ?? []) as FamilyRow[], Date.now());
      for (let i = 0; i < up.length; i += 100) {
        const { error: e } = await supabase
          .from('grocery_family_items')
          .upsert(up.slice(i, i + 100).map((u) => ({ list_id: list, ...u })), { onConflict: 'list_id,id' });
        if (e) throw e;
      }
      if (snapFor.current !== list) return; // left or switched lists meanwhile
      snap.current = next;
      // Settled now; anything changed during this sync is caught next time.
      for (const [id, at] of changedAt.current) if (at <= started) changedAt.current.delete(id);
      await AsyncStorage.setItem(snapKey(list), JSON.stringify([...next.values()])).catch(() => {});
      latest.current.applyFamily(changed, removed);
      setStatus('synced');
    } catch {
      setStatus('error');
    } finally {
      running.current = false;
    }
  }, [listId, uid, loadSnap]);

  // Sync soon after a change here, every few seconds while the app is open, and when it comes back.
  useEffect(() => {
    if (!listId) return;
    const t = setTimeout(run, 800);
    return () => clearTimeout(t);
  }, [data.items, listId, run]);
  useEffect(() => {
    if (!listId) return;
    let timer = setInterval(run, POLL_MS);
    const sub = AppState.addEventListener('change', (st) => {
      clearInterval(timer);
      if (st === 'active') {
        refresh().catch(() => {});
        run();
        timer = setInterval(run, POLL_MS);
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [listId, run, refresh]);

  const value = useMemo<Family>(
    () => ({
      info,
      checked,
      status: listId ? status : 'off',
      syncNow: run,
      create: async () => {
        const { data: d, error } = await supabase.rpc('grocery_family_create');
        if (error) throw friendly(error);
        keep(d as FamilyInfo);
        return d as FamilyInfo;
      },
      join: async (code) => {
        const { data: d, error } = await supabase.rpc('grocery_family_join', { invite: code.trim().toUpperCase() });
        if (error) throw friendly(error);
        keep(d as FamilyInfo);
      },
      leave: async () => {
        const { error } = await supabase.rpc('grocery_family_leave');
        if (error) throw friendly(error);
        if (listId) AsyncStorage.removeItem(snapKey(listId)).catch(() => {});
        snap.current = null;
        snapFor.current = null;
        keep(null);
      },
    }),
    [info, checked, status, listId, run, keep],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamily(): Family {
  const f = useContext(Ctx);
  if (!f) throw new Error('useFamily must be used inside FamilyProvider');
  return f;
}
