// Junk App storage on Supabase: the junk_* tables, the junk_search function and the junk-photos bucket.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';
import type { JunkItem, JunkMessage, JunkPhotos, JunkStore } from '../_shared/junk.ts';

interface ItemDb {
  id: string; owner_id: string; owner_name: string; title: string; description: string; category: string; tags: string[];
  condition: string; pickup: string; photos: string[]; lat: number; lng: number; status: string; ai_detected: boolean;
  reports: number; search_text: string; created_at: string; updated_at: string;
}
interface MessageDb { id: string; item_id: string; from_id: string; to_id: string; from_name: string; body: string; created_at: string; read_at: string | null }

const itemRow = (r: ItemDb): JunkItem => ({
  id: r.id, ownerId: r.owner_id, ownerName: r.owner_name, title: r.title, description: r.description,
  category: r.category as JunkItem['category'], tags: r.tags ?? [], condition: r.condition as JunkItem['condition'],
  pickup: r.pickup, photos: r.photos ?? [], lat: r.lat, lng: r.lng, status: r.status as JunkItem['status'],
  aiDetected: r.ai_detected, reports: r.reports, searchText: r.search_text, createdAt: r.created_at, updatedAt: r.updated_at,
});
const itemDb = (i: JunkItem): ItemDb => ({
  id: i.id, owner_id: i.ownerId, owner_name: i.ownerName, title: i.title, description: i.description, category: i.category,
  tags: i.tags, condition: i.condition, pickup: i.pickup, photos: i.photos, lat: i.lat, lng: i.lng, status: i.status,
  ai_detected: i.aiDetected, reports: i.reports, search_text: i.searchText, created_at: i.createdAt, updated_at: i.updatedAt,
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
      return paths;
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
