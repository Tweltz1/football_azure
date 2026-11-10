// Shared department corrections, stored in grocery_department_votes (see tools/setup_supabase.py).
// Row level security is on with no policies, so only this function (service role) can touch the table.
// Unlike aisles these are not per store: "oat milk" is in Dairy at every store.
import { DEPARTMENTS, DepartmentVoteRow, itemKey, tallyDepartments } from './votes.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TABLE = `${URL_}/rest/v1/grocery_department_votes`;
const auth = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const quote = (s: string) => `"${s.replace(/["\\]/g, '')}"`;

/** The shoppers' department for each item name that enough shoppers agree on. */
export async function sharedDepartments(items: unknown) {
  if (!Array.isArray(items)) throw new Error('items are required.');
  const keys = [...new Set(items.filter((i) => typeof i === 'string').map(itemKey).filter(Boolean))].slice(0, 100);
  if (!keys.length) return {};
  const q = new URLSearchParams({
    select: 'item_key,department,updated_at',
    item_key: `in.(${keys.map(quote).join(',')})`,
  });
  const res = await fetch(`${TABLE}?${q}`, { headers: auth });
  if (!res.ok) throw new Error(`Shared departments lookup failed (${res.status}).`);
  return tallyDepartments((await res.json()) as DepartmentVoteRow[]);
}

/** One shopper's department for an item. Replaces that phone's earlier answer for the same item. */
export async function voteDepartment(body: Record<string, unknown>) {
  const item = typeof body.item === 'string' ? itemKey(body.item) : '';
  const device = typeof body.device === 'string' && /^[a-z0-9]{8,40}$/.test(body.device) ? body.device : null;
  const department =
    typeof body.department === 'string' && DEPARTMENTS.includes(body.department) ? body.department : null;
  if (!item || !device || !department) throw new Error('Invalid department report.');
  const res = await fetch(`${TABLE}?on_conflict=item_key,device_id`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ item_key: item, device_id: device, department, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Saving the department failed (${res.status}).`);
  return { ok: true };
}
