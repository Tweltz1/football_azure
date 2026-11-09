// Shared shopper aisles: pure logic, no Deno APIs, so the app's tests can run it too.

export type VoteRow = {
  item_key: string;
  aisle: string | null;
  department: string | null;
  updated_at: string;
};

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
 * Majority answer per item. An aisle beats a department-only answer with the same votes,
 * and among equal answers the most recently confirmed one wins.
 */
export function tallyVotes(rows: VoteRow[]): Record<string, SharedLocation> {
  const byItem = new Map<string, Map<string, { aisle?: string; department?: string; votes: number; latest: string }>>();
  for (const r of rows) {
    const answer = r.aisle ? `a:${r.aisle}` : r.department ? `d:${r.department}` : null;
    if (!answer) continue;
    const answers = byItem.get(r.item_key) ?? new Map();
    const cur = answers.get(answer) ?? {
      aisle: r.aisle ?? undefined,
      department: r.department ?? undefined,
      votes: 0,
      latest: '',
    };
    cur.votes += 1;
    if (r.updated_at > cur.latest) cur.latest = r.updated_at;
    answers.set(answer, cur);
    byItem.set(r.item_key, answers);
  }
  const out: Record<string, SharedLocation> = {};
  for (const [item, answers] of byItem) {
    const all = [...answers.values()];
    const total = all.reduce((n, a) => n + a.votes, 0);
    all.sort((x, y) => y.votes - x.votes || Number(!!y.aisle) - Number(!!x.aisle) || y.latest.localeCompare(x.latest));
    const best = all[0];
    out[item] = { aisle: best.aisle, department: best.department, votes: best.votes, total };
  }
  return out;
}
