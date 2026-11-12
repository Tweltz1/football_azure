import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { StoreEntitlement, StoreProduct, ToteNative } from '../../modules/tote-native';
import { useHousehold } from './household';
import { useTotes } from './store';

/**
 * ToteTrack Pro: the first FREE_TOTE_LIMIT totes are free, Pro allows any number. Snap to add (naming
 * what's in a tote from a photo) is a Pro feature with FREE_SNAPS tries for everyone.
 * Nobody ever loses a tote: over the limit you can still open, edit, scan and empty every tote you
 * have; only making another new one asks for Pro. Change the numbers here; prices live in App Store Connect.
 */
export const FREE_TOTE_LIMIT = 10;
export const FREE_SNAPS = 5;
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
const SNAPS_KEY = 'totetrack.snapsUsed.v1';

type Cached = { productId: string; expires: number };

type Pro = {
  /** Has an active ToteTrack Pro subscription. */
  isPro: boolean;
  /** Not subscribed, but in a Pro member's household, so Pro limits don't apply. */
  householdPro: boolean;
  /** Which plan, when Pro. */
  plan?: string;
  /** False until the first App Store check (cached status is used meanwhile). */
  checked: boolean;
  /** True while there's room for another tote (Pro, or under the free limit). */
  canAddTote: boolean;
  /** Free totes left, or null with Pro. */
  freeLeft: number | null;
  /** True while Snap to add can run (Pro, or free tries left). */
  canSnap: boolean;
  /** Free Snap to add tries left, or null with Pro. */
  freeSnapsLeft: number | null;
  /** Counts one free Snap to add try. */
  usedSnap: () => void;
  products: StoreProduct[];
  /** False in builds without the native module (Expo Go, web). */
  available: boolean;
  buy: (productId: string) => Promise<'purchased' | 'pending' | 'cancelled'>;
  restore: () => Promise<boolean>;
  /** Opens Apple's promo code sheet. True when Pro is on afterwards (a slow code still turns it on later). */
  redeem: () => Promise<boolean>;
  /** False in builds without the promo code sheet. */
  canRedeem: boolean;
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
  const household = useHousehold();
  const [active, setActive] = useState<Cached | null>(null);
  const [checked, setChecked] = useState(!ToteNative);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const answered = useRef(false);
  const [snapsUsed, setSnapsUsed] = useState(0);

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
    AsyncStorage.getItem(SNAPS_KEY)
      .then((raw) => setSnapsUsed(Number(raw) || 0))
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
    // One Pro subscription covers the household: people who joined it get unlimited totes and Snap to add.
    const covered = isPro || household.role === 'member';
    return {
      isPro,
      householdPro: !isPro && covered,
      plan: isPro ? active?.productId : undefined,
      checked,
      canAddTote: covered || totes.length < FREE_TOTE_LIMIT,
      freeLeft: covered ? null : Math.max(0, FREE_TOTE_LIMIT - totes.length),
      canSnap: covered || snapsUsed < FREE_SNAPS,
      freeSnapsLeft: covered ? null : Math.max(0, FREE_SNAPS - snapsUsed),
      usedSnap: () => {
        if (covered) return;
        setSnapsUsed((n) => {
          AsyncStorage.setItem(SNAPS_KEY, String(n + 1)).catch(() => {});
          return n + 1;
        });
      },
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
      redeem: async () => {
        if (!ToteNative?.storeRedeemCode) throw new Error('Update ToteTrack from the App Store to use a promo code.');
        return !!apply(await ToteNative.storeRedeemCode());
      },
      canRedeem: !!ToteNative?.storeRedeemCode,
      refresh,
    };
  }, [active, checked, totes.length, snapsUsed, products, refresh, apply, household.role]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePro(): Pro {
  const p = useContext(Ctx);
  if (!p) throw new Error('usePro must be used inside ProProvider');
  return p;
}
