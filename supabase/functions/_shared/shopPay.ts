// Talk Shops: customers pay their final bill from their car's page.
//
// - Online card payments go straight to the shop's own Stripe account (Stripe Connect, Standard accounts). Talk Shops
//   takes no cut. The owner connects once from Settings → Customers & Booking; Stripe handles the sign-up and payouts.
// - A shop that already takes cards elsewhere (Square, Clover, PayPal...) can paste that pay link instead.
// - Staff can record a payment taken at the counter. The bill shows what's paid and what's still due.
//
// Online payments are confirmed by asking Stripe about the Checkout session (when the customer comes back to the page,
// when the page is opened again, or when the shop taps Check), so no extra Stripe webhook needs to be set up.

import type { StripeApi } from './shopPlans.ts';

type Body = Record<string, unknown>;
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Kept on the shop (inside `grow`, so no new column is needed). */
export interface PaySettings {
  /** The shop's connected Stripe account (acct_...). */
  stripeAccount?: string;
  /** Stripe says the account can take card payments. */
  stripeReady?: boolean;
  /** The shop's own pay link from another processor, used when Stripe isn't connected. */
  link?: string;
}
/** One payment against the final bill. */
export interface Payment { id: string; t: string; amount: number; how: 'online' | 'counter'; by: string; session?: string }
/** A Checkout session the customer opened and may still be paying. */
export interface PayPending { session: string; t: string; amount: number }

export const cents = (n: number) => Math.round(n * 100);
/** Stripe's smallest card charge in US dollars. */
export const MIN_ONLINE = 0.5;
const PENDING_MS = 24 * 3600_000;

export const paidTotal = (payments: Payment[] | undefined) => (payments ?? []).reduce((a, p) => a + cents(p.amount), 0) / 100;
export const balanceDue = (billTotal: number, payments: Payment[] | undefined) => Math.max(0, cents(billTotal) - cents(paidTotal(payments))) / 100;
export const payOf = (grow: { pay?: PaySettings } | undefined): PaySettings => grow?.pay ?? {};
export const canPayOnline = (pay: PaySettings, stripe: StripeApi | null | undefined) => !!stripe && !!pay.stripeAccount && !!pay.stripeReady;

/** What the customer page shows about paying. Null until there's a final bill. */
export function customerPay(o: { billTotal: number | null; payments?: Payment[]; pay: PaySettings; stripe?: StripeApi | null; open: boolean }) {
  if (o.billTotal == null) return null;
  const due = balanceDue(o.billTotal, o.payments);
  const online = o.open && due >= MIN_ONLINE && canPayOnline(o.pay, o.stripe);
  return {
    due, paid: paidTotal(o.payments),
    payments: (o.payments ?? []).map((p) => ({ t: p.t, amount: p.amount, how: p.how })),
    online,
    // The shop's own link only when Talk Shops can't take the payment itself.
    link: o.open && due > 0 && !online && o.pay.link ? o.pay.link : null,
  };
}

/** Validates a pay link the owner pasted (https only). '' clears it. */
export function parsePayLink(v: unknown): string | { error: string } {
  const url = str(v, 400);
  if (!url) return '';
  if (!/^https:\/\/[^\s"<>]+\.[^\s"<>]+$/i.test(url)) return { error: 'Paste the full pay link, starting with https://' };
  return url;
}

/** Form fields for a Checkout session on the shop's own Stripe account, for one bill balance. */
export function payCheckoutFields(o: {
  jobId: string; shopId: string; ro: string; shopName: string; amount: number; siteUrl: string; token: string; email?: string; lang?: 'en' | 'es';
}): Record<string, string> {
  const back = o.siteUrl + '/?c=' + encodeURIComponent(o.token);
  return {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(cents(o.amount)),
    'line_items[0][price_data][product_data][name]': `${o.shopName} · Repair order ${o.ro}`.slice(0, 250),
    'metadata[job_id]': o.jobId,
    'metadata[shop_id]': o.shopId,
    'payment_intent_data[description]': `Repair order ${o.ro}`.slice(0, 250),
    'payment_intent_data[metadata][job_id]': o.jobId,
    success_url: back + '&paid={CHECKOUT_SESSION_ID}',
    cancel_url: back,
    ...(o.email ? { customer_email: o.email } : {}),
    ...(o.lang === 'es' ? { locale: 'es' } : {}),
  };
}

