// Shared shopper aisles: pure logic, no Deno APIs, so the app's tests can run it too.

export type VoteRow = {
  item_key: string;
  aisle: string | null;
  department: string | null;
  updated_at: string;
  /** "typed" (typed in or read from a screenshot) or "learned" (from check-off order). */
  kind?: string | null;
};

/** A learned vote is worth half a typed one, and learned votes alone need two shoppers to agree. */
export const LEARNED_WEIGHT = 0.5;

export type SharedLocation = {
  aisle?: string;
  department?: string;
  /** Shoppers who agree with this answer. */
  votes: number;
  /** All shoppers who answered for this item at this store. */
  total: number;
};

export const DEPARTMENTS = ['produce', 'bakery', 'deli', 'meat', 'pantry', 'frozen', 'dairy', 'other'];

/** Lower-case, single spaces, no punctuation: "Peanut Butter!" and "peanut  butter" match. */
export function itemKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** "14", "A14", "14B", "Front", "Endcap 3". Short and printable, so nothing odd gets stored. */
export function cleanAisle(aisle: unknown): string | null {
  if (typeof aisle !== 'string') return null;
  const a = aisle.trim().toUpperCase().replace(/^AISLE\s*/, '');
  return /^[A-Z0-9][A-Z0-9 -]{0,11}$/.test(a) ? a : null;
}

/** Store keys look like "walmart:1234", "target:50309", "kroger:01400943". */
export function cleanStoreKey(key: unknown): string | null {
  return typeof key === 'string' && /^[a-z]+:[a-z0-9-]{3,40}$/.test(key) ? key : null;
}

/**
 * Best answer per item by weighted votes (typed = 1, learned = 0.5). An aisle beats a department-only
 * answer with the same weight, and among equal answers the most recently confirmed one wins. An answer
 * backed only by learned votes is used once it reaches a full vote (two shoppers).
 */
export function tallyVotes(rows: VoteRow[]): Record<string, SharedLocation> {
  type Answer = { aisle?: string; department?: string; votes: number; weight: number; typed: number; latest: string };
  const byItem = new Map<string, Map<string, Answer>>();
  for (const r of rows) {
    const answer = r.aisle ? `a:${r.aisle}` : r.department ? `d:${r.department}` : null;
    if (!answer) continue;
    const answers = byItem.get(r.item_key) ?? new Map();
    const cur: Answer = answers.get(answer) ?? {
      aisle: r.aisle ?? undefined,
      department: r.department ?? undefined,
      votes: 0,
      weight: 0,
      typed: 0,
      latest: '',
    };
    const learned = r.kind === 'learned';
    cur.votes += 1;
    cur.weight += learned ? LEARNED_WEIGHT : 1;
    if (!learned) cur.typed += 1;
    if (r.updated_at > cur.latest) cur.latest = r.updated_at;
    answers.set(answer, cur);
    byItem.set(r.item_key, answers);
  }
  const out: Record<string, SharedLocation> = {};
  for (const [item, answers] of byItem) {
    const all = [...answers.values()].filter((a) => a.typed > 0 || a.weight >= 1);
    if (!all.length) continue;
    const total = [...answers.values()].reduce((n, a) => n + a.votes, 0);
    all.sort(
      (x, y) =>
        y.weight - x.weight ||
        y.typed - x.typed || // on a tie, typed answers win over learned ones
        Number(!!y.aisle) - Number(!!x.aisle) ||
        y.latest.localeCompare(x.latest),
    );
    const best = all[0];
    out[item] = { aisle: best.aisle, department: best.department, votes: best.votes, total };
  }
  return out;
}
