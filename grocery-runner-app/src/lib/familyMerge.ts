import type { SharedItem } from './store';

/** One item row of a family list in the cloud (grocery_family_items). */
export type FamilyRow = { id: string; data: SharedItem | null; deleted: boolean; updated_at: number };

export const sharedOf = (i: { id: string; name: string; amount?: string; checked: boolean }): SharedItem => ({
  id: i.id,
  name: i.name,
  ...(i.amount ? { amount: i.amount } : {}),
  checked: !!i.checked,
});
export const sameItem = (a: SharedItem, b: SharedItem) => a.name === b.name && (a.amount ?? '') === (b.amount ?? '') && a.checked === b.checked;

/**
 * One family list sync. `snap` is the list as both sides last agreed, `here` is this phone's list now,
 * `changedAt` says when each local difference was made. The newer side wins per item.
 * Returns what to change on this phone, the rows to send up, and the new agreed list.
 */
export function planSync(snap: Map<string, SharedItem>, here: Map<string, SharedItem>, changedAt: Map<string, number>, rows: FamilyRow[], now: number) {
  const mine = new Map<string, { item: SharedItem | null; at: number }>();
  for (const [id, item] of here) if (!snap.has(id) || !sameItem(snap.get(id)!, item)) mine.set(id, { item, at: changedAt.get(id) ?? now });
  for (const id of snap.keys()) if (!here.has(id)) mine.set(id, { item: null, at: changedAt.get(id) ?? now });

  const changed: SharedItem[] = [];
  const removed: string[] = [];
  const next = new Map(snap);
  for (const r of rows) {
    const local = mine.get(r.id);
    if (local && local.at >= Number(r.updated_at)) continue; // newer here: goes up below
    mine.delete(r.id);
    if (r.deleted || !r.data) {
      if (here.has(r.id)) removed.push(r.id);
      next.delete(r.id);
    } else {
      const item = sharedOf({ ...r.data, id: r.id });
      const cur = here.get(r.id);
      if (!cur || !sameItem(cur, item)) changed.push(item);
      next.set(r.id, item);
    }
  }
  const up = [...mine.entries()].map(([id, m]) => ({ id, data: m.item, deleted: !m.item, updated_at: m.at }));
  for (const [id, m] of mine) {
    if (m.item) next.set(id, m.item);
    else next.delete(id);
  }
  return { changed, removed, up, next };
}
