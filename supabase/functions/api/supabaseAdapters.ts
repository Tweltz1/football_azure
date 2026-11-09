// Postgres storage and Realtime broadcasting for the API, using the service role key.
// Row Level Security is on with no policies, so only this function can read or write the tables.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';
import type {
  Broadcaster, GameStore, HistoryStore, LeagueStore, LightLeagueState, ProfileStore, ProjectionSnapshot, ProjectionSnapshotStore,
  ScoreRow, StoredLeague,
} from '../_shared/ports.ts';
import type { DraftHistoryEntry, League, UserProfile } from '../_shared/models.ts';
import type { DndCampaignRow, DndCharacterRow, DndStore } from '../_shared/dnd.ts';
import type { AskLogStore } from '../_shared/footballAsk.ts';
import type { CardGameRow, CardGameStore } from '../_shared/cards.ts';
import type { HowToLibrary, SavedAnswer } from '../_shared/shopHowTo.ts';
import { archivedAt, nextFollowup, visitRow, type ArchiveRow, type Job, type JobData, type Shop, type ShopStore } from '../_shared/shop.ts';
import { DEFAULT_TRIAL, type PlanState } from '../_shared/shopPlans.ts';
import type { AccountStore, AuthCode, CodeChannel, CodePurpose } from '../_shared/shopAccount.ts';
import type { Invite, Member, Role, StaffStore } from '../_shared/shopStaff.ts';

const rowToStored = (row: { data: League; version: number }): StoredLeague => ({ league: row.data, version: Number(row.version) });

const columnsFor = (league: League) => ({
  id: league.id,
  name: league.name,
  admin_id: league.adminId,
  members: league.members ?? [],
  data: league,
});

export function createLeagueStore(db: SupabaseClient): LeagueStore {
  return {
    async get(id) {
      const { data, error } = await db.from('leagues').select('data, version').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? rowToStored(data) : null;
    },

    async getLight(id): Promise<LightLeagueState | null> {
      const { data, error } = await db
        .from('leagues')
        .select('status:data->>status, auctionTimer:data->auctionTimer, version')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as LightLeagueState;
      return { status: row.status ?? null, auctionTimer: row.auctionTimer ?? null, version: Number(row.version) };
    },

    async create(league) {
      const { error } = await db.from('leagues').insert({ ...columnsFor(league), version: 1 });
      if (error) throw error;
      return 1;
    },

    async replace(league, expectedVersion) {
      const { data, error } = await db
        .from('leagues')
        .update({ ...columnsFor(league), version: expectedVersion + 1, updated_at: new Date().toISOString() })
        .eq('id', league.id)
        .eq('version', expectedVersion)
        .select('version');
      if (error) throw error;
      return data && data.length > 0 ? Number(data[0].version) : null;
    },

    async delete(id) {
      const { error } = await db.from('leagues').delete().eq('id', id);
      if (error) throw error;
    },

    async findByName(name) {
      const { data, error } = await db.from('leagues').select('data, version').eq('name', name).limit(1);
      if (error) throw error;
      return data && data.length > 0 ? rowToStored(data[0]) : null;
    },

    async listForMember(userId) {
      const { data, error } = await db.from('leagues').select('data, version').contains('members', [userId]);
      if (error) throw error;
      return (data ?? []).map(rowToStored);
    },
  };
}

