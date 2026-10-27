// Hood League API: one Supabase Edge Function that serves every /api/* route the React app calls.
// Deployed with verify_jwt = false (see supabase/config.toml) because the CSV download link and
// the health check are public; every other route checks the sign-in token itself in handlers.ts.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { handle, type Ctx } from '../_shared/handlers.ts';
import { getInitialPlayerPool } from '../_shared/playerData.ts';
import {
  createBroadcaster, createGameStore, createHistoryStore, createLeagueStore, createProfileStore, createSnapshotStore,
} from './supabaseAdapters.ts';
import { gameDay } from './gameDay.ts';

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
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  // Requests arrive as /api/<route> (the function name, then the route the app asked for).
  const path = url.pathname.replace(/^\/(functions\/v1\/)?api\/?/, '');

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

  // Chat bar questions it couldn't answer, saved so new rules can be written for them. No account
  // details are kept, only the question.
  if (path === 'ask/miss' && req.method === 'POST') {
    const question = String((body as Record<string, unknown> | null)?.question ?? '').trim().slice(0, 300);
    if (question) {
      const { error } = await db.from('ask_misses').insert({ question });
      if (error) log.warn('Could not save a missed chat question.', error);
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Vegas lines, weather, headlines and the trade deadline for the chat bar. Public data only.
  if (path === 'ask/gameday' && req.method === 'GET') {
    const week = Math.trunc(Number(url.searchParams.get('week')));
    const leagueId = url.searchParams.get('leagueId') ?? '';
    if (!(week >= 1 && week <= 18)) return new Response('Pick a week from 1 to 18.', { status: 400, headers: corsHeaders });
    const data = await gameDay(fetchJson, week, /^[A-Za-z0-9]{1,32}$/.test(leagueId) ? leagueId : null);
    return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
    };

    const result = await handle(ctx, req.method, path, url.searchParams, body);
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
    log.error(`Unhandled error for ${req.method} ${path}`, error);
    return new Response('Something went wrong. Please try again.', { status: 500, headers: corsHeaders });
  }
});
