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

export interface DraftPick {
  id: string;
  season: number;
  round: number;
  /** The team the pick originally belonged to (it decides the draft slot). */
  originalTeam: string;
}

type RosterPlayer = Pick<Player, 'id' | 'name' | 'position' | 'team' | 'bye'> & { age: number | null };

export interface SleeperTeam {
  leagueId: string;
  leagueName: string;
  teamName: string;
  scoring: 'ppr' | 'half' | 'std';
  /** The league's own scoring rules that differ between leagues (see SCORING_KEYS), for scoring players its way. */
  scoringSettings: Record<string, number>;
  slots: LineupSlot[];
  players: RosterPlayer[];
  /** Dynasty league (Sleeper league type 2): player age and draft picks matter in trades. */
  dynasty: boolean;
  /** Future rookie draft picks this team owns (dynasty leagues only). */
  picks: DraftPick[];
  /** Who is in the Sleeper lineup right now, as our player ids. */
  starters: string[];
  /** The same lineup slot by slot, lined up with `slots` (null for an empty slot). */
  startersBySlot: (string | null)[];
  /** The other teams in the league, for the trade tool. */
  opponents: { teamName: string; players: RosterPlayer[]; picks: DraftPick[]; starters: string[] }[];
}

export interface SleeperImport {
  username: string;
  displayName: string;
  season: number;
  /** When these rosters were read from Sleeper (they are cached for a few minutes). */
  fetchedAt: string;
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
const NON_STARTER_SLOTS = new Set(['BN', 'IR', 'TAXI']);
const SLOT_LABELS: Record<string, string> = {
  DEF: 'DST', WRRB_FLEX: 'W/R', REC_FLEX: 'W/T', SUPER_FLEX: 'SUPERFLEX',
};

const cache = new Map<string, { at: number; value: SleeperImport }>();
const SLEEPER_PLAYERS_URL = `${SLEEPER_API}/players/nfl`;
const AGES_CACHE_MS = 24 * 60 * 60 * 1000;
const PICK_SEASONS = 3;
const ages: { at: number; value: Map<string, number> | null } = { at: 0, value: null };

export function clearSleeperCache() {
  cache.clear();
  ages.at = 0;
  ages.value = null;
}

/**
 * Ages of every NFL player, keyed by our player id. Sleeper only offers them in its full player
 * database (a few MB), so it is loaded at most once a day and only when a dynasty league needs it.
 */
async function getAges(fetchJson: FetchJson, now: Date): Promise<Map<string, number>> {
  if (ages.value && now.getTime() - ages.at < AGES_CACHE_MS) return ages.value;
  const raw = await fetchJson(SLEEPER_PLAYERS_URL);
  const map = new Map<string, number>();
  for (const [sleeperId, info] of Object.entries((raw ?? {}) as Record<string, Record<string, unknown> | null>)) {
    if (!info) continue;
    const birth = Date.parse(text(info.birth_date));
    const age = Number.isFinite(birth)
      ? (now.getTime() - birth) / (365.25 * 24 * 60 * 60 * 1000)
      : Number(info.age);
    if (Number.isFinite(age) && age > 15) map.set(`sleeper-${sleeperId}`, Math.round(age * 10) / 10);
  }
  ages.at = now.getTime();
  ages.value = map;
  return map;
}

/**
 * Who owns which rookie picks for the next few drafts: every team starts with its own picks
 * and Sleeper's traded_picks list says where the traded ones went.
 */
function buildPicks(
  rosterIds: string[], tradedPicks: unknown, firstSeason: number, rounds: number, teamName: (rosterId: string) => string,
): Map<string, DraftPick[]> {
  const owner = new Map<string, string>();
  for (const traded of Array.isArray(tradedPicks) ? tradedPicks : []) {
    const t = traded as Record<string, unknown>;
    owner.set(`${text(t?.season)}-${text(t?.round)}-${text(t?.roster_id)}`, text(t?.owner_id));
  }
  const byOwner = new Map<string, DraftPick[]>(rosterIds.map((id) => [id, []]));
  for (let season = firstSeason; season < firstSeason + PICK_SEASONS; season += 1) {
    for (let round = 1; round <= rounds; round += 1) {
      for (const original of rosterIds) {
        const key = `${season}-${round}-${original}`;
        const current = owner.get(key) || original;
        byOwner.get(current)?.push({ id: key, season, round, originalTeam: teamName(original) });
      }
    }
  }
  return byOwner;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '');

// Sleeper scoring_settings keys the site can apply to box scores.
const SCORING_KEYS = [
  'pass_yd', 'pass_td', 'pass_int', 'pass_2pt', 'rush_yd', 'rush_td', 'rush_att', 'rush_2pt',
  'rec', 'rec_yd', 'rec_td', 'rec_2pt', 'fum_lost', 'bonus_rec_te', 'bonus_rec_rb', 'bonus_rec_wr',
];
const scoringSettingsOf = (settings: unknown): Record<string, number> => {
  const raw = (settings ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of SCORING_KEYS) {
    const value = Number(raw[key]);
    if (raw[key] != null && Number.isFinite(value)) out[key] = value;
  }
  return out;
};

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

