import { matchDepartment } from './departments';
import { parseAisleNumber } from './routing/layout';
import { Department } from './types';

/**
 * What shoppers' aisle answers say about one store's layout: which numbered aisle each department
 * really is in (frozen in aisle 30 at a Woodman's, produce in aisle 1 at an Aldi).
 */
export type StoreProfile = {
  departmentAisle: Partial<Record<Department, number>>;
  /** How many item answers the profile was built from. */
  samples: number;
};

export const EMPTY_PROFILE: StoreProfile = { departmentAisle: {}, samples: 0 };

/** Departments worth placing. "Center aisles" and "other" are spread over many aisles by nature. */
const PLACED: Department[] = ['produce', 'bakery', 'deli', 'meat', 'frozen', 'dairy'];
const MIN_ITEMS = 2;
const MIN_SHARE = 0.6;

/**
 * Builds a profile from item + aisle answers. A department is placed only when at least two
 * different items of it sit within one aisle of each other, and they are most of that
 * department's answers, so one odd answer (ice cream in the candy aisle) can't move it.
 */
export function buildProfile(answers: { name: string; aisle: string }[]): StoreProfile {
  const seen = new Set<string>();
  const byDept = new Map<Department, number[]>();
  for (const a of answers) {
    const key = a.name.toLowerCase().trim();
    const n = parseAisleNumber(a.aisle);
    if (!key || seen.has(key) || n === null) continue;
    seen.add(key);
    const dept = matchDepartment(a.name);
    if (!dept || !PLACED.includes(dept)) continue;
    byDept.set(dept, [...(byDept.get(dept) ?? []), n]);
  }

  const departmentAisle: StoreProfile['departmentAisle'] = {};
  for (const [dept, aisles] of byDept) {
    let best: number[] = [];
    for (const a of aisles) {
      const near = aisles.filter((b) => Math.abs(b - a) <= 1);
      if (near.length > best.length) best = near;
    }
    if (best.length < MIN_ITEMS || best.length < aisles.length * MIN_SHARE) continue;
    const sorted = [...best].sort((x, y) => x - y);
    departmentAisle[dept] = sorted[Math.floor((sorted.length - 1) / 2)];
  }
  return { departmentAisle, samples: seen.size };
}

/** The cold department (frozen, dairy) a numbered aisle belongs to at this store, if known. */
export function coldDepartmentOfAisle(profile: StoreProfile | undefined, aisle: number): Department | undefined {
  if (!profile) return undefined;
  for (const d of ['frozen', 'dairy'] as Department[]) {
    const at = profile.departmentAisle[d];
    if (at !== undefined && Math.abs(at - aisle) <= 1) return d;
  }
  return undefined;
}
