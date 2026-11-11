// Talk Shops API: the Edge Function named `api` in Talk Shops' own Supabase project (talkshops.app).
// Serves only /api/shop/... and /api/health. The hobby apps keep their own `api` function (supabase/functions/api)
// in the shared hood-league project. Deployed by .github/workflows/deploy-talkshops-supabase.yml, which copies
// this file to talkshops/supabase/functions/api/index.ts next to the shared code, so the imports below work in both places.
// verify_jwt = false (talkshops/supabase/config.toml): Twilio, Stripe and the hourly job have no sign-in token.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import type { Ctx } from '../_shared/handlers.ts';
import { createShopEmailSender } from '../_shared/shopEmail.ts';
import { createTwilioSender, runCron, shopRoute, stopReminders, stripeWebhook, type ShopDeps } from '../_shared/shop.ts';
import { incomingSms } from '../_shared/shopSms.ts';
import { createStripe } from '../_shared/shopPlans.ts';
import { geminiNarrator, DEFAULT_GEMINI_MODEL } from '../api/narrator.ts';
import { geminiDamageFinder } from '../_shared/shopDamage.ts';
import { HOWTO_SCHEMA } from '../_shared/shopHowTo.ts';
import { geminiPriceReader } from '../_shared/shopPriceImport.ts';
import { createAccountStore, createSessionStore, createHowToLibrary, createStaffStore, createShopStore } from '../api/supabaseAdapters.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Texts go through Twilio once its three secrets are set.
// The Gemini key, under either spelling (the dashboard secret was saved as Gemini_API_KEY).
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('Gemini_API_KEY') || undefined;
const shop: ShopDeps = {
  store: createShopStore(db),
  claimSalesRequest: async (email) => {
    const { data, error } = await db.rpc('claim_talkshops_sales_request', { p_email: email });
    if (error) throw error;
    return data === true;
  },
  account: createAccountStore(db),
  staff: createStaffStore(db),
  sessions: createSessionStore(db),
  email: createShopEmailSender(Deno.env.get('RESEND_API_KEY'), Deno.env.get('TALKSHOPS_EMAIL_FROM')),
  sms: createTwilioSender(Deno.env.get('TWILIO_ACCOUNT_SID'), Deno.env.get('TWILIO_AUTH_TOKEN'), Deno.env.get('TWILIO_FROM')),
  linkBase: Deno.env.get('SHOP_LINK_BASE') || 'https://talkshops.app/?c=',
  demoDailyLimit: Number(Deno.env.get('DEMO_TEXT_DAILY_LIMIT')) || 10,
  // Plans: payments switch on once STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set.
  stripe: createStripe(Deno.env.get('STRIPE_SECRET_KEY')),
  stripeWebhookSecret: Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
  siteUrl: Deno.env.get('TALKSHOPS_SITE_URL') || 'https://talkshops.app',
  // Employee how-to assistant: the same free Gemini key as the Start/Sit chat, with room for longer answers.
  smartClassifier: GEMINI_KEY ? geminiNarrator(GEMINI_KEY,DEFAULT_GEMINI_MODEL,fetch,{
    schema:{type:'OBJECT',properties:{intent:{type:'STRING',enum:['status','hours','link','approval','review']}},required:['intent']},temperature:0,timeoutMs:8000,maxTokens:256
  }) : null,
  howTo: GEMINI_KEY
    ? geminiNarrator(GEMINI_KEY, DEFAULT_GEMINI_MODEL, fetch, { schema: HOWTO_SCHEMA, primaryTimeoutMs: 25_000, timeoutMs: 40_000, maxTokens: 8192, temperature: 0.4 })
    : null,
  howToLibrary: createHowToLibrary(db),
  damageFinder: GEMINI_KEY ? geminiDamageFinder(GEMINI_KEY, fetch) : null,
  priceReader: GEMINI_KEY ? geminiPriceReader(GEMINI_KEY, fetch) : null,
  // 20 random letters/digits (about 119 bits): unguessable, and short enough to keep the text link in one segment.
  newToken: () => Array.from(crypto.getRandomValues(new Uint8Array(40)), (b) => b).filter((b) => b < 248).slice(0, 20).map((b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('').padEnd(20, 'x'),
};
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-curbsy-device',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

const log = {
  info: (message: string, ...args: unknown[]) => console.log(message, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(message, ...args),
  error: (message: string, ...args: unknown[]) => console.error(message, ...args),
};

interface SignedInUser {
  id: string;
  /** The sign-in session (one per device), from the token's session_id claim. */
  sessionId: string | null;
  displayName: string | null;
  email: string | null;
  createdAt: string | null;
  provider: string | null;
}

function tokenSessionId(token: string): string | null {
  try {
    const part = token.split('.')[1] ?? '';
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof claims?.session_id === 'string' && /^[0-9a-f-]{36}$/i.test(claims.session_id) ? claims.session_id.toLowerCase() : null;
  } catch { return null; }
}

/** False when the request had no sign-in token. Null user with a token means the sign-in was ended or expired. */
const sentToken = (req: Request) => (req.headers.get('Authorization') ?? '').startsWith('Bearer ') && (req.headers.get('Authorization') ?? '').length > 7;

async function getSignedInUser(req: Request): Promise<SignedInUser | null> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;

  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => keys.map((k) => meta[k]).find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  return {
    id: data.user.id,
    sessionId: tokenSessionId(token),
    displayName: pick('user_name', 'preferred_username', 'full_name', 'name') ?? data.user.email ?? null,
    email: data.user.email ?? null,
    createdAt: data.user.created_at ?? null,
    provider: typeof data.user.app_metadata?.provider === 'string' ? data.user.app_metadata.provider : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  // Requests arrive as /api/<route> (the function name, then the route the app asked for).
  const path = url.pathname.replace(/^\/(functions\/v1\/)?api\/?/, '');

  if (req.method === 'GET' && path === 'health') return Response.json({ ok: true, app: 'talkshops' }, { headers: corsHeaders });
  if (req.method === 'POST' && path === 'shop/incoming-sms') {
    try {
      return await incomingSms(req, {
        token: Deno.env.get('TWILIO_AUTH_TOKEN') || '', account: Deno.env.get('TWILIO_ACCOUNT_SID') || '',
        to: Deno.env.get('TWILIO_FROM') || '', url: SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/api/shop/incoming-sms',
      }, async (sid, phone, text, topic) => {
        const {data,error}=await db.rpc('repair_incoming_sms',{p_sid:sid,p_phone:phone,p_body:text,p_topic:topic,p_base:shop.linkBase});
        if(error) throw error;
        return data;
      }, async (phone) => {
        const now = new Date().toISOString();
        for (const job of await shop.store.jobsWithFollowupsFor?.(phone) ?? []) { stopReminders(job, now, 'customer'); job.updatedAt = now; await shop.store.putJob(job); }
      });
    } catch { return new Response('SMS processing unavailable.',{status:503}); }
  }
  // Hourly from GitHub Actions (.github/workflows/talkshops-hourly.yml): reminder texts and morning summary emails.
  if (req.method === 'POST' && path === 'shop/cron') {
    const auth = req.headers.get('Authorization') ?? '';
    if (!SERVICE_ROLE_KEY || auth !== 'Bearer ' + SERVICE_ROLE_KEY) return new Response('Not allowed.', { status: 401 });
    try { return Response.json(await runCron(shop, new Date(), log)); }
    catch (error) { log.error('hourly run failed', error); return new Response('Hourly run failed.', { status: 500 }); }
  }
  // Stripe signs the exact bytes it sends, so this route reads the raw body itself.
  if (req.method === 'POST' && path === 'shop/stripe-webhook') {
    try {
      const res = await stripeWebhook(shop, await req.text(), req.headers.get('Stripe-Signature'), new Date(), log);
      return new Response(typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? null), { status: res.status, headers: { 'Content-Type': typeof res.body === 'string' ? 'text/plain' : 'application/json' } });
    } catch (error) {
      log.error('stripe webhook failed', error);
      return new Response('Webhook error.', { status: 500 });
    }
  }

  let body: unknown = null;
  if (req.method === 'POST' || req.method === 'DELETE') {
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return new Response('Invalid JSON payload.', { status: 400, headers: corsHeaders });
      }
    }
  }

  try {
    const user = await getSignedInUser(req);
    // Talk Shops routes only read the fields below; the hobby-app stores are not part of this project.
    const ctx = {
      log,
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
      userId: user?.id ?? null,
      sessionId: user?.sessionId ?? (sentToken(req) ? tokenSessionId((req.headers.get('Authorization') ?? '').slice(7)) : null),
      userAgent: (req.headers.get('User-Agent') ?? '').slice(0, 300),
      signInRejected: !user && sentToken(req),
      displayName: user?.displayName ?? null,
      userEmail: user?.email ?? null,
      userCreatedAt: user?.createdAt ?? null,
      userProvider: user?.provider ?? null,
    } as unknown as Ctx;

    const parts = path.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
    const result = (await shopRoute(ctx, shop, req.method, parts, body))
      ?? ({ status: 404, body: 'Not found.' } as { status: number; body: unknown; headers?: Record<string, string> });
    const headers: Record<string, string> = { ...corsHeaders, ...(result.headers ?? {}) };

    if (result.body === undefined || result.body === null) {
      return new Response(null, { status: result.status, headers });
    }
    if (typeof result.body === 'string') {
      headers['Content-Type'] = headers['Content-Type'] ?? 'text/plain; charset=utf-8';
      return new Response(result.body, { status: result.status, headers });
    }
    headers['Content-Type'] = 'application/json';
    return new Response(JSON.stringify(result.body), { status: result.status, headers });
  } catch (error) {
    if (path.startsWith('shop/') && error && typeof error === 'object' && 'code' in error && error.code === 'P0001' && 'message' in error && /^All \d+ (?:owner|staff) seats are occupied or reserved\.$/.test(String(error.message))) {
      return new Response(String(error.message),{status:409,headers:corsHeaders});
    }
    log.error(`Unhandled error for ${req.method} ${path}`, error);
    return new Response('Something went wrong. Please try again.', { status: 500, headers: corsHeaders });
  }
});