export function createProfileStore(db: SupabaseClient): ProfileStore {
  return {
    async find(userId) {
      const { data, error } = await db.from('profiles').select('data').eq('id', userId).maybeSingle();
      if (error) throw error;
      return data ? (data.data as UserProfile) : null;
    },
    async upsert(profile) {
      const { error } = await db
        .from('profiles')
        .upsert({ id: profile.userId, data: profile, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
  };
}

export function createHistoryStore(db: SupabaseClient): HistoryStore {
  return {
    async save(entry) {
      const { error } = await db.from('draft_history').upsert({
        id: entry.id,
        league_id: entry.leagueId,
        season: entry.season,
        members: entry.members,
        completed_at: entry.completedAt,
        data: entry,
      });
      if (error) throw error;
    },
    async get(id) {
      const { data, error } = await db.from('draft_history').select('data').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? (data.data as DraftHistoryEntry) : null;
    },
    async listForMember(userId) {
      const { data, error } = await db
        .from('draft_history')
        .select('data')
        .contains('members', [userId])
        .order('completed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => row.data as DraftHistoryEntry);
    },
  };
}

interface ScoreDbRow { game: string; board: string; user_id: string; name: string; score: number; detail: string | null; at: string }
const rowToScore = (r: ScoreDbRow): ScoreRow => ({
  game: r.game, board: r.board, userId: r.user_id, name: r.name, score: Number(r.score), detail: r.detail, at: r.at,
});

export function createGameStore(db: SupabaseClient): GameStore {
  return {
    async getSession(userId, kind) {
      const { data, error } = await db.from('game_sessions').select('data').eq('user_id', userId).eq('kind', kind).maybeSingle();
      if (error) throw error;
      return data ? (data.data as Record<string, unknown>) : null;
    },
    async setSession(userId, kind, value) {
      const { error } = value
        ? await db.from('game_sessions').upsert({ user_id: userId, kind, data: value, updated_at: new Date().toISOString() })
        : await db.from('game_sessions').delete().eq('user_id', userId).eq('kind', kind);
      if (error) throw error;
    },
    async getScore(game, board, userId) {
      const { data, error } = await db.from('game_scores').select('*').eq('game', game).eq('board', board).eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data ? rowToScore(data as ScoreDbRow) : null;
    },
    async putScore(row) {
      const { error } = await db.from('game_scores').upsert({
        game: row.game, board: row.board, user_id: row.userId, name: row.name, score: row.score, detail: row.detail, at: row.at,
      });
      if (error) throw error;
    },
    async deleteScore(game, board, userId) {
      const { error } = await db.from('game_scores').delete().eq('game', game).eq('board', board).eq('user_id', userId);
      if (error) throw error;
    },
    async topScores(game, board, limit, lowFirst) {
      const { data, error } = await db.from('game_scores').select('*').eq('game', game).eq('board', board)
        .order('score', { ascending: lowFirst }).order('at', { ascending: true }).limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => rowToScore(r as ScoreDbRow));
    },
    async countBetter(game, board, score, lowFirst) {
      const query = db.from('game_scores').select('user_id', { count: 'exact', head: true }).eq('game', game).eq('board', board);
      const { count, error } = await (lowFirst ? query.lt('score', score) : query.gt('score', score));
      if (error) throw error;
      return count ?? 0;
    },
  };
}

export function createSnapshotStore(db: SupabaseClient): ProjectionSnapshotStore {
  const read = async (season: number, week: number) => {
    const { data, error } = await db.from('projection_snapshots').select('players').eq('season', season).eq('week', week).maybeSingle();
    if (error) throw error;
    return data ? (data.players as Record<string, ProjectionSnapshot>) : null;
  };
  return {
    get: read,
    async merge(season, week, players) {
      const saved = (await read(season, week)) ?? {};
      const { error } = await db.from('projection_snapshots').upsert({
        season,
        week,
        players: { ...saved, ...players },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
  };
}

/**
 * Sends messages on the public Realtime channel `league:<id>` through the REST broadcast endpoint,
 * so the function doesn't need to hold a websocket open.
 */
export function createBroadcaster(supabaseUrl: string, serviceRoleKey: string): Broadcaster {
  return {
    async send(leagueId, event, payload, toUserId) {
      const response = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ topic: `league:${leagueId}`, event, payload: { payload, toUserId: toUserId ?? null } }],
        }),
      });
      if (!response.ok) {
        throw new Error(`Realtime broadcast failed with ${response.status}: ${await response.text()}`);
      }
    },
  };
}

// ---- Hood Quest ----------------------------------------------------------------------------------

type DndCharDb = { id: string; user_id: string; campaign_id: string | null; name: string; data: Record<string, unknown>; updated_at: string };
type DndCampDb = { id: string; owner_id: string; name: string; members: string[]; data: Record<string, unknown>; created_at: string; updated_at: string };
type DndSessDb = { id: string; campaign_id: string; played_at: string; data: Record<string, unknown> };

