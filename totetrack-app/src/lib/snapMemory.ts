import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Suggestion } from './snap';

/**
 * Snap to add learns from you, on this phone only (never synced, never sent anywhere).
 *
 * For each name Snap suggests, it remembers how often you added it, how often you passed on it,
 * and what you renamed it to. Next time it uses your wording, ticks what you always add, unticks
 * what you usually skip, and tucks away what you keep skipping.
 *
 * This sits on top of whatever the detector suggests, so a new detector or namer doesn't change it.
 */

const KEY = 'totetrack.snapMemory.v1';
/** Most suggestion names we remember; the least recently seen are forgotten first. */
const MAX_ENTRIES = 400;
/** Most added items we remember the original suggestion for, so a later rename in the tote teaches Snap too. */
const MAX_ADDED = 300;

export type SnapMemoryEntry = {
  /** Your name for it, if you renamed it. */
  to?: string;
  /** Times you added it. */
  yes: number;
  /** Times it was shown and you added other things but not this. */
  no: number;
  /** Last time it was shown (ms). */
  at: number;
};

export type SnapMemory = {
  /** Keyed by the suggestion's own name, lowercased. */
  names: Record<string, SnapMemoryEntry>;
  /** Item name you added (lowercased) → the suggestion it came from (lowercased). */
  added: Record<string, { from: string; at: number }>;
};

/** A suggestion after your history is applied. `key` is the name Snap itself came up with. */
export type LearnedSuggestion = Suggestion & {
  key: string;
  /** Snap used your name for it. */
  renamed: boolean;
  /** You usually skip this one, so it's hidden unless you ask to see it. */
  skipped: boolean;
};

const empty = (): SnapMemory => ({ names: {}, added: {} });
const norm = (s: string) => s.trim().toLowerCase();

/** Hidden when you've passed on it this many more times than you've added it. */
const HIDE_AFTER = 3;

export function applyMemory(mem: SnapMemory, suggestions: Suggestion[]): LearnedSuggestion[] {
  const out: LearnedSuggestion[] = [];
  const byName = new Map<string, LearnedSuggestion>();
  for (const s of suggestions) {
    const key = norm(s.name);
    const e = mem.names[key];
    let next: LearnedSuggestion = { ...s, key, renamed: false, skipped: false };
    if (e) {
      if (e.to && norm(e.to) !== key) next = { ...next, name: e.to, renamed: true };
      if (e.no - e.yes >= HIDE_AFTER) next = { ...next, sure: false, skipped: true };
      else if (e.no > e.yes) next = { ...next, sure: false };
      else if (e.yes >= 2 && e.yes > e.no) next = { ...next, sure: true };
    }
    // Two of Snap's names you renamed to the same thing become one suggestion.
    const prev = byName.get(norm(next.name));
    if (prev) {
      prev.qty += next.qty;
      prev.sure = prev.sure || next.sure;
      prev.skipped = prev.skipped && next.skipped;
      continue;
    }
    byName.set(norm(next.name), next);
    out.push(next);
  }
  return out;
}

/** What you did with one suggestion on the Snap screen. */
export type SnapChoice = { key: string; name: string; added: boolean };

/**
 * Learns from one Snap: what you added, what you passed on, and what you renamed.
 * Passing on something only counts when you added at least one thing, so backing out
 * of a bad photo doesn't teach Snap anything.
 */
export function learn(mem: SnapMemory, choices: SnapChoice[], now = Date.now()): SnapMemory {
  if (!choices.some((c) => c.added)) return mem;
  const names = { ...mem.names };
  const added = { ...mem.added };
  for (const c of choices) {
    const prev = names[c.key] ?? { yes: 0, no: 0, at: now };
    const e: SnapMemoryEntry = { ...prev, at: now };
    if (c.added) {
      e.yes += 1;
      added[norm(c.name)] = { from: c.key, at: now };
    } else e.no += 1;
    if (norm(c.name) !== c.key) e.to = c.name.trim();
    else if (c.added && e.to) delete e.to; // You added it under Snap's own name this time.
    names[c.key] = e;
  }
  return trim({ names, added });
}

/** You renamed an item in a tote. If Snap suggested it, use your name next time. */
export function learnRename(mem: SnapMemory, oldName: string, newName: string, now = Date.now()): SnapMemory {
  const hit = mem.added[norm(oldName)];
  if (!hit || norm(oldName) === norm(newName)) return mem;
  const names = { ...mem.names };
  const e = names[hit.from] ?? { yes: 1, no: 0, at: now };
  names[hit.from] = norm(newName) === hit.from ? { ...e, to: undefined, at: now } : { ...e, to: newName.trim(), at: now };
  const added = { ...mem.added };
  delete added[norm(oldName)];
  added[norm(newName)] = { from: hit.from, at: now };
  return trim({ names, added });
}

/** How many things Snap has learned (renames, plus names it now ticks or skips for you). */
export function learnedCount(mem: SnapMemory): number {
  return Object.values(mem.names).filter((e) => e.to || e.no > e.yes || (e.yes >= 2 && e.yes > e.no)).length;
}

function trim(mem: SnapMemory): SnapMemory {
  const cap = <T extends { at: number }>(rec: Record<string, T>, max: number) => {
    const entries = Object.entries(rec);
    if (entries.length <= max) return rec;
    return Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, max));
  };
  return { names: cap(mem.names, MAX_ENTRIES), added: cap(mem.added, MAX_ADDED) };
}

// Saved on the phone. Kept in memory once loaded so the Snap and tote screens share one copy.
let cache: SnapMemory | null = null;

export async function loadSnapMemory(): Promise<SnapMemory> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SnapMemory>) : null;
    cache = { names: parsed?.names ?? {}, added: parsed?.added ?? {} };
  } catch {
    cache = empty();
  }
  return cache;
}

async function save(mem: SnapMemory) {
  cache = mem;
  await AsyncStorage.setItem(KEY, JSON.stringify(mem)).catch(() => {});
}

export async function rememberSnap(choices: SnapChoice[]) {
  await save(learn(await loadSnapMemory(), choices));
}

export async function rememberRename(oldName: string, newName: string) {
  const mem = await loadSnapMemory();
  const next = learnRename(mem, oldName, newName);
  if (next !== mem) await save(next);
}

export async function forgetSnapMemory() {
  await save(empty());
}