/**
 * Asks Stripe whether a Checkout session for this job was paid. Returns the payment to record, or null when it
 * isn't paid (yet), belongs to another job, or was already recorded.
 */
export async function checkSession(stripe: StripeApi, account: string, session: string, jobId: string, payments: Payment[] | undefined, now: string, newId: () => string): Promise<Payment | null> {
  if (!/^cs_[A-Za-z0-9_]{8,200}$/.test(session)) return null;
  if ((payments ?? []).some((p) => p.session === session)) return null;
  const s = await stripe.call('checkout/sessions/' + encodeURIComponent(session), null, account);
  if (s?.payment_status !== 'paid' || s?.metadata?.job_id !== jobId || typeof s.amount_total !== 'number') return null;
  return { id: newId(), t: now, amount: s.amount_total / 100, how: 'online', by: 'Customer (card)', session };
}

/** A pending session older than a day is dropped: Checkout sessions expire after 24 hours. */
export const pendingFresh = (p: PayPending | undefined, now: string) => !!p && Date.parse(now) - Date.parse(p.t) < PENDING_MS;

/** Owner Settings: the Stripe connection and the fallback pay link. */
export async function payRoute(o: {
  method: string; body: Body; stripe?: StripeApi | null; siteUrl: string; shop: { id: string; name: string; email?: string; grow?: { pay?: PaySettings } };
  save: (pay: PaySettings) => Promise<void>; log: { warn(msg: string, data?: unknown): void };
}): Promise<{ status: number; body?: unknown }> {
  const pay = { ...payOf(o.shop.grow) };
  const view = () => ({ available: !!o.stripe, stripe: { connected: !!pay.stripeAccount, ready: !!pay.stripeReady }, link: pay.link ?? '' });
  if (o.method === 'GET') {
    // Refresh whether Stripe has finished setting up the account (after the owner comes back from Stripe).
    if (o.stripe && pay.stripeAccount && !pay.stripeReady) {
      try {
        const a = await o.stripe.call('accounts/' + encodeURIComponent(pay.stripeAccount), null);
        const ready = !!a?.charges_enabled;
        if (ready !== !!pay.stripeReady) { pay.stripeReady = ready; await o.save(pay); }
      } catch (e) { o.log.warn('stripe account check failed', { error: String(e) }); }
    }
    return { status: 200, body: view() };
  }
  if (o.method !== 'POST') return { status: 405 };
  const action = str(o.body.action, 20);
  if (action === 'link') {
    const link = parsePayLink(o.body.link);
    if (typeof link !== 'string') return { status: 400, body: link.error };
    if (link) pay.link = link; else delete pay.link;
    await o.save(pay);
    return { status: 200, body: view() };
  }
  if (action === 'disconnect') {
    delete pay.stripeAccount; delete pay.stripeReady;
    await o.save(pay);
    return { status: 200, body: view() };
  }
  if (action === 'connect') {
    if (!o.stripe) return { status: 503, body: "Card payments aren't switched on yet. Please try again soon." };
    try {
      if (!pay.stripeAccount) {
        const a = await o.stripe.call('accounts', {
          type: 'standard', country: 'US', 'business_profile[name]': o.shop.name.slice(0, 100), 'metadata[shop_id]': o.shop.id,
          ...(o.shop.email ? { email: o.shop.email } : {}),
        });
        if (typeof a?.id !== 'string') throw new Error('no account id');
        pay.stripeAccount = a.id; pay.stripeReady = false;
        await o.save(pay);
      }
      const back = o.siteUrl + '/settings?pay=';
      const link = await o.stripe.call('account_links', { account: pay.stripeAccount!, refresh_url: back + 'retry', return_url: back + 'done', type: 'account_onboarding' });
      return { status: 200, body: { ...view(), url: link.url } };
    } catch (e) {
      o.log.warn('stripe connect failed', { error: String(e) });
      return { status: 502, body: "Stripe didn't answer. Please try again in a minute." };
    }
  }
  return { status: 400, body: 'Unknown action.' };
}