const charRow = (r: DndCharDb): DndCharacterRow => ({ id: r.id, userId: r.user_id, campaignId: r.campaign_id, name: r.name, data: r.data ?? {}, updatedAt: r.updated_at });
const campRow = (r: DndCampDb): DndCampaignRow => ({
  id: r.id, ownerId: r.owner_id, name: r.name, members: r.members ?? [], data: r.data ?? {}, createdAt: r.created_at, updatedAt: r.updated_at,
});

export function createDndStore(db: SupabaseClient): DndStore {
  return {
    async listCharacters(userId) {
      const { data, error } = await db.from('dnd_characters').select('*').eq('user_id', userId).limit(100);
      if (error) throw error;
      return (data ?? []).map((r) => charRow(r as DndCharDb));
    },
    async getCharacter(id) {
      const { data, error } = await db.from('dnd_characters').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? charRow(data as DndCharDb) : null;
    },
    async putCharacter(row) {
      const { error } = await db.from('dnd_characters').upsert({
        id: row.id, user_id: row.userId, campaign_id: row.campaignId, name: row.name, data: row.data, updated_at: row.updatedAt,
      });
      if (error) throw error;
    },
    async deleteCharacter(id) {
      const { error } = await db.from('dnd_characters').delete().eq('id', id);
      if (error) throw error;
    },
    async charactersInCampaign(campaignId) {
      const { data, error } = await db.from('dnd_characters').select('*').eq('campaign_id', campaignId).limit(100);
      if (error) throw error;
      return (data ?? []).map((r) => charRow(r as DndCharDb));
    },
    async listCampaigns(userId) {
      const { data, error } = await db.from('dnd_campaigns').select('*').contains('members', [userId]).limit(100);
      if (error) throw error;
      return (data ?? []).map((r) => campRow(r as DndCampDb));
    },
    async getCampaign(id) {
      const { data, error } = await db.from('dnd_campaigns').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? campRow(data as DndCampDb) : null;
    },
    async putCampaign(row) {
      const { error } = await db.from('dnd_campaigns').upsert({
        id: row.id, owner_id: row.ownerId, name: row.name, members: row.members, data: row.data, created_at: row.createdAt, updated_at: row.updatedAt,
      });
      if (error) throw error;
    },
    async listSessions(campaignId) {
      const { data, error } = await db.from('dnd_sessions').select('*').eq('campaign_id', campaignId).order('played_at', { ascending: true }).limit(200);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const s = r as DndSessDb;
        return { id: s.id, campaignId: s.campaign_id, playedAt: s.played_at, data: s.data ?? {} };
      });
    },
    async addSession(row) {
      const { error } = await db.from('dnd_sessions').insert({ id: row.id, campaign_id: row.campaignId, played_at: row.playedAt, data: row.data });
      if (error) throw error;
    },
  };
}

