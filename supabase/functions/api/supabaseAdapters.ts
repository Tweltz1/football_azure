// Postgres storage and Realtime broadcasting for the API, using the service role key.
// Row Level Security is on with no policies, so only this function can read or write the tables.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';
import type {
  Broadcaster, HistoryStore, LeagueStore, LightLeagueState, ProfileStore, ProjectionSnapshot, ProjectionSnapshotStore, StoredLeague,
} from '../_shared/ports.ts';
import type { DraftHistoryEntry, League, UserProfile } from '../_shared/models.ts';

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
