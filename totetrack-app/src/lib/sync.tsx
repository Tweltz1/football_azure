import AsyncStorage from '@react-native-async-storage/async-storage';
import { PackingList, useLists } from './lists';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { useHousehold } from './household';
import { notifyPhotosChanged, photoUri } from './photos';
import { RemoteTote, useTotes } from './store';
import { PHOTO_TABLE, supabase, TABLE, LIST_TABLE } from './supabase';
import { Tote } from './types';

/**
 * Keeps the phone's totes and the signed-in user's cloud copy in step. The phone stays the source
 * of truth while offline; each tote (or deletion) carries an updatedAt time and the newer side wins.
 */
type SyncState = {
  status: 'off' | 'syncing' | 'synced' | 'error';
  lastSynced?: number;
  error?: string;
  syncNow: () => void;
  /** Waits for any sync in progress, then syncs once more. True if everything reached the cloud. */
  finishSync: () => Promise<boolean>;
  /**
   * Deletes everything this account has backed up and, unless the same sign-in is also used by
   * another of our apps, the account itself. Returns which of the two happened.
   */
  deleteAccount: () => Promise<'account' | 'data'>;
};

const Ctx = createContext<SyncState | null>(null);

type Pushed = Record<string, { at: number; photo?: string }>;
const pushedKey = (uid: string) => `totetrack.pushed.${uid}`;

type Row = { id: string; data: Tote | null; deleted: boolean; updated_at: number };

