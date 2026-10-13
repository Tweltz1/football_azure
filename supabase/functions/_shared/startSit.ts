// Weekly projections for the Start/Sit page, from Sleeper's public projections feed.
// Player ids match the draft pool ("sleeper-<id>", or "sleeper-<TEAM>" for defenses),
// so the page can line projections up with the rosters people drafted.

export type FetchJson = (url: string) => Promise<unknown>;

export interface ProjectedPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  opponent: string | null;
  injury: string | null;
  points: { ppr: number; half: number; std: number };
}

export interface WeekProjections {
  season: number;
  week: number;
  currentWeek: number;
  seasonType: string;
  fetchedAt: string;
  players: ProjectedPlayer[];
}

const SLEEPER_STATE_URL = 'https://api.sleeper.app/v1/state/nfl';
const SLEEPER_PROJECTIONS_URL = 'https://api.sleeper.com/projections/nfl';
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const CACHE_MS = 30 * 60 * 1000;

interface CacheEntry<T> {
  at: number;
  value: T;
}
const stateCache: { entry: CacheEntry<{ season: number; week: number; seasonType: string }> | null } = { entry: null };
const projectionCache = new Map<string, CacheEntry<WeekProjections>>();

/** For tests: forget cached Sleeper responses. */
export function clearStartSitCache() {
  stateCache.entry = null;
  projectionCache.clear();
}

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const round1 = (value: number) => Math.round(value * 10) / 10;
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

async function currentState(fetchJson: FetchJson, nowMs: number) {
  const cached = stateCache.entry;
  if (cached && nowMs - cached.at < CACHE_MS) return cached.value;
  const raw = (await fetchJson(SLEEPER_STATE_URL)) as Record<string, unknown>;
  const seasonType = text(raw?.season_type) || 'regular';
  // In the off-season and preseason Sleeper reports week 0 or 1; week 1 is the first one worth showing.
  const week = Math.max(1, Math.trunc(num(raw?.display_week ?? raw?.week)));
  const value = { season: Math.trunc(num(raw?.season)) || new Date(nowMs).getUTCFullYear(), week, seasonType };
  stateCache.entry = { at: nowMs, value };
  return value;
}

function toPlayer(row: Record<string, unknown>): ProjectedPlayer | null {
  const info = (row.player ?? {}) as Record<string, unknown>;
  const stats = (row.stats ?? {}) as Record<string, unknown>;
  const rawPosition = text(info.position) || (Array.isArray(info.fantasy_positions) ? text(info.fantasy_positions[0]) : '');
  const position = rawPosition === 'DEF' ? 'DST' : rawPosition;
  if (!position || !POSITIONS.includes(rawPosition)) return null;

  const playerId = text(row.player_id);
  if (!playerId) return null;
  const team = text(row.team) || text(info.team);
  const name = position === 'DST'
    ? `${text(info.first_name)} ${text(info.last_name)}`.trim() || `${team} Defense`
    : `${text(info.first_name)} ${text(info.last_name)}`.trim();
  if (!name) return null;

  const std = num(stats.pts_std);
  const half = stats.pts_half_ppr != null ? num(stats.pts_half_ppr) : std + num(stats.rec) * 0.5;
  const ppr = stats.pts_ppr != null ? num(stats.pts_ppr) : std + num(stats.rec);

  return {
    id: `sleeper-${playerId}`,
    name,
    position,
    team,
    opponent: text(row.opponent) || null,
    injury: text(info.injury_status) || null,
    points: { ppr: round1(ppr), half: round1(half), std: round1(std) },
  };
}

/** Projections for one week (the current week when week is not given). Cached for 30 minutes. */
export async function getWeekProjections(fetchJson: FetchJson, now: Date, requestedWeek?: number | null): Promise<WeekProjections> {
  const nowMs = now.getTime();
  const state = await currentState(fetchJson, nowMs);
  const week = requestedWeek && requestedWeek >= 1 && requestedWeek <= 18 ? Math.trunc(requestedWeek) : state.week;
  const seasonType = state.seasonType === 'post' ? 'post' : 'regular';
  const key = `${state.season}-${seasonType}-${week}`;

  const cached = projectionCache.get(key);
  if (cached && nowMs - cached.at < CACHE_MS) return cached.value;

  const positions = POSITIONS.map((p) => `position[]=${p}`).join('&');
  const url = `${SLEEPER_PROJECTIONS_URL}/${state.season}/${week}?season_type=${seasonType}&${positions}&order_by=pts_ppr`;
  const rows = await fetchJson(url);
  if (!Array.isArray(rows)) throw new Error('Sleeper projections response was not a list.');

  const byId = new Map<string, ProjectedPlayer>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const player = toPlayer(row as Record<string, unknown>);
    if (!player) continue;
    if (player.points.ppr <= 0 && player.points.std <= 0) continue;
    const existing = byId.get(player.id);
    if (!existing || existing.points.ppr < player.points.ppr) byId.set(player.id, player);
  }

  const value: WeekProjections = {
    season: state.season,
    week,
    currentWeek: state.week,
    seasonType,
    fetchedAt: now.toISOString(),
    players: [...byId.values()].sort((a, b) => b.points.ppr - a.points.ppr),
  };
  projectionCache.set(key, { at: nowMs, value });
  return value;
}
