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

// Type-ahead help at check-in and on the How-To tab (free, no key):
// - Models for a make (and year) from vPIC.
// - Engines for a year, make and model from fueleconomy.gov (US EPA), whose menu text reads like
//   "Auto 10-spd, 6 cyl, 3.5 L, Turbo". Each one becomes "3.5L 6 Cyl. Turbo", the VIN decoder's style.
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const menu = (j: unknown) => {
  const m = (j as { menuItem?: unknown })?.menuItem;
  return (Array.isArray(m) ? m : m ? [m] : []) as { text?: string; value?: string }[];
};

export function epaEngineText(text: string): string {
  const liters = text.match(/(\d+(?:\.\d+)?)\s*L\b/);
  const cyl = text.match(/(\d+)\s*cyl/i);
  const parts = [liters ? `${Number(liters[1]).toFixed(1)}L` : '', cyl ? `${cyl[1]} Cyl.` : '',
    /turbo/i.test(text) ? 'Turbo' : /s-?charge|supercharg/i.test(text) ? 'Supercharged' : '',
    /hybrid|\bhev\b|phev/i.test(text) ? 'Hybrid' : ''];
  const out = parts.filter(Boolean).join(' ');
  return out || (/electric|\bev\b|kw/i.test(text) ? 'Electric' : '');
}

export async function modelsFor(year: string, make: string, fetchFn: typeof fetch, now: number): Promise<string[]> {
  const y = s(year, 4), mk = s(make, 40);
  if (!mk) return [];
  const path = /^\d{4}$/.test(y) ? `GetModelsForMakeYear/make/${encodeURIComponent(mk)}/modelyear/${y}` : `GetModelsForMake/${encodeURIComponent(mk)}`;
  return cached(`models:${y}|${mk.toLowerCase()}`, now, async () => {
    const res = await fetchFn(`https://vpic.nhtsa.dot.gov/api/vehicles/${path}?format=json`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`vPIC ${res.status}`);
    const list = ((await res.json())?.Results ?? []) as Record<string, unknown>[];
    return [...new Set(list.map((r) => s(r.Model_Name, 40)).filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, 400);
  });
}

export async function enginesFor(year: string, make: string, model: string, fetchFn: typeof fetch, now: number): Promise<string[]> {
  const y = s(year, 4), mk = title(s(make, 40)), md = norm(s(model, 40));
  if (!/^\d{4}$/.test(y) || !mk || !md) return [];
  return cached(`engines:${y}|${mk.toLowerCase()}|${md}`, now, async () => {
    const get = async (path: string) => {
      const res = await fetchFn(`https://www.fueleconomy.gov/ws/rest/vehicle/menu/${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`fueleconomy.gov ${res.status}`);
      const text = await res.text();
      return text.trim() ? menu(JSON.parse(text)) : [];
    };
    // EPA splits models ("F150 Pickup 2WD", "F150 Pickup 4WD"), so take every one that starts with the typed model.
    const models = (await get(`model?${new URLSearchParams({ year: y, make: mk })}`)).map((m) => s(m.text ?? m.value, 80)).filter(Boolean);
    const hits = models.filter((m) => norm(m).startsWith(md));
    const pick = (hits.length ? hits : models.filter((m) => norm(m).includes(md))).slice(0, 6);
    const engines = new Set<string>();
    for (const m of pick) {
      for (const o of await get(`options?${new URLSearchParams({ year: y, make: mk, model: m })}`)) {
        const e = epaEngineText(s(o.text, 120));
        if (e) engines.add(e);
      }
    }
    return [...engines].sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b));
  });
}
