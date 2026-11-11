// Trade market values from FantasyCalc (fantasycalc.com), which builds them from real trades made in
// fantasy leagues. Values depend on league setup, so they are fetched per combination of dynasty or
// redraft, team count, one QB or superflex, and points per reception.

import type { FetchJson } from './startSit.ts';

const FANTASYCALC_URL = 'https://api.fantasycalc.com/values/current';
// Market values move slowly; a few hours keeps the calls (and the free API's load) low.
const MARKET_CACHE_MS = 6 * 60 * 60 * 1000;

export interface MarketSettings {
  dynasty: boolean;
  teams: number;
  qbs: 1 | 2;
  ppr: 0 | 0.5 | 1;
}

export interface MarketValue {
  /** FantasyCalc's trade value (bigger is better; the top player is around 10,000). */
  value: number;
  overallRank: number | null;
  positionRank: number | null;
  /** How much the value moved over the last 30 days. */
  trend30Day: number | null;
}

export interface MarketValues {
  settings: MarketSettings;
  fetchedAt: string;
  source: 'FantasyCalc';
  /** By our player id ("sleeper-<id>"). */
  players: Record<string, MarketValue>;
  /** Rookie picks by "<season>-<round>", e.g. "2027-1" (dynasty only, when the market lists them). */
  picks: Record<string, number>;
}

const cache = new Map<string, { at: number; value: MarketValues }>();

/** For tests: forget cached market values. */
export function clearMarketCache() {
  cache.clear();
}

const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
};

/** League settings from query parameters, clamped to what FantasyCalc offers. */
export function marketSettingsFrom(query: URLSearchParams): MarketSettings {
  const teams = Math.trunc(num(query.get('teams')) ?? 12);
  const ppr = num(query.get('ppr')) ?? 1;
  return {
    dynasty: query.get('dynasty') === '1' || query.get('dynasty') === 'true',
    teams: Math.min(16, Math.max(8, teams)),
    qbs: num(query.get('qbs')) === 2 ? 2 : 1,
    ppr: ppr >= 0.75 ? 1 : ppr >= 0.25 ? 0.5 : 0,
  };
}

const ROUND_WORDS: Record<string, number> = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };

/** "2027 1st" or "2027 Round 1" -> "2027-1". Specific picks like "2027 Pick 1.04" count toward their round. */
function pickKey(name: string): string | null {
  const round = /^(\d{4})\s+(?:(1st|2nd|3rd|4th|5th)|round\s*(\d)|pick\s*(\d)\.\d+)/i.exec(name.trim());
  if (!round) return null;
  const number = round[2] ? ROUND_WORDS[round[2].toLowerCase()] : Number(round[3] || round[4]);
  return number ? `${round[1]}-${number}` : null;
}

export async function getMarketValues(fetchJson: FetchJson, now: Date, settings: MarketSettings): Promise<MarketValues> {
  const nowMs = now.getTime();
  const key = `${settings.dynasty}-${settings.teams}-${settings.qbs}-${settings.ppr}`;
  const cached = cache.get(key);
  if (cached && nowMs - cached.at < MARKET_CACHE_MS) return cached.value;

  const url = `${FANTASYCALC_URL}?isDynasty=${settings.dynasty}&numQbs=${settings.qbs}&numTeams=${settings.teams}&ppr=${settings.ppr}`;
  const rows = await fetchJson(url);
  if (!Array.isArray(rows)) throw new Error('FantasyCalc values response was not a list.');

  const players: Record<string, MarketValue> = {};
  const pickTotals = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const info = (record.player ?? {}) as Record<string, unknown>;
    const value = num(record.value);
    if (value == null) continue;
    const position = String(info.position ?? '').toUpperCase();
    if (position === 'PICK') {
      const pick = pickKey(String(info.name ?? ''));
      if (!pick) continue;
      const total = pickTotals.get(pick) ?? { sum: 0, count: 0 };
      total.sum += value;
      total.count += 1;
      pickTotals.set(pick, total);
      continue;
    }
    const sleeperId = String(info.sleeperId ?? '').trim();
    if (!sleeperId) continue;
    players[`sleeper-${sleeperId}`] = {
      value: Math.round(value),
      overallRank: num(record.overallRank),
      positionRank: num(record.positionRank),
      trend30Day: num(record.trend30Day),
    };
  }
  const picks: Record<string, number> = {};
  for (const [pick, total] of pickTotals) picks[pick] = Math.round(total.sum / total.count);
  if (Object.keys(players).length === 0) throw new Error('FantasyCalc returned no players.');

  const value: MarketValues = { settings, fetchedAt: now.toISOString(), source: 'FantasyCalc', players, picks };
  cache.set(key, { at: nowMs, value });
  return value;
}
