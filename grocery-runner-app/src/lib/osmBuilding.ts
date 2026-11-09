import { analyseFootprint, BuildingInfo, containsPoint, LatLon, polygonAreaM2 } from './footprint';

/**
 * Downloads the store's building outline, mapped entrances and nearby parking from OpenStreetMap
 * (Overpass API), straight from the phone, once per store. OSM data is free to use with credit
 * ("© OpenStreetMap contributors"), unlike Apple's or Google's satellite imagery.
 */
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

const MIN_STORE_M2 = 600; // smaller buildings are kiosks or sheds next to the store

type Element = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: LatLon[];
};

export function pickBuilding(elements: Element[], at: LatLon): { outline: LatLon[]; entrances: LatLon[]; parking: LatLon[] } | null {
  const buildings = elements
    .filter((e) => e.type === 'way' && e.tags?.building && e.geometry && e.geometry.length >= 4)
    .map((e) => ({ outline: e.geometry!, area: polygonAreaM2(e.geometry!) }))
    .filter((b) => b.area >= MIN_STORE_M2);
  if (!buildings.length) return null;
  // The building the pin is in, else the biggest one nearby (pins often sit in the parking lot).
  const chosen = buildings.find((b) => containsPoint(b.outline, at)) ?? buildings.sort((a, b) => b.area - a.area)[0];

  const onOutline = (p: LatLon) =>
    chosen.outline.some((q) => Math.abs(q.lat - p.lat) < 2e-5 && Math.abs(q.lon - p.lon) < 2e-5);
  const doors = elements.filter((e) => e.type === 'node' && e.tags?.entrance && e.lat != null && onOutline(e as LatLon));
  const main = doors.filter((e) => e.tags!.entrance === 'main');
  const entrances = (main.length ? main : doors.filter((e) => e.tags!.entrance !== 'service')).map((e) => ({
    lat: e.lat!,
    lon: e.lon!,
  }));

  const lots = elements
    .filter((e) => e.type === 'way' && e.tags?.amenity === 'parking' && e.geometry && e.geometry.length >= 4)
    .map((e) => ({ outline: e.geometry!, area: polygonAreaM2(e.geometry!) }))
    .sort((a, b) => b.area - a.area);
  const parking = lots.length ? lots[0].outline : [];
  return { outline: chosen.outline, entrances, parking };
}

export async function fetchBuildingInfo(at: LatLon): Promise<BuildingInfo | null> {
  const query = `[out:json][timeout:15];
(
  way["building"](around:120,${at.lat},${at.lon});
  way["amenity"="parking"](around:200,${at.lat},${at.lon});
)->.a;
.a out geom;
node["entrance"](around:200,${at.lat},${at.lon});
out;`;
  let lastError: unknown;
  for (const server of SERVERS) {
    try {
      const res = await fetch(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const { elements } = (await res.json()) as { elements: Element[] };
      const picked = pickBuilding(elements ?? [], at);
      return picked ? analyseFootprint(picked.outline, picked.entrances, picked.parking) : null;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
