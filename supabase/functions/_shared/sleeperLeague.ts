// A Sleeper league's season so far and its schedule, for the chat bar's team questions (power rankings,
// playoff, title and last-place odds). Sleeper's read API is public, so only the league id is needed.

import { currentState, type FetchJson } from './startSit.ts';

const SLEEPER_API = 'https://api.sleeper.app/v1';
const CACHE_MS = 10 * 60 * 1000;
const DEFAULT_PLAYOFF_START = 15;
const DEFAULT_PLAYOFF_TEAMS = 6;

export interface LeagueTeam {
  rosterId: number;
  name: string;
  /** Our player ids on the roster. */
  players: string[];
}

/** One game: roster ids and their points (points are 0 for games not played yet). b is null for a week off. */
export interface LeagueGame {
  a: number;
  b: number | null;
  aPoints: number;
  bPoints: number;
}

export interface LeagueSeason {
  leagueId: string;
  leagueName: string;
  season: number;
  fetchedAt: string;
  /** Regular season weeks are 1 to playoffWeekStart - 1. */
  playoffWeekStart: number;
  playoffTeams: number;
  /** Teams also play the league median each week (an extra win or loss). */
  medianGame: boolean;
  /** Weeks up to this one are final. */
  lastScoredWeek: number;
  teams: LeagueTeam[];
  weeks: { week: number; games: LeagueGame[] }[];
}

export class SleeperLeagueNotFound extends Error {}

const cache = new Map<string, { at: number; value: LeagueSeason }>();

export function clearLeagueSeasonCache() {
  cache.clear();
}

export const isValidLeagueId = (id: string) => /^[A-Za-z0-9]{1,32}$/.test(id);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '');
const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export async function getLeagueSeason(fetchJson: FetchJson, now: Date, leagueId: string): Promise<LeagueSeason> {
  const nowMs = now.getTime();
  const cached = cache.get(leagueId);
  if (cached && nowMs - cached.at < CACHE_MS) return cached.value;

  const league = (await fetchJson(`${SLEEPER_API}/league/${leagueId}`)) as Record<string, unknown> | null;
  if (!league || !text(league.league_id)) throw new SleeperLeagueNotFound(leagueId);
  const settings = (league.settings ?? {}) as Record<string, unknown>;
  const playoffWeekStart = Math.max(2, Math.min(19, Math.trunc(num(settings.playoff_week_start)) || DEFAULT_PLAYOFF_START));
  const playoffTeams = Math.max(2, Math.min(16, Math.trunc(num(settings.playoff_teams)) || DEFAULT_PLAYOFF_TEAMS));
  const regularWeeks = playoffWeekStart - 1;

  const [rosters, users, state] = await Promise.all([
    fetchJson(`${SLEEPER_API}/league/${leagueId}/rosters`),
    fetchJson(`${SLEEPER_API}/league/${leagueId}/users`).catch(() => []),
    currentState(fetchJson, nowMs),
  ]);
  const ownerNames = new Map<string, string>();
  for (const u of Array.isArray(users) ? users : []) {
    const member = (u ?? {}) as Record<string, unknown>;
    const meta = (member.metadata ?? {}) as Record<string, unknown>;
    ownerNames.set(text(member.user_id), text(meta.team_name) || text(member.display_name));
  }
  const teams: LeagueTeam[] = (Array.isArray(rosters) ? rosters : [])
    .filter((r) => r && typeof r === 'object')
    .map((r, index) => {
      const roster = r as Record<string, unknown>;
      const meta = (roster.metadata ?? {}) as Record<string, unknown>;
      const rosterId = Math.trunc(num(roster.roster_id)) || index + 1;
      return {
        rosterId,
        name: text(meta.team_name) || ownerNames.get(text(roster.owner_id)) || `Team ${rosterId}`,
        players: (Array.isArray(roster.players) ? roster.players : []).map(text).filter(Boolean).map((id) => `sleeper-${id}`),
      };
    });

  // Sleeper keeps the whole regular season's pairings, so future weeks are known too (with 0 points).
  const weekNumbers = Array.from({ length: regularWeeks }, (_, i) => i + 1);
  const weekly = await Promise.all(weekNumbers.map((week) => fetchJson(`${SLEEPER_API}/league/${leagueId}/matchups/${week}`).catch(() => [])));
  const weeks = weekNumbers.map((week, i) => {
    const byMatchup = new Map<number, { rosterId: number; points: number }[]>();
    const games: LeagueGame[] = [];
    for (const m of Array.isArray(weekly[i]) ? weekly[i] as unknown[] : []) {
      const row = (m ?? {}) as Record<string, unknown>;
      const rosterId = Math.trunc(num(row.roster_id));
      if (!rosterId) continue;
      const points = Math.round(num(row.custom_points ?? row.points) * 100) / 100;
      const matchupId = Math.trunc(num(row.matchup_id));
      if (!matchupId) {
        games.push({ a: rosterId, b: null, aPoints: points, bPoints: 0 });
        continue;
      }
      if (!byMatchup.has(matchupId)) byMatchup.set(matchupId, []);
      byMatchup.get(matchupId)!.push({ rosterId, points });
    }
    for (const [, sides] of [...byMatchup.entries()].sort((x, y) => x[0] - y[0])) {
      const [a, b] = sides;
      games.push({ a: a.rosterId, b: b ? b.rosterId : null, aPoints: a.points, bPoints: b ? b.points : 0 });
    }
    return { week, games };
  });

  // Sleeper says which week it last scored; otherwise every week before the current one is done.
  const lastScoredLeg = Math.trunc(num(settings.last_scored_leg));
  const beforeThisWeek = state.seasonType === 'regular' ? state.week - 1 : state.seasonType === 'post' ? regularWeeks : 0;
  const lastScoredWeek = Math.max(0, Math.min(regularWeeks, lastScoredLeg > 0 ? lastScoredLeg : beforeThisWeek));

  const value: LeagueSeason = {
    leagueId,
    leagueName: text(league.name) || 'Sleeper league',
    season: Math.trunc(num(league.season)) || state.season,
    fetchedAt: now.toISOString(),
    playoffWeekStart,
    playoffTeams: Math.min(playoffTeams, teams.length),
    medianGame: num(settings.league_average_match) === 1,
    lastScoredWeek,
    teams,
    weeks,
  };
  cache.set(leagueId, { at: nowMs, value });
  return value;
}
