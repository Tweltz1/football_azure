import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Suggestion } from './snap';

/**
 * Snap remembers what your own things look like, on this phone only (never synced, never sent anywhere).
 *
 * When you add something from Snap, it keeps that thing's "look" (the 512 numbers the item namer worked
 * out for it) under the name you gave it. Later photos are checked against those first, so after you've
 * added your Sharpie once or twice, Snap knows your Sharpie. Photos themselves are never kept.
 */

const KEY = 'totetrack.snapLooks.v1';
/** Most looks remembered; the oldest are forgotten first (about 3 KB each). */
const MAX_LOOKS = 300;
/** How alike a spot and a remembered look must be (cosine similarity) to count as the same thing. */
export const MATCH = 0.86;
/** A new look this close to one already kept under the same name adds nothing. */
const DUPLICATE = 0.97;

/** m: the image model the look came from. Looks saved before this was kept came from the first namer. */
export type Look = { name: string; v: number[]; at: number; m?: string };

/** The namer's first image model, which made every look saved without one. */
const FIRST_MODEL = 'wkcn/TinyCLIP-ViT-39M-16-Text-19M-YFCC15M';

/** The image model of the photo looked at last; new looks are kept under it. */
let currentModel: string | undefined;

/** Looks from a different image model mean nothing to this one, so they are skipped. No model given matches all. */
export function sameModel(look: Look, model?: string): boolean {
  return !model || (look.m ?? FIRST_MODEL) === model;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Your own things spotted in the photo: each spot matched to the closest remembered look, best first. */
export function matchLooks(looks: Look[], spots: number[][], model?: string): Suggestion[] {
  if (model) currentModel = model;
  looks = looks.filter((l) => sameModel(l, model));
  const best = new Map<string, { name: string; score: number; look: number[] }>();
  for (const spot of spots) {
    let hit: Look | undefined;
    let score = MATCH;
    for (const l of looks) {
      const c = cosine(spot, l.v);
      if (c >= score) {
        score = c;
        hit = l;
      }
    }
    if (!hit) continue;
    const key = hit.name.trim().toLowerCase();
    const prev = best.get(key);
    if (!prev || score > prev.score) best.set(key, { name: hit.name, score, look: spot });
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((m) => ({ name: m.name, from: 'object' as const, sure: true, qty: 1, look: m.look }));
}

/** Keeps the look of each thing you added, under the name you added it as. */
export function learnLooks(looks: Look[], added: { name: string; look?: number[] }[], now = Date.now(), model = currentModel): Look[] {
  const next = [...looks];
  for (const a of added) {
    if (!a.look?.length || !a.name.trim()) continue;
    const key = a.name.trim().toLowerCase();
    const same = next.find((l) => l.name.trim().toLowerCase() === key && sameModel(l, model) && cosine(l.v, a.look!) >= DUPLICATE);
    if (same) same.at = now;
    else next.push({ name: a.name.trim(), v: a.look, at: now, ...(model ? { m: model } : {}) });
  }
  return next.sort((a, b) => b.at - a.at).slice(0, MAX_LOOKS);
}

let cache: Look[] | null = null;

export async function loadLooks(): Promise<Look[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Look[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export async function rememberLooks(added: { name: string; look?: number[] }[]) {
  if (!added.some((a) => a.look?.length)) return;
  cache = learnLooks(await loadLooks(), added);
  await AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
}

export async function forgetLooks() {
  cache = [];
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