/** Start/Sit chat turns (table ask_log). */
export function createAskLogStore(db: SupabaseClient): AskLogStore {
  return {
    async save(row) {
      const { error } = await db.from('ask_log').insert(row);
      if (error) throw error;
    },
    async findReply(matchKey) {
      const { data, error } = await db.from('ask_log').select('ai_answer, ideas')
        .eq('match_key', matchKey).eq('source', 'gemini').not('ai_answer', 'is', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data ? { ai_answer: data.ai_answer as string, ideas: Array.isArray(data.ideas) ? data.ideas as string[] : [] } : null;
    },
  };
}

type CardGameDb = { id: string; game: string; finished: boolean; summary: Record<string, unknown>; state: Record<string, unknown> | null; created_at: string; updated_at: string };
const cardRow = (r: CardGameDb): CardGameRow => ({
  id: r.id, game: r.game, finished: r.finished, summary: r.summary ?? {}, state: r.state ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
});

export function createCardGameStore(db: SupabaseClient): CardGameStore {
  return {
    async get(id) {
      const { data, error } = await db.from('card_games').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? cardRow(data as CardGameDb) : null;
    },
    async put(row) {
      const { error } = await db.from('card_games').upsert({
        id: row.id, game: row.game, finished: row.finished, summary: row.summary, state: row.state, created_at: row.createdAt, updated_at: row.updatedAt,
      });
      if (error) throw error;
    },
    async list(game, finished, limit) {
      const { data, error } = await db.from('card_games').select('id, game, finished, summary, created_at, updated_at')
        .eq('game', game).eq('finished', finished).order('updated_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => cardRow({ ...(r as CardGameDb), state: null }));
    },
  };
}

interface ShopDb {
  packages?: Shop['packages'] | null;
  age_settings?: Shop['ageSettings'];
  smart_topics:string[]; smart_schedule:Shop['smartSchedule'];
  rates: Shop['rates']; id: string; owner_id: string; name: string; phone: string; hours: string; email?: string | null; created_at: string;
  next_ro: number; plan: PlanState['plan']; plan_status: string | null; trial_ends_at: string | null; plan_interval: PlanState['interval'];
  period_end: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; texts_used: number | null; texts_period: string | null;
}
const SHOP_COLUMNS = 'packages,age_settings,smart_schedule,smart_topics,id, owner_id, name, phone, hours, email, rates, created_at, next_ro, plan, plan_status, trial_ends_at, plan_interval, period_end, stripe_customer_id, stripe_subscription_id, texts_used, texts_period';
interface JobDb { smart_paused:boolean; sms_thread:JobData['messages']; intake: Job['intake']; intake_photos: Job['intakePhotos']; walkaround: Job['walkaround']; bill: Job['bill']; id: string; shop_id: string; token: string; stage: string; data: JobData; created_at: string; updated_at: string }

const shopRow = (r: ShopDb): Shop => ({
  packages:r.packages ?? undefined,ageSettings:r.age_settings,smartSchedule:r.smart_schedule,smartTopics:r.smart_topics, id: r.id, ownerId: r.owner_id, rates: r.rates, name: r.name, phone: r.phone, hours: r.hours, email: r.email ?? '', createdAt: r.created_at,
  plan: {
    plan: r.plan ?? null, status: r.plan_status ?? '', trialEndsAt: r.trial_ends_at, interval: r.plan_interval, periodEnd: r.period_end,
    stripeCustomerId: r.stripe_customer_id, stripeSubscriptionId: r.stripe_subscription_id,
    textsUsed: r.texts_used ?? 0, textsPeriod: r.texts_period ?? '', carsCreated: Math.max(0, (r.next_ro ?? 1001) - 1001),
  },
});
const JOB_COLUMNS = 'smart_paused,sms_thread,id,shop_id,token,stage,data,bill,intake,intake_photos,walkaround,created_at,updated_at';
const jobRow = (r: JobDb): Job => ({
  smartPaused:r.smart_paused, smsThread:r.sms_thread, id: r.id, shopId: r.shop_id, intake: r.intake, intakePhotos: r.intake_photos, walkaround: r.walkaround ?? [], bill: r.bill, token: r.token, stage: r.stage as Job['stage'], data: r.data, createdAt: r.created_at, updatedAt: r.updated_at,
});

export function createShopStore(db: SupabaseClient): ShopStore {
  const oneShop = async (column: string, value: string) => {
    const { data, error } = await db.from('repair_shops').select(SHOP_COLUMNS).eq(column, value).maybeSingle();
    if (error) throw error;
    return data ? shopRow(data as ShopDb) : null;
  };
  const oneJob = async (column: string, value: string) => {
    const { data, error } = await db.from('repair_jobs').select('smart_paused,sms_thread,id,shop_id,token,stage,data,bill,intake,intake_photos,walkaround,created_at,updated_at').eq(column, value).maybeSingle();
    if (error) throw error;
    return data ? jobRow(data as JobDb) : null;
  };
  return {
    shopByOwner: (ownerId) => oneShop('owner_id', ownerId),
    shopById: (id) => oneShop('id', id),
    async pauseSmart(id,paused) {
      const {error}=await db.from('repair_jobs').update({smart_paused:paused}).eq('id',id);
      if(error) throw error;
    },
    async putShop(shop) {
      const { error } = await db.from('repair_shops').upsert({
        ...(shop.packages!==undefined?{packages:shop.packages}:{}),...(shop.ageSettings!==undefined?{age_settings:shop.ageSettings}:{}), ...(shop.smartSchedule!==undefined?{smart_schedule:shop.smartSchedule}:{}), ...(shop.smartTopics!==undefined?{smart_topics:shop.smartTopics}:{}), id: shop.id, owner_id: shop.ownerId, name: shop.name, phone: shop.phone, hours: shop.hours, email: shop.email ?? '', rates: shop.rates ?? [], created_at: shop.createdAt,
      });
      if (error) throw error;
    },
    async listJobs(shopId, since) {
      const { data, error } = await db.from('repair_jobs').select('smart_paused,sms_thread,id,shop_id,token,stage,data,bill,intake,intake_photos,walkaround,created_at,updated_at').eq('shop_id', shopId)
        .or(`and(stage.neq.picked_up,archived_at.is.null),updated_at.gte.${since}`).order('created_at', { ascending: true }).limit(300);
      if (error) throw error;
      return (data ?? []).map((r) => jobRow(r as JobDb));
    },
    getJob: (id) => oneJob('id', id),
    jobByToken: (token) => oneJob('token', token),
    async putJob(job) {
      const { error } = await db.from('repair_jobs').upsert({
        id: job.id, shop_id: job.shopId, token: job.token, stage: job.stage, data: job.data, created_at: job.createdAt, updated_at: job.updatedAt,
        archived_at: archivedAt(job), follow_up_at: nextFollowup(job),
      });
      if (error) throw error;
    },
    async saveIntake(jobId, intake) {
      const { data, error } = await db.from('repair_jobs').update({ intake }).eq('id', jobId).eq('stage','invited').is('intake', null).select('id').maybeSingle();
      if (error) throw error;
      return !!data;
    },
    async intakePhoto(jobId, photo, remove) {
      const { data, error } = await db.rpc('repair_intake_photo', { p_job: jobId, p_photo: photo, p_remove: remove });
      if (error) throw error;
      return data === true;
    },
    async walkaround(jobId, op) {
      const { data, error } = await db.rpc('repair_walkaround', {
        p_job: jobId, p_photo: op.photo ?? null, p_remove: op.remove ?? null, p_marks_for: op.marksFor ?? null, p_marks: op.marks ?? null, p_ai_at: op.aiAt ?? null,
      });
      if (error) throw error;
      return data === true;
    },
    async saveBill(jobId, bill, pdf) {
      const { error } = await db.from('repair_jobs').update({ bill, bill_pdf: pdf }).eq('id', jobId).select('id').single();
      if (error) throw error;
    },
    async getBillPdf(jobId) {
      const { data, error } = await db.from('repair_jobs').select('bill_pdf').eq('id', jobId).single();
      if (error) throw error;
      return data?.bill_pdf ?? null;
    },
    async deleteJob(id) {
      const { error } = await db.from('repair_jobs').delete().eq('id', id);
      if (error) throw error;
    },
    async searchArchive(shopId, since, terms, limit) {
      let q = db.from('repair_jobs')
        .select('id, created_at, archived_at, intake, bill, ro:data->>ro, closed:data->closed, customer:data->customer, vehicle:data->vehicle, plate:data->>plate, concern:data->>concern, estimate:data->estimate')
        .eq('shop_id', shopId).not('archived_at', 'is', null).gte('archived_at', since);
      for (const t of terms) q = q.ilike('search', `%${t}%`);
      const { data, error } = await q.order('archived_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map((r: Record<string, any>): ArchiveRow => ({
        id: r.id, ro: r.ro ?? '', closedReason: r.closed?.reason ?? null, archivedAt: r.archived_at, createdAt: r.created_at, customer: r.customer,
        vehicle: r.intake?.vehicle ?? r.vehicle, plate: r.intake?.plate ?? r.plate ?? '', concern: r.intake?.concern ?? r.concern ?? '',
        total: r.bill?.total ?? ((r.estimate ?? []) as { status: string; price: number }[]).filter((e) => e.status === 'approved').reduce((a, e) => a + Number(e.price), 0),
      }));
    },
    async visits(shopId, q, limit) {
      let r = db.from('repair_jobs').select(JOB_COLUMNS).eq('shop_id', shopId);
      if (q.terms?.length) for (const t of q.terms) r = r.ilike('search', `%${t}%`);
      else {
        const any = [
          ...(q.phone ? [`search.ilike.*${q.phone}*`] : []),
          ...(q.plate ? [`data->>plate.eq.${q.plate}`, `intake->>plate.eq.${q.plate}`] : []),
          ...(q.vin ? [`data->vehicle->>vin.eq.${q.vin}`] : []),
        ];
        if (!any.length) return [];
        r = r.or(any.join(','));
      }
      const { data, error } = await r.order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => visitRow(jobRow(row as JobDb)));
    },
    async dueFollowups(shopId, now, limit) {
      const { data, error } = await db.from('repair_jobs').select(JOB_COLUMNS).eq('shop_id', shopId).lte('follow_up_at', now).order('follow_up_at').limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => jobRow(row as JobDb));
    },
    async claimFollowup(jobId, at) {
      // follow_up_at is cleared here and set again when the job is saved after sending.
      const { data, error } = await db.from('repair_jobs').update({ follow_up_at: null }).eq('id', jobId).eq('follow_up_at', at).select('id');
      if (error) throw error;
      return (data ?? []).length === 1;
    },
    async jobsWithFollowupsFor(phone) {
      const { data, error } = await db.from('repair_jobs').select(JOB_COLUMNS).eq('data->customer->>phone', phone).not('follow_up_at', 'is', null).limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => jobRow(row as JobDb));
    },
    async purgeArchive(shopId, before) {
      const { error } = await db.from('repair_jobs').delete().eq('shop_id', shopId).lt('archived_at', before);
      if (error) throw error;
    },
    async trialSettings() {
      const { data, error } = await db.from('talkshops_settings').select('trial_days, trial_texts, trial_cars').eq('id', true).maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_TRIAL;
      return { trialDays: data.trial_days === 15 ? 15 : 30, trialTexts: Number(data.trial_texts) || 0, trialCars: Number(data.trial_cars) || 0 };
    },
    async startTrial(shopId, endsAt) {
      const { error } = await db.from('repair_shops').update({ plan: 'trial', plan_status: 'trialing', trial_ends_at: endsAt }).eq('id', shopId);
      if (error) throw error;
    },
    async useEmails(shopId, day, limit) {
      const { data, error } = await db.rpc('repair_use_emails', { p_shop: shopId, p_day: day, p_limit: limit });
      if (error) throw error;
      return data === true;
    },
    async useTexts(shopId, n, period, limit) {
      const { data, error } = await db.rpc('repair_use_texts', { p_shop: shopId, p_n: n, p_period: period, p_limit: limit });
      if (error) throw error;
      return data === true;
    },
    async setPlan(shopId, patch) {
      const row: Record<string, unknown> = {};
      if (patch.plan !== undefined) row.plan = patch.plan;
      if (patch.status !== undefined) row.plan_status = patch.status;
      if (patch.interval !== undefined) row.plan_interval = patch.interval;
      if (patch.periodEnd !== undefined) row.period_end = patch.periodEnd;
      if (patch.stripeCustomerId !== undefined) row.stripe_customer_id = patch.stripeCustomerId;
      if (patch.stripeSubscriptionId !== undefined) row.stripe_subscription_id = patch.stripeSubscriptionId;
      const { error } = await db.from('repair_shops').update(row).eq('id', shopId);
      if (error) throw error;
    },
    async nextRo(shopId) {
      const { data, error } = await db.rpc('repair_next_ro', { p_shop: shopId });
      if (error) throw error;
      return Number(data) || 1001;
    },
  };
}

