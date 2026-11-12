import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { supabase } from './supabase';

/**
 * Household sharing: everyone in a household sees and edits the same totes, photos and packing lists.
 * The owner (a Pro subscriber) makes an invite code; family members join with it. A member's phone then
 * syncs the owner's cloud copy (`space`) instead of its own. The functions behind this are made by
 * tools/setup_supabase.py (totetrack_household_*).
 */
export type HouseholdMember = { id: string; email: string | null; owner: boolean; me: boolean };
type Info = { space: string; role: 'solo' | 'owner' | 'member'; members: HouseholdMember[] };

type Household = {
  /** Whose cloud copy this phone syncs: the household owner's account, or your own. Undefined until known. */
  space: string | undefined;
  role: Info['role'];
  members: HouseholdMember[];
  /** True when more than one person shares these totes. */
  shared: boolean;
  /** False until the first answer from the cloud (the last known answer is used meanwhile). */
  checked: boolean;
  invite: () => Promise<string>;
  join: (code: string) => Promise<void>;
  /** Leave the household you joined, or (owner) remove someone. */
  leave: (memberId?: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Household | null>(null);
const cacheKey = (uid: string) => `totetrack.household.${uid}`;

const message = (e: unknown) => {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  return new Error(/function .* does not exist|Could not find the function/i.test(m) ? 'Household sharing isn’t switched on yet. Try again later.' : m);
};

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  // Kept with the account it belongs to, so a different sign-in never sees the last one's household.
  const [state, setState] = useState<{ uid?: string; info: Info | null; checked: boolean }>({ info: null, checked: false });
  const info = state.uid === uid ? state.info : null;
  const checked = state.uid === uid && state.checked;
  const setInfo = useCallback((next: Info | null, done?: boolean) => setState((cur) => ({ uid, info: next ?? (cur.uid === uid ? cur.info : null), checked: done ?? (cur.uid === uid && cur.checked) })), [uid]);
  const setChecked = useCallback(() => setState((cur) => ({ uid, info: cur.uid === uid ? cur.info : null, checked: true })), [uid]);

  const keep = useCallback(
    (next: Info) => {
      setInfo(next, true);
      if (uid) AsyncStorage.setItem(cacheKey(uid), JSON.stringify(next)).catch(() => {});
    },
    [uid, setInfo],
  );

  const refresh = useCallback(async () => {
    if (!uid) return;
    const { data, error } = await supabase.rpc('totetrack_household_info');
    // Before the cloud functions exist (or offline), keep syncing your own totes.
    if (!error && data) keep(data as Info);
    else setChecked();
  }, [uid, keep, setChecked]);

  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(cacheKey(uid))
      .then((raw) => {
        const c = raw ? (JSON.parse(raw) as Info) : null;
        if (c) setState((cur) => (cur.uid === uid && cur.info ? cur : { uid, info: c, checked: cur.uid === uid && cur.checked }));
      })
      .catch(() => {})
      .finally(() => refresh().catch(() => setChecked()));
    // Someone may have joined, left or removed you while the app was closed.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh().catch(() => {}));
    return () => sub.remove();
  }, [uid, refresh, setChecked]);

  const value = useMemo<Household>(() => {
    const role = info?.role ?? 'solo';
    return {
      space: uid ? (info?.space ?? (checked ? uid : undefined)) : undefined,
      role,
      members: info?.members ?? [],
      shared: (info?.members.length ?? 0) > 1,
      checked,
      refresh,
      invite: async () => {
        const { data, error } = await supabase.rpc('totetrack_household_invite');
        if (error) throw message(error);
        return String(data);
      },
      join: async (code) => {
        const { data, error } = await supabase.rpc('totetrack_household_join', { invite: code.trim().toUpperCase() });
        if (error) throw message(error);
        keep(data as Info);
      },
      leave: async (memberId) => {
        const { data, error } = await supabase.rpc('totetrack_household_leave', memberId ? { member: memberId } : {});
        if (error) throw message(error);
        keep(data as Info);
      },
    };
  }, [info, uid, checked, refresh, keep]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHousehold(): Household {
  const h = useContext(Ctx);
  if (!h) throw new Error('useHousehold must be used inside HouseholdProvider');
  return h;
}
