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
import { archivedAt, type ArchiveRow, type Job, type JobData, type Shop, type ShopStore } from '../_shared/shop.ts';

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

interface ShopDb { rates: Shop['rates']; id: string; owner_id: string; name: string; phone: string; hours: string; email?: string | null; created_at: string }
interface JobDb { intake: Job['intake']; intake_photos: Job['intakePhotos']; bill: Job['bill']; id: string; shop_id: string; token: string; stage: string; data: JobData; created_at: string; updated_at: string }

const shopRow = (r: ShopDb): Shop => ({ id: r.id, ownerId: r.owner_id, rates: r.rates, name: r.name, phone: r.phone, hours: r.hours, email: r.email ?? '', createdAt: r.created_at });
const jobRow = (r: JobDb): Job => ({
  id: r.id, shopId: r.shop_id, intake: r.intake, intakePhotos: r.intake_photos, bill: r.bill, token: r.token, stage: r.stage as Job['stage'], data: r.data, createdAt: r.created_at, updatedAt: r.updated_at,
});

export function createShopStore(db: SupabaseClient): ShopStore {
  const oneShop = async (column: string, value: string) => {
    const { data, error } = await db.from('repair_shops').select('id, owner_id, name, phone, hours, email, rates, created_at').eq(column, value).maybeSingle();
    if (error) throw error;
    return data ? shopRow(data as ShopDb) : null;
  };
  const oneJob = async (column: string, value: string) => {
    const { data, error } = await db.from('repair_jobs').select('id,shop_id,token,stage,data,bill,intake,intake_photos,created_at,updated_at').eq(column, value).maybeSingle();
    if (error) throw error;
    return data ? jobRow(data as JobDb) : null;
  };
  return {
    shopByOwner: (ownerId) => oneShop('owner_id', ownerId),
    shopById: (id) => oneShop('id', id),
    async putShop(shop) {
      const { error } = await db.from('repair_shops').upsert({
        id: shop.id, owner_id: shop.ownerId, name: shop.name, phone: shop.phone, hours: shop.hours, email: shop.email ?? '', rates: shop.rates ?? [], created_at: shop.createdAt,
      });
      if (error) throw error;
    },
    async listJobs(shopId, since) {
      const { data, error } = await db.from('repair_jobs').select('id,shop_id,token,stage,data,bill,intake,intake_photos,created_at,updated_at').eq('shop_id', shopId)
        .or(`stage.neq.picked_up,updated_at.gte.${since}`).order('created_at', { ascending: true }).limit(300);
      if (error) throw error;
      return (data ?? []).map((r) => jobRow(r as JobDb));
    },
    getJob: (id) => oneJob('id', id),
    jobByToken: (token) => oneJob('token', token),
    async putJob(job) {
      const { error } = await db.from('repair_jobs').upsert({
        id: job.id, shop_id: job.shopId, token: job.token, stage: job.stage, data: job.data, created_at: job.createdAt, updated_at: job.updatedAt,
        archived_at: archivedAt(job),
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
    async saveBill(jobId, bill, pdf) {
      const { error } = await db.from('repair_jobs').update({ bill, bill_pdf: pdf }).eq('id', jobId).select('id').single();
      if (error) throw error;
    },
    async getBillPdf(jobId) {
      const { data, error } = await db.from('repair_jobs').select('bill_pdf').eq('id', jobId).single();
      if (error) throw error;
      return data?.bill_pdf ?? null;
    },
    async searchArchive(shopId, since, terms, limit) {
      let q = db.from('repair_jobs')
        .select('id, created_at, archived_at, intake, bill, ro:data->>ro, customer:data->customer, vehicle:data->vehicle, plate:data->>plate, concern:data->>concern, estimate:data->estimate')
        .eq('shop_id', shopId).eq('stage', 'picked_up').gte('archived_at', since);
      for (const t of terms) q = q.ilike('search', `%${t}%`);
      const { data, error } = await q.order('archived_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map((r: Record<string, any>): ArchiveRow => ({
        id: r.id, ro: r.ro ?? '', archivedAt: r.archived_at, createdAt: r.created_at, customer: r.customer,
        vehicle: r.intake?.vehicle ?? r.vehicle, plate: r.intake?.plate ?? r.plate ?? '', concern: r.intake?.concern ?? r.concern ?? '',
        total: r.bill?.total ?? ((r.estimate ?? []) as { status: string; price: number }[]).filter((e) => e.status === 'approved').reduce((a, e) => a + Number(e.price), 0),
      }));
    },
    async purgeArchive(shopId, before) {
      const { error } = await db.from('repair_jobs').delete().eq('shop_id', shopId).eq('stage', 'picked_up').lt('archived_at', before);
      if (error) throw error;
    },
    async nextRo(shopId) {
      const { data, error } = await db.rpc('repair_next_ro', { p_shop: shopId });
      if (error) throw error;
      return Number(data) || 1001;
    },
  };
}
