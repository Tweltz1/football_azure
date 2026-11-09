// Free US government vehicle data from NHTSA (no key, public domain):
// - vPIC decodes a VIN into year, make, model, trim and engine: vpic.nhtsa.dot.gov/api
// - Recalls by year, make and model: api.nhtsa.gov/recalls/recallsByVehicle
// Results are cached in memory for a day, since the data rarely changes and NHTSA asks callers to be gentle.

export interface DecodedVin { vin: string; year: string; make: string; model: string; trim: string; engine: string; body: string }
export interface Recall { campaign: string; component: string; summary: string; consequence: string; remedy: string; date: string; parkIt: boolean }

const DAY = 86_400_000;
const cache = new Map<string, { at: number; value: unknown }>();
export const clearNhtsaCache = () => cache.clear();

async function cached<T>(key: string, now: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.at < DAY) return hit.value as T;
  const value = await load();
  if (cache.size > 2000) cache.clear();
  cache.set(key, { at: now, value });
  return value;
}

export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const s = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** "HONDA" -> "Honda", but keeps short brand acronyms like BMW and GMC. */
const title = (v: string) => ['BMW', 'GMC', 'MINI'].includes(v.toUpperCase()) ? v.toUpperCase() : v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** "2.0L 4 Cyl." style engine text from vPIC's fields. */
function engineText(r: Record<string, unknown>) {
  const liters = Number(s(r.DisplacementL));
  const cyl = s(r.EngineCylinders);
  const parts = [Number.isFinite(liters) && liters > 0 ? `${Math.round(liters * 10) / 10}L` : '', cyl ? `${cyl} Cyl.` : '',
    /turbo/i.test(s(r.Turbo)) || /yes/i.test(s(r.Turbo)) ? 'Turbo' : '',
    /electric/i.test(s(r.FuelTypePrimary)) && !liters ? 'Electric' : /hybrid/i.test(s(r.ElectrificationLevel)) ? 'Hybrid' : ''];
  return parts.filter(Boolean).join(' ');
}

export async function decodeVin(vin: string, fetchFn: typeof fetch, now: number): Promise<DecodedVin | null> {
  const v = vin.trim().toUpperCase();
  if (!VIN_RE.test(v)) return null;
  return cached(`vin:${v}`, now, async () => {
    const res = await fetchFn(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${v}?format=json`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`vPIC ${res.status}`);
    const r = ((await res.json())?.Results?.[0] ?? {}) as Record<string, unknown>;
    const make = s(r.Make), model = s(r.Model), year = s(r.ModelYear, 4);
    if (!make || !model) return null;
    return { vin: v, year, make: title(make), model, trim: s(r.Trim, 60), engine: engineText(r), body: s(r.BodyClass, 60) };
  });
}

export async function recallsFor(year: string, make: string, model: string, fetchFn: typeof fetch, now: number): Promise<Recall[]> {
  const y = s(year, 4), mk = s(make, 40), md = s(model, 40);
  if (!/^\d{4}$/.test(y) || !mk || !md) return [];
  return cached(`recalls:${y}|${mk.toLowerCase()}|${md.toLowerCase()}`, now, async () => {
    const q = new URLSearchParams({ make: mk, model: md, modelYear: y });
    const res = await fetchFn(`https://api.nhtsa.gov/recalls/recallsByVehicle?${q}`, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 400 || res.status === 404) return [];
    if (!res.ok) throw new Error(`NHTSA recalls ${res.status}`);
    const list = ((await res.json())?.results ?? []) as Record<string, unknown>[];
    return list.slice(0, 30).map((r) => ({
      campaign: s(r.NHTSACampaignNumber, 20), component: s(r.Component, 200), summary: s(r.Summary, 1200),
      consequence: s(r.Consequence, 800), remedy: s(r.Remedy, 800), date: s(r.ReportReceivedDate, 30),
      parkIt: r.parkIt === true || r.parkOutSide === true,
    })).filter((r) => r.campaign);
  });
}
