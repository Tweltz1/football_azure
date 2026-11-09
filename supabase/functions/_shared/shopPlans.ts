// Talk Shops plans: a free trial (15 or 30 days, limited texts and cars), then a paid plan through Stripe.
// Card details never reach this server: shops pay on Stripe Checkout and manage billing in Stripe's
// customer portal. Stripe tells us about payments through a signed webhook, which is the only thing
// that can mark a shop as paid.

export type PlanKey = 'starter' | 'pro';
export type Interval = 'month' | 'year';

export const PLANS: Record<PlanKey, { name: string; month: number; year: number; texts: number; blurb: string; howTo: boolean }> = {
  starter: { name: 'Starter', month: 89, year: 890, texts: 1000, blurb: '3 staff seats (up to 2 owners), 1,000 texts a month, unlimited email', howTo: false },
  pro: { name: 'Pro', month: 149, year: 1490, texts: 3000, blurb: '8 staff seats (up to 3 owners), 3,000 texts a month, unlimited email, AI repair how-to assistant and Smart Replies', howTo: true },
};

/** Trial rules, kept in the talkshops_settings table so they can be changed without a deploy. */
export interface TrialSettings { trialDays: 15 | 30; trialTexts: number; trialCars: number }
export const DEFAULT_TRIAL: TrialSettings = { trialDays: 30, trialTexts: 150, trialCars: 25 };

/** Billing columns on repair_shops. `plan` null means a shop made before plans existed: no limits. */
export interface PlanState {
  plan: 'trial' | PlanKey | null;
  status: string;
  trialEndsAt: string | null;
  interval?: Interval | null;
  periodEnd?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  textsUsed: number;
  textsPeriod: string;
  carsCreated: number;
}

export type AccessState = 'free' | 'trial' | 'trial_ended' | 'active' | 'past_due' | 'canceled';
export interface Access {
  state: AccessState;
  /** May the shop check in cars and send updates? */
  canWork: boolean;
  /** Text allowance for the current period, or null for no cap. */
  textLimit: number | null;
  /** Counting bucket for texts: "trial", or the month like "2026-11". */
  period: string;
  carLimit: number | null;
  trialEndsAt: string | null;
  daysLeft: number | null;
}

const PAID_OK = ['active', 'trialing', 'past_due'];

export function access(p: PlanState | undefined | null, now: Date, trial: TrialSettings): Access {
  const month = now.toISOString().slice(0, 7);
  const ends = p?.trialEndsAt ?? null;
  const daysLeft = ends ? Math.max(0, Math.ceil((Date.parse(ends) - now.getTime()) / 86_400_000)) : null;
  const base = { trialEndsAt: ends, daysLeft };
  if (!p || p.plan === null) return { ...base, state: 'free', canWork: true, textLimit: null, period: month, carLimit: null };
  if (p.plan !== 'trial' && PAID_OK.includes(p.status)) {
    return { ...base, state: p.status === 'past_due' ? 'past_due' : 'active', canWork: true, textLimit: null, period: month, carLimit: null };
  }
  if (ends && Date.parse(ends) > now.getTime()) {
    return { ...base, state: 'trial', canWork: true, textLimit: trial.trialTexts, period: 'trial', carLimit: trial.trialCars };
  }
  return { ...base, state: p.plan === 'trial' ? 'trial_ended' : 'canceled', canWork: false, textLimit: 0, period: month, carLimit: 0 };
}

/**
 * The AI repair how-to assistant is a Pro feature. Free-trial shops can try it, and shops from before
 * plans existed keep it. Starter, ended trials and canceled plans don't have it.
 */
export function hasHowTo(p: PlanState | undefined | null, a: Access): boolean {
  if (a.state === 'free' || a.state === 'trial') return true;
  if (a.state === 'active' || a.state === 'past_due') return !!(p && p.plan && p.plan !== 'trial' && PLANS[p.plan]?.howTo);
  return false;
}
export const HOWTO_PRO_MESSAGE = 'The How-to assistant is part of Talk Shops Pro. Switch to Pro on the Plan tab to use it.';

