// Hood League API: one Supabase Edge Function that serves every /api/* route the React app calls.
// Deployed with verify_jwt = false (see supabase/config.toml) because the CSV download link and
// the health check are public; every other route checks the sign-in token itself in handlers.ts.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { handle, type Ctx } from '../_shared/handlers.ts';
import { getInitialPlayerPool } from '../_shared/playerData.ts';
import { dndRoute } from '../_shared/dnd.ts';
import { askRoute } from '../_shared/footballAsk.ts';
import { cardsRoute } from '../_shared/cards.ts';
import { geminiJunkDetector, junkRoute, type JunkDeps } from '../_shared/junk.ts';
import { createJunkPhotos, createJunkStore } from './junkAdapters.ts';
import { createShopEmailSender } from '../_shared/shopEmail.ts';
import { createTwilioSender, shopRoute, stopReminders, stripeWebhook, type ShopDeps } from '../_shared/shop.ts';
import { incomingSms } from '../_shared/shopSms.ts';
import { createStripe } from '../_shared/shopPlans.ts';
import { createNarrator, geminiNarrator, DEFAULT_GEMINI_MODEL } from './narrator.ts';
import { geminiDamageFinder } from '../_shared/shopDamage.ts';
import { HOWTO_SCHEMA } from '../_shared/shopHowTo.ts';
import { geminiPriceReader } from '../_shared/shopPriceImport.ts';
import { createTurn } from './turn.ts';
import {
  createAccountStore, createAskLogStore, createHowToLibrary, createStaffStore, createBroadcaster, createCardGameStore, createShopStore, createDndStore, createGameStore, createHistoryStore, createLeagueStore, createProfileStore, createSnapshotStore,
} from './supabaseAdapters.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const leagues = createLeagueStore(db);
const profiles = createProfileStore(db);
const history = createHistoryStore(db);
const snapshots = createSnapshotStore(db);
const games = createGameStore(db);
const askLog = createAskLogStore(db);
const cardGames = createCardGameStore(db);
// Repair shop app (Test tab). Texts go through Twilio once its three secrets are set.
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
// Junk App: free stuff nearby. Gemini names the item in the first photo of a listing.
const junk: JunkDeps = {
  store: createJunkStore(db),
  photos: createJunkPhotos(db, SUPABASE_URL),
  detector: GEMINI_KEY ? geminiJunkDetector(GEMINI_KEY, fetch) : null,
  deleteAccount: async (userId) => {
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw error;
  },
};
const dnd = {
  store: createDndStore(db),
  narrator: createNarrator({
    gemini: GEMINI_KEY,
    anthropic: Deno.env.get('ANTHROPIC_API_KEY'),
    model: Deno.env.get('DND_NARRATOR_MODEL'),
  }),
  iceServers: createTurn(Deno.env.get('CLOUDFLARE_TURN_KEY_ID'), Deno.env.get('CLOUDFLARE_TURN_KEY_API_TOKEN')),
};

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}`);
  return await response.json();
}
const broadcaster = createBroadcaster(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

const log = {
  info: (message: string, ...args: unknown[]) => console.log(message, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(message, ...args),
  error: (message: string, ...args: unknown[]) => console.error(message, ...args),
};

interface SignedInUser {
  id: string;
  displayName: string | null;
  email: string | null;
}

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
    displayName: pick('user_name', 'preferred_username', 'full_name', 'name') ?? data.user.email ?? null,
    email: data.user.email ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  // Requests arrive as /api/<route> (the function name, then the route the app asked for).
  const path = url.pathname.replace(/^\/(functions\/v1\/)?api\/?/, '');

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
    const ctx: Ctx = {
      leagues,
      profiles,
      history,
      snapshots,
      games,
      broadcaster,
      log,
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
      playerPool: getInitialPlayerPool,
      fetchJson,
      userId: user?.id ?? null,
      displayName: user?.displayName ?? null,
      userEmail: user?.email ?? null,
    };

    const parts = path.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
    const result = (await shopRoute(ctx, shop, req.method, parts, body))
      ?? (await dndRoute(ctx, dnd, req.method, parts, body))
      ?? (await cardsRoute(ctx, cardGames, req.method, parts, body, url.searchParams))
      ?? (await junkRoute(ctx, junk, req.method, parts, body, url.searchParams))
      ?? (await askRoute(ctx, dnd.narrator, req.method, parts, body, askLog))
      ?? await handle(ctx, req.method, path, url.searchParams, body);
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
