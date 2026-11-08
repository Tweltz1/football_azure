import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { photoUri } from './photos';
import { RemoteTote, useTotes } from './store';
import { supabase, TABLE } from './supabase';
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
  deleteCloudData: () => Promise<void>;
};

const Ctx = createContext<SyncState | null>(null);

type Pushed = Record<string, { at: number; photo?: string }>;
const pushedKey = (uid: string) => `totetrack.pushed.${uid}`;

type Row = { id: string; data: Tote | null; deleted: boolean; updated_at: number };

async function photoBase64(name: string): Promise<string | null> {
  const uri = photoUri(name);
  if (!uri || !new File(uri).exists) return null;
  try {
    const ref = await ImageManipulator.manipulate(uri).resize({ width: 900 }).renderAsync();
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

export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const store = useTotes();
  const uid = session?.user.id;
  const [status, setStatus] = useState<SyncState['status']>('off');
  const [lastSynced, setLastSynced] = useState<number>();
  const [error, setError] = useState<string>();
  const running = useRef(false);
  const again = useRef(false);
  const latest = useRef(store);
  useEffect(() => {
    latest.current = store;
  });

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- re-runs itself via setTimeout
  const run = useCallback(async () => {
    if (!uid) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      const pushed: Pushed = JSON.parse((await AsyncStorage.getItem(pushedKey(uid))) || '{}');

      // 1. Pull everything the cloud has (without photos) and merge the newer side in.
      const { data, error: pullError } = await supabase.from(TABLE).select('id,data,deleted,updated_at').eq('user_id', uid);
      if (pullError) throw pullError;
      const remote = new Map<string, Row>((data as Row[]).map((r) => [r.id, r]));
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
        const { data: p } = await supabase.from(TABLE).select('photo').eq('user_id', uid).eq('id', r.id).single();
        if (p?.photo) await savePhotoFromCloud(name, p.photo as string);
      }
      latest.current.mergeRemote(incoming);

      // 2. Push anything on the phone that's newer than the cloud.
      const upserts: Record<string, unknown>[] = [];
      for (const t of totes) {
        const r = remote.get(t.id);
        if (r && Number(r.updated_at) >= t.updatedAt) continue;
        const row: Record<string, unknown> = { user_id: uid, id: t.id, data: t, deleted: false, updated_at: t.updatedAt };
        if (t.photo !== pushed[t.id]?.photo || !r) row.photo = t.photo ? await photoBase64(t.photo) : null;
        upserts.push(row);
      }
      for (const [id, at] of Object.entries(tombstones)) {
        const r = remote.get(id);
        if (!r || (Number(r.updated_at) < at && !r.deleted)) {
          upserts.push({ user_id: uid, id, data: null, photo: null, deleted: true, updated_at: at });
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
      await AsyncStorage.setItem(pushedKey(uid), JSON.stringify(pushed));
      setLastSynced(Date.now());
      setError(undefined);
      setStatus('synced');
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
  }, [uid]);

  // Sync on sign-in, when the app comes back to the screen, and shortly after any change.
  useEffect(() => {
    if (!uid || !store.ready) return;
    run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => sub.remove();
  }, [uid, store.ready, run]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!uid) return;
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [store.totes, store.tombstones, uid, run]);

  const value = useMemo<SyncState>(
    () => ({
      status: uid ? status : 'off',
      lastSynced,
      error,
      syncNow: run,
      deleteCloudData: async () => {
        if (!uid) return;
        const { error: delError } = await supabase.from(TABLE).delete().eq('user_id', uid);
        if (delError) throw delError;
        await AsyncStorage.removeItem(pushedKey(uid));
      },
    }),
    [status, lastSynced, error, run, uid],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncState {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSync must be used inside SyncProvider');
  return s;
}
