// Junk App storage on Supabase: the junk_* tables, the junk_search function and the junk-photos bucket.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';
import type { JunkItem, JunkMessage, JunkPhotos, JunkStore } from '../_shared/junk.ts';
import type { JunkClaim } from '../_shared/junkClaims.ts';

interface ClaimDb {
  id: string; item_id: string; owner_id: string; claimer_id: string; claimer_name: string; shared: boolean; piece_ids?: string[]; status: string; reason: string;
  start_km: number; best_km: number; best_at: string; last_km: number; last_ping_at: string; created_at: string;
  deadline_at: string; arrived_at: string | null; ended_at: string | null;
}
const claimRow = (r: ClaimDb): JunkClaim => ({
  id: r.id, itemId: r.item_id, ownerId: r.owner_id, claimerId: r.claimer_id, claimerName: r.claimer_name, shared: !!r.shared, pieceIds: r.piece_ids ?? [],
  status: r.status as JunkClaim['status'], reason: r.reason, startKm: r.start_km, bestKm: r.best_km, bestAt: r.best_at,
  lastKm: r.last_km, lastPingAt: r.last_ping_at, createdAt: r.created_at, deadlineAt: r.deadline_at,
  arrivedAt: r.arrived_at, endedAt: r.ended_at,
});
const claimDb = (c: JunkClaim): ClaimDb => ({
  id: c.id, item_id: c.itemId, owner_id: c.ownerId, claimer_id: c.claimerId, claimer_name: c.claimerName, shared: c.shared, piece_ids: c.pieceIds, status: c.status,
  reason: c.reason, start_km: c.startKm, best_km: c.bestKm, best_at: c.bestAt, last_km: c.lastKm, last_ping_at: c.lastPingAt,
  created_at: c.createdAt, deadline_at: c.deadlineAt, arrived_at: c.arrivedAt, ended_at: c.endedAt,
});
const OPEN = ['active', 'arrived'];

interface ItemDb {
  id: string; owner_id: string; owner_name: string; title: string; description: string; category: string; tags: string[];
  condition: string; pickup: string; photos: string[]; lat: number; lng: number; status: string; ai_detected: boolean; first_come?: boolean; pieces?: JunkItem['pieces']; private_spot?: string; handoff?: string;
  reports: number; search_text: string; created_at: string; updated_at: string;
}
interface MessageDb { id: string; item_id: string; from_id: string; to_id: string; from_name: string; body: string; created_at: string; read_at: string | null }

const itemRow = (r: ItemDb): JunkItem => ({
  id: r.id, ownerId: r.owner_id, ownerName: r.owner_name, title: r.title, description: r.description,
  category: r.category as JunkItem['category'], tags: r.tags ?? [], condition: r.condition as JunkItem['condition'],
  pickup: r.pickup, photos: r.photos ?? [], lat: r.lat, lng: r.lng, status: r.status as JunkItem['status'],
  aiDetected: r.ai_detected, firstCome: !!r.first_come, pieces: Array.isArray(r.pieces) ? r.pieces : [], spot: r.private_spot ?? '', handoff: r.handoff === 'meet' ? 'meet' : 'porch', reports: r.reports, searchText: r.search_text, createdAt: r.created_at, updatedAt: r.updated_at,
});
const itemDb = (i: JunkItem): ItemDb => ({
  id: i.id, owner_id: i.ownerId, owner_name: i.ownerName, title: i.title, description: i.description, category: i.category,
  tags: i.tags, condition: i.condition, pickup: i.pickup, photos: i.photos, lat: i.lat, lng: i.lng, status: i.status,
  ai_detected: i.aiDetected, first_come: !!i.firstCome, pieces: i.pieces, private_spot: i.spot ?? '', handoff: i.handoff ?? 'porch', reports: i.reports, search_text: i.searchText, created_at: i.createdAt, updated_at: i.updatedAt,
});
const messageRow = (r: MessageDb): JunkMessage => ({
  id: r.id, itemId: r.item_id, fromId: r.from_id, toId: r.to_id, fromName: r.from_name, body: r.body, createdAt: r.created_at, readAt: r.read_at,
});