    const settings = (l.settings ?? {}) as Record<string, unknown>;
    const dynasty = Number(settings.type) === 2;
    let ageById: Map<string, number> | null = null;
    let tradedPicks: unknown = [];
    if (dynasty) {
      try {
        ageById = await getAges(fetchJson, now);
      } catch {
        ageById = null;
      }
      try {
        tradedPicks = await fetchJson(`${SLEEPER_API}/league/${leagueId}/traded_picks`);
      } catch {
        tradedPicks = [];
      }
    }

    const toPlayers = (roster: Record<string, unknown>): RosterPlayer[] => (Array.isArray(roster.players) ? roster.players : [])
      .map(text).filter(Boolean).map((sleeperId) => {
        const id = `sleeper-${sleeperId}`;
        const known = poolById.get(id);
        const isDefense = /^[A-Z]{2,3}$/.test(sleeperId);
        const age = ageById?.get(id) ?? null;
        return known
          ? { id, name: known.name, position: known.position, team: known.team, bye: known.bye, age }
          : { id, name: isDefense ? `${sleeperId} Defense` : `Player ${sleeperId}`, position: isDefense ? 'DST' : '', team: isDefense ? sleeperId : '', bye: 0, age };
      });
    const rosterName = (roster: Record<string, unknown>, fallback: string) => {
      const rosterMeta = (roster.metadata ?? {}) as Record<string, unknown>;
      return text(rosterMeta.team_name) || ownerNames.get(text(roster.owner_id)) || fallback;
    };
    const myName = rosterName(mine, text(user?.display_name) || username);

    // Rookie drafts not yet held: this season's while the league hasn't drafted, then the next ones.
    const status = text(l.status);
    const firstPickSeason = status === 'pre_draft' || status === 'drafting' ? season : season + 1;
    const rounds = Math.max(1, Math.min(7, Math.trunc(Number(settings.draft_rounds)) || 4));
    const rosterIds = rosterList.map((roster) => text(roster.roster_id)).filter(Boolean);
    const nameByRosterId = new Map(rosterList.map((roster, index) => [text(roster.roster_id), rosterName(roster, `Team ${text(roster.roster_id) || index + 1}`)]));
    const picksByRoster = dynasty
      ? buildPicks(rosterIds, tradedPicks, firstPickSeason, rounds, (id) => nameByRosterId.get(id) ?? `Team ${id}`)
      : new Map<string, DraftPick[]>();

    const players = toPlayers(mine);
    const opponents = rosterList
      .filter((roster) => roster !== mine)
      .map((roster, index) => ({
        teamName: rosterName(roster, `Team ${text(roster.roster_id) || index + 1}`),
        players: toPlayers(roster),
        picks: picksByRoster.get(text(roster.roster_id)) ?? [],
        starters: (Array.isArray(roster.starters) ? roster.starters.map(text) : [])
          .filter((id) => id && id !== '0').map((id) => `sleeper-${id}`),
      }))
      .filter((team) => team.players.length > 0 || team.picks.length > 0);

    // Sleeper's starters list follows roster_positions minus the bench, IR and taxi spots, so it can be
    // lined up with the slots to know which slot each starter is in.
    const starterSlots = (Array.isArray(l.roster_positions) ? l.roster_positions : [])
      .map(text)
      .filter((slot) => slot && !NON_STARTER_SLOTS.has(slot));
    const currentStarters = Array.isArray(mine.starters) ? mine.starters.map(text) : [];
    const slots: LineupSlot[] = [];
    const startersBySlot: (string | null)[] = [];
    starterSlots.forEach((slot, index) => {
      if (!SLOT_POSITIONS[slot]) return;
      slots.push({ label: SLOT_LABELS[slot] ?? slot, positions: SLOT_POSITIONS[slot] });
      const id = currentStarters[index];
      startersBySlot.push(id && id !== '0' ? `sleeper-${id}` : null);
    });

    teams.push({
      leagueId,
      leagueName: text(l.name) || 'Sleeper league',
      teamName: myName,
      dynasty,
      picks: picksByRoster.get(text(mine.roster_id)) ?? [],
      scoring: scoringFor(l.scoring_settings),
      scoringSettings: scoringSettingsOf(l.scoring_settings),
      slots,
      players,
      opponents,
      starters: currentStarters.filter((id) => id && id !== '0').map((id) => `sleeper-${id}`),
      startersBySlot,
    });
  }

  const value = { username, displayName: text(user?.display_name) || username, season, fetchedAt: now.toISOString(), teams };
  cache.set(key, { at: nowMs, value });
  return value;
}
