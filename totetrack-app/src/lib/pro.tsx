import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { StoreEntitlement, StoreProduct, ToteNative } from '../../modules/tote-native';
import { useTotes } from './store';

/**
 * ToteTrack Pro: the first FREE_TOTE_LIMIT totes are free, Pro allows any number.
 * Nobody ever loses a tote: over the limit you can still open, edit, scan and empty every tote you
 * have; only making another new one asks for Pro. Change the numbers here; prices live in App Store Connect.
 */
export const FREE_TOTE_LIMIT = 10;
export const PRO_PRODUCTS = {
  monthly: 'com.tweltz1.totetrack.pro.monthly',
  yearly: 'com.tweltz1.totetrack.pro.yearly',
} as const;
const PRO_IDS: string[] = Object.values(PRO_PRODUCTS);

/** Shown before the App Store answers (and in builds without StoreKit). */
export const FALLBACK_PRICES = { monthly: '$1.99', yearly: '$14.99' };

export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const PRIVACY_URL = 'https://github.com/Tweltz1/football_azure/blob/claude/totetrack-app/totetrack-app/PRIVACY.md';
export const MANAGE_URL = 'https://apps.apple.com/account/subscriptions';

const CACHE_KEY = 'totetrack.pro.v1';

type Cached = { productId: string; expires: number };

type Pro = {
  /** Has an active ToteTrack Pro subscription. */
  isPro: boolean;
  /** Which plan, when Pro. */
  plan?: string;
  /** False until the first App Store check (cached status is used meanwhile). */
  checked: boolean;
  /** True while there's room for another tote (Pro, or under the free limit). */
  canAddTote: boolean;
  /** Free totes left, or null with Pro. */
  freeLeft: number | null;
  products: StoreProduct[];
  /** False in builds without the native module (Expo Go, web). */
  available: boolean;
  buy: (productId: string) => Promise<'purchased' | 'pending' | 'cancelled'>;
  restore: () => Promise<boolean>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Pro | null>(null);

function activeOf(list: StoreEntitlement[]): Cached | null {
  const now = Date.now();
  const e = list.find((x) => PRO_IDS.includes(x.productId) && (x.expires === 0 || x.expires > now));
  return e ? { productId: e.productId, expires: e.expires } : null;
}

export function ProProvider({ children }: { children: ReactNode }) {
  const { totes } = useTotes();
  const [active, setActive] = useState<Cached | null>(null);
  const [checked, setChecked] = useState(!ToteNative);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const answered = useRef(false);

  const apply = useCallback((list: StoreEntitlement[]) => {
    const a = activeOf(list);
    answered.current = true;
    setActive(a);
    setChecked(true);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(a)).catch(() => {});
    return a;
  }, []);

  const refresh = useCallback(async () => {
    if (!ToteNative) return;
    try {
      apply(await ToteNative.storeEntitlements());
    } catch {
      setChecked(true);
    }
  }, [apply]);

  useEffect(() => {
    // The last known status first, so Pro works offline; StoreKit's answer replaces it.
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        const c = raw ? (JSON.parse(raw) as Cached | null) : null;
        if (!answered.current && c && (c.expires === 0 || c.expires > Date.now())) setActive(c);
      })
      .catch(() => {});
    ToteNative?.storeEntitlements()
      .then(apply)
      .catch(() => setChecked(true));
    ToteNative?.storeProducts(PRO_IDS)
      .then((p) => setProducts([...p].sort((a, b) => a.priceValue - b.priceValue)))
      .catch(() => {});
    const app = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const store = ToteNative?.addListener?.('onPurchasesChanged', () => refresh());
    return () => {
      app.remove();
      store?.remove();
    };
  }, [refresh, apply]);

  const value = useMemo<Pro>(() => {
    const isPro = !!active;
    return {
      isPro,
      plan: isPro ? active?.productId : undefined,
      checked,
      canAddTote: isPro || totes.length < FREE_TOTE_LIMIT,
      freeLeft: isPro ? null : Math.max(0, FREE_TOTE_LIMIT - totes.length),
      products,
      available: !!ToteNative,
      buy: async (productId) => {
        if (!ToteNative) throw new Error('Subscriptions work in the App Store version of ToteTrack.');
        const r = await ToteNative.storePurchase(productId);
        if (r === 'purchased') await refresh();
        return r;
      },
      restore: async () => {
        if (!ToteNative) return false;
        return !!apply(await ToteNative.storeRestore());
      },
      refresh,
    };
  }, [active, checked, totes.length, products, refresh, apply]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePro(): Pro {
  const p = useContext(Ctx);
  if (!p) throw new Error('usePro must be used inside ProProvider');
  return p;
}
