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

// ---- Shared department corrections ----
// When a shopper fixes an item's department ("oat milk" is Dairy, not Center aisles), that is a vote
// for the item everywhere, not just at one store. One vote per phone per item; voting again replaces it.

export type DepartmentVoteRow = { item_key: string; department: string; updated_at: string };

/** Shoppers who must agree before their answer replaces the built-in keyword guess. */
export const MIN_DEPARTMENT_VOTES = 2;

export type SharedDepartment = { department: string; votes: number; total: number };

/**
 * The shoppers' department per item. An answer is used only when at least MIN_DEPARTMENT_VOTES phones
 * gave it and it has more than half of all answers for that item, so one phone, or a split crowd,
 * never changes the guess. Among equal counts (can't be a majority) nothing is returned.
 */
export function tallyDepartments(rows: DepartmentVoteRow[]): Record<string, SharedDepartment> {
  const byItem = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!DEPARTMENTS.includes(r.department)) continue;
    const counts = byItem.get(r.item_key) ?? new Map<string, number>();
    counts.set(r.department, (counts.get(r.department) ?? 0) + 1);
    byItem.set(r.item_key, counts);
  }
  const out: Record<string, SharedDepartment> = {};
  for (const [item, counts] of byItem) {
    const total = [...counts.values()].reduce((n, c) => n + c, 0);
    const [department, votes] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (votes >= MIN_DEPARTMENT_VOTES && votes * 2 > total) out[item] = { department, votes, total };
  }
  return out;
}
