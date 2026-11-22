// Store managers inside the app: the same store-portal function as the website, signed in with the
// shopper's own Shop Stride account (its access token is the manager token). Tyler's approvals use the
// admin password, typed once and kept on this phone.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { Store } from './types';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://nkwedlskhnojseeroezm.supabase.co';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const FN = `${URL_}/functions/v1/store-portal`;
export const PORTAL_WEB = 'https://weltzcraft.com/shopstride/stores/';

/** Chains a store can be claimed for (the backend's PARTNER_CHAINS). */
export const CLAIM_CHAINS = ['kroger', 'walmart', 'target', 'hyvee', 'costco', 'aldi', 'woodmans'];

async function post<T>(body: Record<string, unknown>, headers: Record<string, string>): Promise<T> {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(KEY ? { apikey: KEY } : {}), ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Something went wrong (${res.status}).`);
  return data as T;
}

/** A call as the signed-in shopper (manager). */
export async function managerCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in first.');
  return post<T>(body, { 'x-manager-token': token });
}

const ADMIN_KEY = 'shopstride.storeAdmin';
export const getAdminKey = () => AsyncStorage.getItem(ADMIN_KEY).catch(() => null);
export const setAdminKey = (k: string | null) => (k ? AsyncStorage.setItem(ADMIN_KEY, k) : AsyncStorage.removeItem(ADMIN_KEY)).catch(() => {});
export async function adminCall<T>(body: Record<string, unknown>): Promise<T> {
  const key = await getAdminKey();
  if (!key) throw new Error('Enter the admin password first.');
  return post<T>(body, { 'x-admin-key': key });
}

export type ManagedStore = { id: string; name: string; chain: string; address: string | null };
export type MyClaim = { id: string; store_name: string; status: 'pending' | 'approved' | 'rejected'; decided_note: string | null; created_at: string };
export type Me = { email: string; stores: ManagedStore[]; claims: MyClaim[] };
export type FoundPartner = { id: string; name: string; address: string | null; claimed?: boolean; pending?: boolean };

export type StoreData = {
  store: { id: string; name: string; address: string | null; notice: string | null };
  layout: { category: string; aisle: string | null; department: string | null }[];
  deals: { id: number; item: string; price: string | null; ends_on: string | null }[];
  outs: { id: number; item: string; until: string | null }[];
};

export type AdminClaim = {
  id: string; email: string; person: string; title: string | null; phone: string | null; partner_id: string | null;
  chain: string; store_name: string; address: string | null; lat: number | null; lon: number | null;
  note: string | null; work_email: boolean; status: string; created_at: string;
};

/** Where the app's chosen store is, for claiming it: from the map pin, or rounded into its id. */
export function storePlace(store: Store): { lat: number; lon: number } | null {
  if (store.lat != null && store.lon != null) return { lat: store.lat, lon: store.lon };
  const m = store.id.match(/^[a-z]+:g(m?)(\d{1,6})x(m?)(\d{1,6})$/);
  return m ? { lat: (m[1] ? -1 : 1) * (+m[2] / 1000), lon: (m[3] ? -1 : 1) * (+m[4] / 1000) } : null;
}

/** Can the app's chosen store be claimed as it is (a known chain with a location or official id)? */
export function claimable(store: Store | null): boolean {
  if (!store || !CLAIM_CHAINS.includes(store.chain)) return false;
  return !!storePlace(store) || /^(kroger|walmart):[0-9a-z-]+$/.test(store.id);
}
