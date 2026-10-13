// Import a Sleeper fantasy team for the Start/Sit page: look up the user's Sleeper leagues for this
// season, their roster in each, the league's starting slots and its reception scoring.
// Sleeper's read API is public, so only a username is needed.

import type { Player } from './models.ts';
import { currentState, type FetchJson } from './startSit.ts';

const SLEEPER_API = 'https://api.sleeper.app/v1';
const CACHE_MS = 10 * 60 * 1000;
const MAX_LEAGUES = 12;

export interface LineupSlot {
  label: string;
  positions: string[];
}

export interface SleeperTeam {
  leagueId: string;
  leagueName: string;
  teamName: string;
  scoring: 'ppr' | 'half' | 'std';
  slots: LineupSlot[];
  players: Pick<Player, 'id' | 'name' | 'position' | 'team' | 'bye'>[];
  /** Who is in the Sleeper lineup right now, as our player ids. */
  starters: string[];
  /** The other teams in the league, for the trade tool. */
  opponents: { teamName: string; players: SleeperTeam['players'] }[];
}

export interface SleeperImport {
  username: string;
  displayName: string;
  season: number;
  teams: SleeperTeam[];
}

export class SleeperUserNotFound extends Error {}

// Sleeper roster_positions -> the positions that can fill it. Bench, IR, taxi and IDP slots are left out.
const SLOT_POSITIONS: Record<string, string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DST'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
};
const SLOT_LABELS: Record<string, string> = {
  DEF: 'DST', WRRB_FLEX: 'W/R', REC_FLEX: 'W/T', SUPER_FLEX: 'SUPERFLEX',
};

const cache = new Map<string, { at: number; value: SleeperImport }>();

export function clearSleeperCache() {
  cache.clear();
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '');

const scoringFor = (settings: unknown): SleeperTeam['scoring'] => {
  const rec = Number((settings as Record<string, unknown> | null)?.rec ?? 1);
  if (rec >= 0.75) return 'ppr';
  if (rec >= 0.25) return 'half';
  return 'std';
};

export const isValidSleeperUsername = (value: string) => /^[A-Za-z0-9_.-]{2,40}$/.test(value);

export async function getSleeperTeams(
  fetchJson: FetchJson, now: Date, username: string, pool: Player[],
): Promise<SleeperImport> {
  const key = username.toLowerCase();
  const nowMs = now.getTime();
  const cached = cache.get(key);
  if (cached && nowMs - cached.at < CACHE_MS) return cached.value;

  const user = (await fetchJson(`${SLEEPER_API}/user/${encodeURIComponent(username)}`)) as Record<string, unknown> | null;
  const userId = text(user?.user_id);
  if (!userId) throw new SleeperUserNotFound(username);

  const { season } = await currentState(fetchJson, nowMs);
  const leagues = await fetchJson(`${SLEEPER_API}/user/${userId}/leagues/nfl/${season}`);
  const poolById = new Map(pool.map((p) => [p.id, p]));

  const teams: SleeperTeam[] = [];
  for (const league of (Array.isArray(leagues) ? leagues : []).slice(0, MAX_LEAGUES)) {
    if (!league || typeof league !== 'object') continue;
    const l = league as Record<string, unknown>;
    const leagueId = text(l.league_id);
    if (!leagueId) continue;

    let rosters: unknown;
    try {
      rosters = await fetchJson(`${SLEEPER_API}/league/${leagueId}/rosters`);
    } catch {
      continue;
    }
    const rosterList = (Array.isArray(rosters) ? rosters : []).filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
    const mine = rosterList.find((roster) => text(roster.owner_id) === userId
      || (Array.isArray(roster.co_owners) && (roster.co_owners as unknown[]).map(text).includes(userId)));
    if (!mine) continue;

    // League members' names, for labelling the other teams. Not essential, so a failure is ignored.
    const ownerNames = new Map<string, string>();
    try {
      const users = await fetchJson(`${SLEEPER_API}/league/${leagueId}/users`);
      for (const u of Array.isArray(users) ? users : []) {
        const member = u as Record<string, unknown>;
        const memberMeta = (member?.metadata ?? {}) as Record<string, unknown>;
        ownerNames.set(text(member?.user_id), text(memberMeta.team_name) || text(member?.display_name));
      }
    } catch {
      // keep going with generic names
    }

    const toPlayers = (roster: Record<string, unknown>) => (Array.isArray(roster.players) ? roster.players : [])
      .map(text).filter(Boolean).map((sleeperId) => {
        const id = `sleeper-${sleeperId}`;
        const known = poolById.get(id);
        const isDefense = /^[A-Z]{2,3}$/.test(sleeperId);
        return known
          ? { id, name: known.name, position: known.position, team: known.team, bye: known.bye }
          : { id, name: isDefense ? `${sleeperId} Defense` : `Player ${sleeperId}`, position: isDefense ? 'DST' : '', team: isDefense ? sleeperId : '', bye: 0 };
      });
    const players = toPlayers(mine);
    const opponents = rosterList
      .filter((roster) => roster !== mine)
      .map((roster, index) => {
        const rosterMeta = (roster.metadata ?? {}) as Record<string, unknown>;
        return {
          teamName: text(rosterMeta.team_name) || ownerNames.get(text(roster.owner_id)) || `Team ${text(roster.roster_id) || index + 1}`,
          players: toPlayers(roster),
        };
      })
      .filter((team) => team.players.length > 0);

    const slots = (Array.isArray(l.roster_positions) ? l.roster_positions : [])
      .map(text)
      .filter((slot) => SLOT_POSITIONS[slot])
      .map((slot) => ({ label: SLOT_LABELS[slot] ?? slot, positions: SLOT_POSITIONS[slot] }));

    const metadata = (mine.metadata ?? {}) as Record<string, unknown>;
    teams.push({
      leagueId,
      leagueName: text(l.name) || 'Sleeper league',
      teamName: text(metadata.team_name) || text(user?.display_name) || username,
      scoring: scoringFor(l.scoring_settings),
      slots,
      players,
      opponents,
      starters: (Array.isArray(mine.starters) ? mine.starters : []).map(text).filter((id) => id && id !== '0').map((id) => `sleeper-${id}`),
    });
  }

  const value = { username, displayName: text(user?.display_name) || username, season, teams };
  cache.set(key, { at: nowMs, value });
  return value;
}