// Supabase returns at most 1000 rows per request, so read the cloud copy a page at a time.
const PAGE = 500;
async function pullRows(uid: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id,data,deleted,updated_at')
      .eq('user_id', uid)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function photoBase64(name: string, width = 900): Promise<string | null> {
  const uri = photoUri(name);
  if (!uri || !new File(uri).exists) return null;
  try {
    const ref = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
    const out = await ref.saveAsync({ base64: true, compress: 0.55, format: SaveFormat.JPEG });
    return out.base64 ?? null;
  } catch {
    return null;
  }
}

async function savePhotoFromCloud(name: string, base64: string) {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  const f = new File(dir, name);
  if (!f.exists) f.create();
  await f.write(base64, { encoding: 'base64' });
}

/**
 * Inside photos live in their own table, one row per photo, so a tote's row stays small and each
 * photo only goes up once. Uploads photos the cloud is missing, downloads ones this phone is
 * missing, and removes cloud photos no tote uses any more. Failures here never stop tote syncing
 * (for example before the photos table has been set up).
 */
async function syncInsidePhotos(uid: string, totes: Tote[]) {
  const used = new Set(totes.flatMap((t) => t.insidePhotos ?? []));
  const cloud = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(PHOTO_TABLE)
      .select('name,updated_at')
      .eq('user_id', uid)
      .order('name')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of (data ?? []) as { name: string; updated_at: number }[]) cloud.set(r.name, Number(r.updated_at));
    if (!data || data.length < PAGE) break;
  }
  let downloaded = false;
  for (const name of used) {
    const uri = photoUri(name);
    const here = !!uri && new File(uri).exists;
    if (here && !cloud.has(name)) {
      const b64 = await photoBase64(name, 1200);
      if (!b64) continue;
      const { error: upError } = await supabase
        .from(PHOTO_TABLE)
        .upsert({ user_id: uid, name, data: b64, updated_at: Date.now() }, { onConflict: 'user_id,name' });
      if (upError) throw upError;
    } else if (!here && cloud.has(name)) {
      const { data: p } = await supabase.from(PHOTO_TABLE).select('data').eq('user_id', uid).eq('name', name).single();
      if (p?.data) {
        await savePhotoFromCloud(name, p.data as string);
        downloaded = true;
      }
    }
  }
  if (downloaded) notifyPhotosChanged();
  // Another phone may have uploaded a photo moments before its tote, so leave fresh ones alone.
  const stale = [...cloud].filter(([name, at]) => !used.has(name) && at < Date.now() - 10 * 60 * 1000).map(([name]) => name);
  for (let i = 0; i < stale.length; i += 50) {
    await supabase.from(PHOTO_TABLE).delete().eq('user_id', uid).in('name', stale.slice(i, i + 50));
  }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const store = useTotes();
  const uid = session?.user.id;
  // A household member syncs the owner's cloud copy (see household.tsx).
  const { space } = useHousehold();
  const [status, setStatus] = useState<SyncState['status']>('off');
  const [lastSynced, setLastSynced] = useState<number>();
  const [error, setError] = useState<string>();
  const running = useRef(false);
  const again = useRef(false);
  // Set while the account is being deleted, so a sync can't put the totes straight back.
  const paused = useRef(false);
  const latest = useRef(store);
  const lists = useLists();
  const latestLists = useRef(lists);
  useEffect(() => {
    latest.current = store;
    latestLists.current = lists;
  });

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- re-runs itself via setTimeout
  const run = useCallback(async (): Promise<boolean> => {
    if (!uid || !space || paused.current) return false;
    if (running.current) {
      again.current = true;
      return false;
    }
    let ok = false;
    running.current = true;
    setStatus('syncing');
    try {
      const pushed: Pushed = JSON.parse((await AsyncStorage.getItem(pushedKey(space))) || '{}');

      // 1. Pull everything the cloud has (without photos) and merge the newer side in.
      const remote = new Map<string, Row>((await pullRows(space)).map((r) => [r.id, r]));
      const { totes, tombstones } = latest.current;
      const localAt = (id: string) => totes.find((t) => t.id === id)?.updatedAt ?? tombstones[id] ?? 0;
      const incoming: RemoteTote[] = [];
      for (const r of remote.values()) {
        const at = Number(r.updated_at);
        if (at > localAt(r.id)) incoming.push({ id: r.id, data: r.data, deleted: r.deleted, updatedAt: at });
        pushed[r.id] = { at, photo: r.data?.photo ?? pushed[r.id]?.photo };
      }
      // Photos for incoming totes that this phone doesn't have yet.
      for (const r of incoming) {
        const name = r.data?.photo;
        if (!name) continue;
        const uri = photoUri(name);
        if (uri && new File(uri).exists) continue;
        const { data: p } = await supabase.from(TABLE).select('photo').eq('user_id', space).eq('id', r.id).single();
        if (p?.photo) await savePhotoFromCloud(name, p.photo as string);
      }
      latest.current.mergeRemote(incoming);

      // 2. Push anything on the phone that's newer than the cloud.
      const upserts: Record<string, unknown>[] = [];
      for (const t of totes) {
        const r = remote.get(t.id);
        if (r && Number(r.updated_at) >= t.updatedAt) continue;
        const row: Record<string, unknown> = { user_id: space, id: t.id, data: t, deleted: false, updated_at: t.updatedAt };
        if (t.photo !== pushed[t.id]?.photo || !r) row.photo = t.photo ? await photoBase64(t.photo) : null;
        upserts.push(row);
      }
      for (const [id, at] of Object.entries(tombstones)) {
        const r = remote.get(id);
        if (!r || (Number(r.updated_at) < at && !r.deleted)) {
          upserts.push({ user_id: space, id, data: null, photo: null, deleted: true, updated_at: at });
        }
      }
      // Rows with and without a photo column go separately so a missing photo field never clears one.
      const withPhoto = upserts.filter((u) => 'photo' in u);
      const withoutPhoto = upserts.filter((u) => !('photo' in u));
      for (const batch of [withPhoto, withoutPhoto]) {
        for (let i = 0; i < batch.length; i += 25) {
          const { error: pushError } = await supabase.from(TABLE).upsert(batch.slice(i, i + 25), { onConflict: 'user_id,id' });
          if (pushError) throw pushError;
        }
      }
      for (const u of upserts) {
        const data = u.data as Tote | null;
        pushed[u.id as string] = { at: u.updated_at as number, photo: data?.photo };
      }
      await AsyncStorage.setItem(pushedKey(space), JSON.stringify(pushed));

      // 3. Inside photos, for the totes as they stand after this sync.
      const incomingIds = new Set(incoming.map((r) => r.id));
      const after = [...totes.filter((t) => !incomingIds.has(t.id)), ...incoming.flatMap((r) => (!r.deleted && r.data ? [r.data] : []))];
      await syncInsidePhotos(space, after).catch(() => {});

      // 4. Packing lists: the whole set is one row per account, and the newer side wins.
      try {
        const { data: lr, error: listError } = await supabase.from(LIST_TABLE).select('data,updated_at').eq('user_id', space).maybeSingle();
        if (listError) throw listError;
        const L = latestLists.current;
        const remoteAt = lr ? Number(lr.updated_at) : 0;
        if (lr && remoteAt > L.updatedAt) {
          L.replaceAll((lr.data as PackingList[] | null) ?? [], remoteAt);
        } else if (L.updatedAt > remoteAt) {
          const { error: upError } = await supabase
            .from(LIST_TABLE)
            .upsert({ user_id: space, data: L.lists, updated_at: L.updatedAt }, { onConflict: 'user_id' });
          if (upError) throw upError;
        }
      } catch {
        // The lists table may not be set up yet; totes keep syncing either way.
      }
      setLastSynced(Date.now());
      setError(undefined);
      setStatus('synced');
      ok = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        setTimeout(run, 500);
      }
    }
    return ok;
  }, [uid, space]);

  // Sync on sign-in, when the app comes back to the screen, and shortly after any change.
  useEffect(() => {
    if (!uid || !space || !store.ready || !lists.ready) return;
    run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => sub.remove();
  }, [uid, space, store.ready, lists.ready, run]);

  // After a failed sync (no signal, say), try again in a little while.
  useEffect(() => {
    if (status !== 'error' || !uid) return;
    const t = setTimeout(run, 30000);
    return () => clearTimeout(t);
  }, [status, uid, run]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!uid) return;
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [store.totes, store.tombstones, lists.updatedAt, uid, run]);

  const value = useMemo<SyncState>(
    () => ({
      status: uid ? status : 'off',
      lastSynced,
      error,
      syncNow: run,
      finishSync: async () => {
        for (let i = 0; running.current && i < 200; i++) await new Promise((r) => setTimeout(r, 150));
        again.current = false;
        return run();
      },
      deleteAccount: async () => {
        if (!uid) return 'data';
        paused.current = true;
        try {
          // Let a sync that's already going finish first.
          for (let i = 0; running.current && i < 100; i++) await new Promise((r) => setTimeout(r, 150));
          // tools/setup_supabase.py creates this function. It deletes the backed-up totes and photos,
          // then the sign-in itself unless another app's data still belongs to it.
          const { data, error: rpcError } = await supabase.rpc('totetrack_delete_account');
          if (rpcError) throw rpcError;
          await AsyncStorage.removeItem(pushedKey(uid));
          if (space && space !== uid) await AsyncStorage.removeItem(pushedKey(space));
          return data === 'account' ? 'account' : 'data';
        } finally {
          paused.current = false;
        }
      },
    }),
    [status, lastSynced, error, run, uid, space],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncState {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSync must be used inside SyncProvider');
  return s;
}