// Talk Shops forgot password (shopAccount.ts): codes, the reset phone, and the auth admin calls.
interface AuthCodeDb { id: string; user_id: string; purpose: CodePurpose; channel: CodeChannel; target: string; code_hash: string; attempts: number; expires_at: string; used_at: string | null; created_at: string }
const codeRow = (r: AuthCodeDb): AuthCode => ({
  id: r.id, userId: r.user_id, purpose: r.purpose, channel: r.channel, target: r.target, codeHash: r.code_hash,
  attempts: r.attempts, expiresAt: r.expires_at, usedAt: r.used_at, createdAt: r.created_at,
});

export function createAccountStore(db: SupabaseClient): AccountStore {
  return {
    async userByEmail(email) {
      const { data, error } = await db.rpc('talkshops_user_by_email', { p_email: email });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { id: string; email: string } | undefined;
      return row?.id ? { id: row.id, email: row.email } : null;
    },
    async setPassword(userId, password, confirmEmail) {
      const { error } = await db.auth.admin.updateUserById(userId, confirmEmail ? { password, email_confirm: true } : { password });
      if (error) throw error;
    },
    async recoveryPhone(userId) {
      const { data, error } = await db.from('talkshops_recovery_phones').select('phone, verified_at').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data ? { phone: data.phone as string, verifiedAt: (data.verified_at as string | null) ?? null } : null;
    },
    async setRecoveryPhone(userId, phone, verifiedAt) {
      const { error } = phone
        ? await db.from('talkshops_recovery_phones').upsert({ user_id: userId, phone, verified_at: verifiedAt, updated_at: new Date().toISOString() })
        : await db.from('talkshops_recovery_phones').delete().eq('user_id', userId);
      if (error) throw error;
    },
    async saveCode(c) {
      const retire = await db.from('talkshops_auth_codes').update({ used_at: c.createdAt }).eq('user_id', c.userId).eq('purpose', c.purpose).is('used_at', null);
      if (retire.error) throw retire.error;
      const { error } = await db.from('talkshops_auth_codes').insert({
        id: c.id, user_id: c.userId, purpose: c.purpose, channel: c.channel, target: c.target, code_hash: c.codeHash,
        attempts: c.attempts, expires_at: c.expiresAt, used_at: c.usedAt, created_at: c.createdAt,
      });
      if (error) throw error;
      // Old codes are no use to anyone after a day.
      await db.from('talkshops_auth_codes').delete().eq('user_id', c.userId).lt('created_at', new Date(Date.parse(c.createdAt) - 86_400_000).toISOString());
    },
    async openCode(userId, purpose, now) {
      const { data, error } = await db.from('talkshops_auth_codes').select('*').eq('user_id', userId).eq('purpose', purpose)
        .is('used_at', null).gt('expires_at', now).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data ? codeRow(data as AuthCodeDb) : null;
    },
    async countCodes(userId, since) {
      const { count, error } = await db.from('talkshops_auth_codes').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
      if (error) throw error;
      return count ?? 0;
    },
    async updateCode(id, patch) {
      const { error } = await db.from('talkshops_auth_codes').update({
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}), ...(patch.usedAt ? { used_at: patch.usedAt } : {}),
      }).eq('id', id);
      if (error) throw error;
    },
  };
}

