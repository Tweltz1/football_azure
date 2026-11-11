import { savePushToken, sendPurchases } from './junkApi';

// In-app purchases (Curbsy Plus and tips) and notifications, through the iPhone app's StorePlugin and
// PushPlugin (ios-junk-app/ios/App/App/HoodViewController.swift). Not available on the website or in builds
// older than these plugins.

export const PLUS_PRODUCT = 'com.hoodleague.junk.plus.monthly';
export const TIP_PRODUCTS = ['com.hoodleague.junk.tip.small', 'com.hoodleague.junk.tip.medium', 'com.hoodleague.junk.tip.large'];
/** Shown until the App Store's own price loads. */
export const PLUS_PRICE = '$4.99';

const Store = () => (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Store) || null;
const Push = () => (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Push) || null;
const NOT_HERE = 'Purchases work in the Curbsy iPhone app. Update it from the App Store if you don\'t see them.';

export const canBuy = () => !!Store();

/** [{ id, title, description, price, period? }] from the App Store. */
export async function loadProducts(ids) {
  const s = Store();
  if (!s) return [];
  try {
    const r = await s.products({ ids });
    return (r && r.products) || [];
  } catch (error) {
    return [];
  }
}

/**
 * Buys one product for this Curbsy account. Returns { status: 'purchased', plus } with the server's
 * updated Plus status, or { status: 'cancelled' | 'pending' | 'failed' }.
 */
export async function buy(productId, accountId) {
  const s = Store();
  if (!s) throw new Error(NOT_HERE);
  const r = await s.purchase({ id: productId, account: accountId });
  if (r && r.status === 'purchased' && r.jws) return { status: 'purchased', plus: await sendPurchases([r.jws]) };
  return { status: (r && r.status) || 'failed' };
}

/** "Restore purchases": asks the App Store for this Apple ID's purchases and sends them to the server. */
export async function restore() {
  const s = Store();
  if (!s) throw new Error(NOT_HERE);
  const r = await s.restore();
  const list = (r && r.transactions) || [];
  return list.length ? sendPurchases(list) : null;
}

/** Sends the phone's current subscriptions to the server (keeps renewals and cancellations up to date). */
export async function syncPurchases() {
  const s = Store();
  if (!s) return null;
  const r = await s.entitlements();
  const list = (r && r.transactions) || [];
  return list.length ? sendPurchases(list) : null;
}

const listen = (plugin, event, fn) => {
  if (!plugin || !plugin.addListener) return () => {};
  const handle = plugin.addListener(event, fn);
  return () => { Promise.resolve(handle).then((h) => h && h.remove && h.remove()).catch(() => {}); };
};

/** Renewals and purchases finished outside the app: sent to the server, then `done(plus)`. */
export const onStoreUpdates = (done) => listen(Store(), 'transaction', ({ jws }) => {
  if (jws) sendPurchases([jws]).then(done).catch(() => {});
});

/** True in iPhone builds that have Apple's promo code sheet. */
export const canRedeem = () => { const s = Store(); return !!(s && typeof s.redeemCode === 'function'); };

/**
 * Opens Apple's "Redeem code" sheet (promo codes made in App Store Connect), then sends what the
 * phone has to the server. Returns the server's Plus status, or null when nothing came through yet
 * (a late arrival still reaches onStoreUpdates).
 */
export async function redeemCode() {
  const s = Store();
  if (!s || typeof s.redeemCode !== 'function') throw new Error('Update Curbsy from the App Store to use a promo code.');
  await s.redeemCode();
  return syncPurchases();
}

export const manageSubscription = () => {
  const s = Store();
  if (s) return s.manage();
  window.location.assign('https://apps.apple.com/account/subscriptions');
  return Promise.resolve();
};

// ---- Notifications ----

export const canNotify = () => !!Push();

/** 'granted', 'denied', 'ask', or 'none' (not available here). */
export async function alertStatus() {
  const p = Push();
  if (!p) return 'none';
  try { return (await p.status()).status; } catch (error) { return 'none'; }
}

/** Asks for notification permission (once) and saves this phone's token. Returns { ok, reason? }. */
export async function turnOnAlerts() {
  const p = Push();
  if (!p) return { ok: false, reason: 'Alerts work in the Curbsy iPhone app. Update it from the App Store if this keeps showing.' };
  try {
    const r = await p.register();
    if (!r || !r.granted) return { ok: false, reason: 'Notifications are off for Curbsy. Turn them on in Settings > Notifications > Curbsy.' };
    await savePushToken(r.token, !!r.sandbox);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message || 'Couldn\'t turn on alerts.' };
  }
}

/** Keeps the server's token current when permission was already given (tokens can change). */
export async function refreshAlerts() {
  if ((await alertStatus()) === 'granted') await turnOnAlerts();
}

/** A tapped notification: `go(path)` opens the listing. */
export const onAlertOpen = (go) => listen(Push(), 'open', ({ path }) => { if (path && path.startsWith('/junk')) go(path); });