export function createJunkStore(db: SupabaseClient): JunkStore {
  const must = <T>({ data, error }: { data: T; error: unknown }) => {
    if (error) throw error;
    return data;
  };
  return {
    async getItem(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const data = must(await db.from('junk_items').select('*').eq('id', id).maybeSingle());
      return data ? itemRow(data as ItemDb) : null;
    },
    async putItem(item) {
      must(await db.from('junk_items').upsert(itemDb(item)));
    },
    async deleteItem(id) {
      must(await db.from('junk_items').delete().eq('id', id));
    },
    async search(q) {
      const data = must(await db.rpc('junk_search', {
        p_lat: q.lat, p_lng: q.lng, p_km: q.km, p_words: q.words, p_category: q.category, p_sort: q.sort, p_since: q.since, p_limit: q.limit,
      })) as { item: ItemDb; km: number }[] | null;
      return (data ?? []).map((r) => ({ ...itemRow(r.item), km: r.km }));
    },
    async byOwner(ownerId) {
      const data = must(await db.from('junk_items').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false }).limit(200));
      return ((data ?? []) as ItemDb[]).map(itemRow);
    },
    async countItemsSince(ownerId, since) {
      const { count, error } = await db.from('junk_items').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).gte('created_at', since);
      if (error) throw error;
      return count ?? 0;
    },
    async addReport(r) {
      const { error } = await db.from('junk_reports').insert({ id: r.id, item_id: r.itemId, reporter_id: r.reporterId, reason: r.reason, created_at: r.createdAt });
      if (error && (error as { code?: string }).code === '23505') return false; // already reported by this person
      if (error) throw error;
      return true;
    },
    async block(userId, blockedId, at) {
      must(await db.from('junk_blocks').upsert({ user_id: userId, blocked_id: blockedId, created_at: at }));
    },
    async blocked(userId) {
      const data = must(await db.from('junk_blocks').select('blocked_id').eq('user_id', userId));
      return ((data ?? []) as { blocked_id: string }[]).map((r) => r.blocked_id);
    },
    async addMessage(m) {
      must(await db.from('junk_messages').insert({
        id: m.id, item_id: m.itemId, from_id: m.fromId, to_id: m.toId, from_name: m.fromName, body: m.body, created_at: m.createdAt, read_at: m.readAt,
      }));
    },
    async messagesFor(userId, limit) {
      const data = must(await db.from('junk_messages').select('*').or(`from_id.eq.${userId},to_id.eq.${userId}`)
        .order('created_at', { ascending: false }).limit(limit));
      return ((data ?? []) as MessageDb[]).map(messageRow);
    },
    async markRead(userId, itemId, otherId, at) {
      must(await db.from('junk_messages').update({ read_at: at }).eq('to_id', userId).eq('item_id', itemId).eq('from_id', otherId).is('read_at', null));
    },
    async insertClaim(c) {
      const { error } = await db.from('junk_claims').insert(claimDb(c));
      if (error && (error as { code?: string }).code === '23505') return false; // item or person already has an open claim
      if (error) throw error;
      return true;
    },
    async updateClaim(c) {
      must(await db.from('junk_claims').update(claimDb(c)).eq('id', c.id));
    },
    async openClaimsForItems(itemIds) {
      if (!itemIds.length) return [];
      const data = must(await db.from('junk_claims').select('*').in('item_id', itemIds).in('status', OPEN));
      return ((data ?? []) as ClaimDb[]).map(claimRow);
    },
    async latestClaimForUser(userId) {
      const data = must(await db.from('junk_claims').select('*').eq('claimer_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle());
      return data ? claimRow(data as ClaimDb) : null;
    },
    async countClaimsSince(userId, since) {
      const { count, error } = await db.from('junk_claims').select('id', { count: 'exact', head: true }).eq('claimer_id', userId).gte('created_at', since);
      if (error) throw error;
      return count ?? 0;
    },
    async lastEndedClaim(userId, itemId) {
      const data = must(await db.from('junk_claims').select('*').eq('claimer_id', userId).eq('item_id', itemId)
        .not('ended_at', 'is', null).order('ended_at', { ascending: false }).limit(1).maybeSingle());
      return data ? claimRow(data as ClaimDb) : null;
    },
    async countUploadsSince(userId, since) {
      const { count, error } = await db.from('junk_uploads').select('path', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
      if (error) throw error;
      return count ?? 0;
    },
    async logUpload(userId, path, at) {
      must(await db.from('junk_uploads').insert({ user_id: userId, path, created_at: at }));
    },
    async deleteUserData(userId) {
      const uploads = must(await db.from('junk_uploads').select('path').eq('user_id', userId)) as { path: string }[] | null;
      const items = must(await db.from('junk_items').select('photos').eq('owner_id', userId)) as { photos: string[] }[] | null;
      const paths = [...new Set([...(uploads ?? []).map((r) => r.path), ...(items ?? []).flatMap((r) => r.photos ?? [])])];
      must(await db.from('junk_items').delete().eq('owner_id', userId));
      must(await db.from('junk_messages').delete().or(`from_id.eq.${userId},to_id.eq.${userId}`));
      must(await db.from('junk_reports').delete().eq('reporter_id', userId));
      must(await db.from('junk_blocks').delete().or(`user_id.eq.${userId},blocked_id.eq.${userId}`));
      must(await db.from('junk_uploads').delete().eq('user_id', userId));
      must(await db.from('junk_claims').delete().or(`claimer_id.eq.${userId},owner_id.eq.${userId}`));
      must(await db.from('junk_feedback').delete().eq('user_id', userId));
      must(await db.from('junk_label_fixes').delete().eq('user_id', userId));
      // Phones stay on record when banned, so a deleted-and-remade account can't come back on the same phone.
      must(await db.from('junk_devices').delete().eq('user_id', userId).eq('banned', false));
      // A ban outlives the account's data (a deleted account can't come back under the same id anyway).
      must(await db.from('junk_members').delete().eq('user_id', userId).is('banned_at', null));
      return paths;
    },
    async member(userId) {
      const r = must(await db.from('junk_members').select('terms_at, banned_at, joined_at, provider, strikes, ban_reason').eq('user_id', userId).maybeSingle()) as
        { terms_at: string | null; banned_at: string | null; joined_at: string | null; provider: string | null; strikes: number | null; ban_reason: string | null } | null;
      return r ? { termsAt: r.terms_at, bannedAt: r.banned_at, joinedAt: r.joined_at, provider: r.provider, strikes: r.strikes ?? 0, banReason: r.ban_reason ?? '' } : null;
    },
    async seeDevice(userId, deviceId, at, since) {
      must(await db.from('junk_devices').upsert({ device_id: deviceId, user_id: userId, seen_at: at }, { onConflict: 'device_id,user_id' }));
      const rows = must(await db.from('junk_devices').select('user_id, banned, seen_at').eq('device_id', deviceId).limit(100)) as
        { user_id: string; banned: boolean; seen_at: string }[] | null;
      return {
        banned: (rows ?? []).some((r) => r.banned),
        accounts: new Set((rows ?? []).filter((r) => r.seen_at >= since).map((r) => r.user_id)).size,
      };
    },
    async pickupPartners(userId) {
      const data = must(await db.from('junk_claims').select('owner_id, claimer_id').eq('status', 'picked_up')
        .or(`claimer_id.eq.${userId},owner_id.eq.${userId}`).limit(500)) as { owner_id: string; claimer_id: string }[] | null;
      return (data ?? []).map((r) => (r.owner_id === userId ? r.claimer_id : r.owner_id));
    },
    async touchMember(userId, joinedAt, provider) {
      must(await db.from('junk_members').upsert({ user_id: userId, joined_at: joinedAt, provider }, { onConflict: 'user_id' }));
    },
    async acceptTerms(userId, at) {
      // Keeps any ban: only terms_at is written on a conflict.
      must(await db.from('junk_members').upsert({ user_id: userId, terms_at: at }, { onConflict: 'user_id' }));
    },
    async addFeedback(f) {
      must(await db.from('junk_feedback').insert({
        id: f.id, user_id: f.userId, user_name: f.userName, body: f.body, created_at: f.createdAt, kind: f.kind ?? 'contact', item_id: f.itemId ?? null,
      }));
    },
    async countFeedbackSince(userId, since) {
      const { count, error } = await db.from('junk_feedback').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
      if (error) throw error;
      return count ?? 0;
    },
    async addLabelFix(f) {
      must(await db.from('junk_label_fixes').insert({
        id: f.id, user_id: f.userId, app: f.app, guess_label: f.guessLabel, guess_title: f.guessTitle, guess_source: f.guessSource,
        guess_confidence: f.guessConfidence, final_title: f.finalTitle, final_category: f.finalCategory, crop: f.crop, created_at: f.createdAt,
      }));
    },
    async countLabelFixesSince(userId, since) {
      const { count, error } = await db.from('junk_label_fixes').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
      if (error) throw error;
      return count ?? 0;
    },
  };
}

export function createJunkPhotos(db: SupabaseClient, supabaseUrl: string): JunkPhotos {
  const bucket = 'junk-photos';
  const base = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/`;
  return {
    async put(path, jpeg) {
      const { error } = await db.storage.from(bucket).upload(path, jpeg, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (error) throw error;
    },
    async remove(paths) {
      if (!paths.length) return;
      const { error } = await db.storage.from(bucket).remove(paths);
      if (error) throw error;
    },
    url: (path) => base + path.split('/').map(encodeURIComponent).join('/'),
  };
}