// Talk Shops staff roles and invites (shopStaff.ts).
interface MemberDb { user_id: string; shop_id: string; role: Role; email: string; name: string; added_at: string }
interface InviteDb { id: string; shop_id: string; email: string; name: string; role: Role; token_hash: string; invited_by: string | null; created_at: string; expires_at: string; accepted_at: string | null }
const memberRow = (r: MemberDb): Member => ({ userId: r.user_id, shopId: r.shop_id, role: r.role, email: r.email, name: r.name, addedAt: r.added_at });
const inviteRow = (r: InviteDb): Invite => ({
  id: r.id, shopId: r.shop_id, email: r.email, name: r.name, role: r.role, tokenHash: r.token_hash, invitedBy: r.invited_by,
  createdAt: r.created_at, expiresAt: r.expires_at, acceptedAt: r.accepted_at,
});

export function createStaffStore(db: SupabaseClient): StaffStore {
  return {
    async memberOf(userId) {
      const { data, error } = await db.from('repair_shop_members').select('*').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data ? memberRow(data as MemberDb) : null;
    },
    async listMembers(shopId) {
      const { data, error } = await db.from('repair_shop_members').select('*').eq('shop_id', shopId).order('added_at');
      if (error) throw error;
      return (data as MemberDb[]).map(memberRow);
    },
    async addMember(m) {
      const { error } = await db.from('repair_shop_members').insert({ user_id: m.userId, shop_id: m.shopId, role: m.role, email: m.email, name: m.name, added_at: m.addedAt });
      if (error?.code === '23505') return false;
      if (error) throw error;
      return true;
    },
    async setRole(shopId, userId, role) {
      const { error } = await db.from('repair_shop_members').update({ role }).eq('shop_id', shopId).eq('user_id', userId);
      if (error) throw error;
    },
    async setName(shopId, userId, name) {
      const { error } = await db.from('repair_shop_members').update({ name }).eq('shop_id', shopId).eq('user_id', userId);
      if (error) throw error;
    },
    async removeMember(shopId, userId) {
      const { error } = await db.from('repair_shop_members').delete().eq('shop_id', shopId).eq('user_id', userId);
      if (error) throw error;
    },
    replacesInvite:true,
    async acceptReserved(i,user,email,name) {
      const {data,error}=await db.rpc('repair_accept_seat',{p_shop:i.shopId,p_id:i.id,p_user:user,p_email:email,p_name:name});
      if(error) throw error;
      return !!data;
    },
    async saveInvite(i) {
      const { error } = await db.rpc('repair_reserve_invite',{p_inv:{
        id: i.id, shop_id: i.shopId, email: i.email, name: i.name, role: i.role, token_hash: i.tokenHash, invited_by: i.invitedBy,
        created_at: i.createdAt, expires_at: i.expiresAt, accepted_at: i.acceptedAt,
      }});
      if (error) throw error;
    },
    async listInvites(shopId) {
      const { data, error } = await db.from('repair_shop_invites').select('*').eq('shop_id', shopId).is('accepted_at', null).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data as InviteDb[]).map(inviteRow);
    },
    async inviteByHash(hash) {
      const { data, error } = await db.from('repair_shop_invites').select('*').eq('token_hash', hash).maybeSingle();
      if (error) throw error;
      return data ? inviteRow(data as InviteDb) : null;
    },
    async claimInvite(id, at) {
      const { data, error } = await db.from('repair_shop_invites').update({ accepted_at: at }).eq('id', id).is('accepted_at', null).select('id').maybeSingle();
      if (error) throw error;
      return !!data;
    },
    async deleteInvite(shopId, id) {
      const { error } = await db.from('repair_shop_invites').delete().eq('shop_id', shopId).eq('id', id);
      if (error) throw error;
    },
  };
}