export const lockedMessage = (a: Access) => a.state === 'canceled'
  ? 'Your Talk Shops plan has ended. Choose a plan on the Plan tab to keep sending updates.'
  : 'Your free trial has ended. Choose a plan on the Plan tab to keep sending updates.';

// ---------------- Stripe ----------------

export interface StripeApi {
  /** POSTs form fields to https://api.stripe.com/v1/<path> (or GETs when fields is null) and returns the JSON. */
  call(path: string, fields: Record<string, string> | null): Promise<Record<string, any>>;
}

export function createStripe(secretKey: string | undefined, fetchImpl: typeof fetch = fetch): StripeApi | null {
  if (!secretKey) return null;
  return {
    async call(path, fields) {
      const res = await fetchImpl('https://api.stripe.com/v1/' + path, {
        method: fields ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + secretKey, ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        body: fields ? new URLSearchParams(fields) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('Stripe: ' + (data?.error?.message || res.status));
      return data;
    },
  };
}

/** Form fields for a Stripe Checkout session that starts a subscription for one shop. */
export function checkoutFields(o: {
  shopId: string; plan: PlanKey; interval: Interval; siteUrl: string; customerId?: string | null; email?: string | null;
  trialEndsAt?: string | null; now: Date;
}): Record<string, string> {
  const p = PLANS[o.plan];
  const f: Record<string, string> = {
    mode: 'subscription',
    client_reference_id: o.shopId,
    'metadata[shop_id]': o.shopId,
    'subscription_data[metadata][shop_id]': o.shopId,
    'subscription_data[metadata][plan]': o.plan,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String((o.interval === 'year' ? p.year : p.month) * 100),
    'line_items[0][price_data][recurring][interval]': o.interval,
    'line_items[0][price_data][product_data][name]': `Talk Shops ${p.name}`,
    allow_promotion_codes: 'true',
    success_url: o.siteUrl + '/?plan=success',
    cancel_url: o.siteUrl + '/?plan=canceled',
  };
  if (o.customerId) f.customer = o.customerId;
  else if (o.email) f.customer_email = o.email;
  // Paying early keeps the rest of the free trial: the first charge waits until the trial ends.
  // Stripe needs the trial end at least 48 hours away.
  if (o.trialEndsAt && Date.parse(o.trialEndsAt) - o.now.getTime() > 49 * 3_600_000) {
    f['subscription_data[trial_end]'] = String(Math.floor(Date.parse(o.trialEndsAt) / 1000));
  }
  return f;
}

/** Checks a Stripe-Signature header ("t=...,v1=...") against the raw body. */
export async function verifyStripeSignature(raw: string, header: string | null, secret: string, now: Date, toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(',').map((x) => x.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false;
  if (Math.abs(now.getTime() / 1000 - Number(t)) > toleranceSec) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => {
    if (s.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

/** The plan columns a Stripe subscription object maps to. */
export function planFromSubscription(sub: Record<string, any>): { shopId: string | null; patch: Partial<PlanState> } {
  const item = sub.items?.data?.[0] ?? {};
  const plan = sub.metadata?.plan === 'pro' ? 'pro' : 'starter';
  const end = sub.current_period_end ?? item.current_period_end ?? null;
  const interval = item.price?.recurring?.interval ?? item.plan?.interval ?? null;
  return {
    shopId: typeof sub.metadata?.shop_id === 'string' ? sub.metadata.shop_id : null,
    patch: {
      plan, status: String(sub.status || 'incomplete'),
      interval: interval === 'year' ? 'year' : interval === 'month' ? 'month' : null,
      periodEnd: typeof end === 'number' ? new Date(end * 1000).toISOString() : null,
      stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
      stripeSubscriptionId: sub.id ?? null,
    },
  };
}