type HowToDb = { id: string; shop_id: string; make_model: string; year: number | null; engine: string; q_key: string; question: string; vehicle: string; answer: Record<string, unknown>; ratings: Record<string, boolean> | null; uses: number; retired: boolean; created_at: string };
const howToRow = (r: HowToDb): SavedAnswer => ({
  id: r.id, shopId: r.shop_id, makeModel: r.make_model, year: r.year, engine: r.engine ?? '', qKey: r.q_key, question: r.question,
  vehicle: r.vehicle ?? '', answer: r.answer ?? {}, ratings: r.ratings ?? {}, uses: r.uses ?? 1, retired: !!r.retired, createdAt: r.created_at,
});

/** Saved how-to answers for Talk Shops (tables howto_answers and howto_tips). */
export function createHowToLibrary(db: SupabaseClient): HowToLibrary {
  return {
    async candidates(makeModel, { qKey, shopId, since, limit }) {
      let q = db.from('howto_answers').select('*').eq('make_model', makeModel).eq('retired', false).gte('created_at', since);
      if (qKey) q = q.eq('q_key', qKey);
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return (data as HowToDb[]).map(howToRow);
    },
    async get(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await db.from('howto_answers').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? howToRow(data as HowToDb) : null;
    },
    async save(r) {
      const { data, error } = await db.from('howto_answers').insert({
        shop_id: r.shopId, make_model: r.makeModel, year: r.year, engine: r.engine, q_key: r.qKey, question: r.question,
        vehicle: r.vehicle, answer: r.answer, ratings: r.ratings, uses: r.uses, retired: r.retired,
      }).select('id').single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    async update(id, patch) {
      const { error } = await db.from('howto_answers').update(patch).eq('id', id);
      if (error) throw error;
    },
    async tips(answerId, shopId) {
      let q = db.from('howto_tips').select('text, created_at, shop_id').eq('answer_id', answerId);
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q.order('created_at', { ascending: true }).limit(50);
      if (error) throw error;
      return (data as { text: string; created_at: string; shop_id: string }[]).map((t) => ({ text: t.text, createdAt: t.created_at, shopId: t.shop_id }));
    },
    async addTip(answerId, shopId, text) {
      const { error } = await db.from('howto_tips').insert({ answer_id: answerId, shop_id: shopId, text });
      if (error) throw error;
    },
  };
}
