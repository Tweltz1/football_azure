// Weekly projections for the Start/Sit page, from Sleeper's public projections feed.
// Player ids match the draft pool ("sleeper-<id>", or "sleeper-<TEAM>" for defenses),
// so the page can line projections up with the rosters people drafted.

export type FetchJson = (url: string) => Promise<unknown>;

export interface Points {
  ppr: number;
  half: number;
  std: number;
}

export interface GameLine {
  week: number;
  opponent: string | null;
  points: Points;
  /** The game's box score with zero stats left out, so pages can score it for any league's settings. */
  stats?: Partial<BoxScore>;
}

export interface ProjectedPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  opponent: string | null;
  injury: string | null;
  points: Points;
  /** Projected box score (zero stats left out), for scoring the projection with a league's own settings. */
  stats: Partial<BoxScore>;
  /** Up to the last 4 games played before this week, oldest first. */
  recent: GameLine[];
  /** Average over every game played this season before this week, or null when none. */
  seasonAvg: Points | null;
  /** Per-game average box score over the same games (zero stats left out). */
  seasonStats: Partial<BoxScore> | null;
  gamesPlayed: number;
  /**
   * Sleeper's projections for the next few weeks, soonest first: who they play and what they're
   * expected to score. A week with zero points means Sleeper doesn't expect them to play; bye weeks
   * are left out.
   */
  upcoming: GameLine[];
}

/** Box-score numbers from one game (or per-game averages). */
export interface BoxScore {
  passYd: number;
  passTd: number;
  int: number;
  rushAtt: number;
  rushYd: number;
  rushTd: number;
  tgt: number;
  rec: number;
  recYd: number;
  recTd: number;
  fumLost: number;
  /** Two-point conversions: passing, rushing and receiving together. */
  twoPt: number;
}

/** What a defense has given up to one position this season, per game. */
export interface DefenseVsPosition {
  games: number;
  points: Points;
  box: BoxScore;
  /** 1 = gave up the most fantasy points to this position (easiest matchup), 32 = the fewest. */
  rank: number;
  teams: number;
  /** The biggest single games this defense gave up to the position this season, best first. */
  top: NotableGame[];
}

export interface NotableGame {
  id: string;
  name: string;
  team: string;
  week: number;
  points: Points;
  box: BoxScore;
}

export interface MatchupGame {
  season: number;
  week: number;
  team: string | null;
  points: Points;
  box: BoxScore;
}

export interface MatchupHistory {
  playerId: string;
  opponent: string;
  games: MatchupGame[];
  average: Points | null;
}

export interface WeekProjections {
  season: number;
  week: number;
  currentWeek: number;
  seasonType: string;
  fetchedAt: string;
  players: ProjectedPlayer[];
  /** Weeks covered by each player's `upcoming` list (the weeks after this one). */
  upcomingWeeks: number[];
  /** defense[team][position]: what that defense allowed to QBs, RBs, WRs and TEs in the weeks before this one. */
  defense: Record<string, Record<string, DefenseVsPosition>>;
}

const SLEEPER_STATE_URL = 'https://api.sleeper.app/v1/state/nfl';
const SLEEPER_PROJECTIONS_URL = 'https://api.sleeper.com/projections/nfl';
const SLEEPER_STATS_URL = 'https://api.sleeper.com/stats/nfl';
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const CACHE_MS = 30 * 60 * 1000;
// Finished weeks don't change, so they can be kept much longer.
const PAST_CACHE_MS = 12 * 60 * 60 * 1000;
const RECENT_GAMES = 4;
// How far ahead trade values look at Sleeper's weekly projections.
const UPCOMING_WEEKS = 4;
const LAST_REGULAR_WEEK = 18;
const MATCHUP_SEASONS = 4;

interface CacheEntry<T> {
  at: number;
  value: T;
}
const stateCache: { entry: CacheEntry<{ season: number; week: number; seasonType: string }> | null } = { entry: null };
const projectionCache = new Map<string, CacheEntry<WeekProjections>>();
const weekStatsCache = new Map<string, CacheEntry<Map<string, StatLine>>>();
const playerSeasonCache = new Map<string, CacheEntry<SeasonGame[]>>();
const futureCache = new Map<string, CacheEntry<{ teams: Set<string>; lines: Map<string, GameLine> }>>();

interface SeasonGame extends MatchupGame {
  opponent: string | null;
}

interface StatLine extends GameLine {
  box: BoxScore;
  injury: string | null;
  name: string;
  position: string;
  team: string;
}

/** For tests: forget cached Sleeper responses. */
export function clearStartSitCache() {
  futureCache.clear();
  stateCache.entry = null;
  projectionCache.clear();
  weekStatsCache.clear();
  playerSeasonCache.clear();
}

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const round1 = (value: number) => Math.round(value * 10) / 10;
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The regular-season week by the calendar: week 1 starts the Tuesday before the season opener, and each
 * week rolls over at 6am Eastern (10:00 UTC) on Tuesday, once the Monday night game is done. Returns 0 when
 * the start date is missing or unreadable, so the caller falls back to Sleeper's week.
 */
export function weekByTuesday(seasonStartDate: string, nowMs: number): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(seasonStartDate);
  if (!match) return 0;
  const opener = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(opener)) return 0;
  const daysBackToTuesday = (new Date(opener).getUTCDay() - 2 + 7) % 7;
  const weekOneStart = opener - daysBackToTuesday * DAY_MS + 10 * 60 * 60 * 1000;
  if (nowMs < weekOneStart) return 0;
  return Math.min(18, Math.floor((nowMs - weekOneStart) / (7 * DAY_MS)) + 1);
}

export async function currentState(fetchJson: FetchJson, nowMs: number) {
  const cached = stateCache.entry;
  if (cached && nowMs - cached.at < CACHE_MS) return cached.value;
  const raw = (await fetchJson(SLEEPER_STATE_URL)) as Record<string, unknown>;
  const seasonType = text(raw?.season_type) || 'regular';
  // In the off-season and preseason Sleeper reports week 0 or 1; week 1 is the first one worth showing.
  const sleeperWeek = Math.max(1, Math.trunc(num(raw?.display_week ?? raw?.week)));
  // Sleeper moves on to the next week midweek; the league treats Tuesday as the start of a new week.
  const week = seasonType === 'regular'
    ? Math.max(sleeperWeek, weekByTuesday(text(raw?.season_start_date), nowMs))
    : sleeperWeek;
  const value = { season: Math.trunc(num(raw?.season)) || new Date(nowMs).getUTCFullYear(), week, seasonType };
  stateCache.entry = { at: nowMs, value };
  return value;
}

const positionsQuery = () => POSITIONS.map((p) => `position[]=${p}`).join('&');

const BOX_KEYS: [keyof BoxScore, string][] = [
  ['passYd', 'pass_yd'], ['passTd', 'pass_td'], ['int', 'pass_int'], ['rushAtt', 'rush_att'], ['rushYd', 'rush_yd'],
  ['rushTd', 'rush_td'], ['tgt', 'rec_tgt'], ['rec', 'rec'], ['recYd', 'rec_yd'], ['recTd', 'rec_td'],
  ['fumLost', 'fum_lost'], ['twoPt', ''],
];

function boxFrom(stats: Record<string, unknown>): BoxScore {
  const box = {} as BoxScore;
  for (const [key, sleeperKey] of BOX_KEYS) box[key] = sleeperKey ? num(stats[sleeperKey]) : 0;
  box.twoPt = num(stats.pass_2pt) + num(stats.rush_2pt) + num(stats.rec_2pt);
  return box;
}

/** A box score without its zero stats, to keep the response small. */
const compactBox = (box: BoxScore): Partial<BoxScore> => {
  const out: Partial<BoxScore> = {};
  for (const [key] of BOX_KEYS) if (box[key]) out[key] = round1(box[key]);
  return out;
};

const averageBox = (boxes: BoxScore[]): Partial<BoxScore> | null => {
  if (boxes.length === 0) return null;
  const total = boxFrom({});
  for (const box of boxes) for (const [key] of BOX_KEYS) total[key] += box[key];
  for (const [key] of BOX_KEYS) total[key] /= boxes.length;
  return compactBox(total);
};

function pointsFrom(stats: Record<string, unknown>): Points {
  const std = num(stats.pts_std);
  const half = stats.pts_half_ppr != null ? num(stats.pts_half_ppr) : std + num(stats.rec) * 0.5;
  const ppr = stats.pts_ppr != null ? num(stats.pts_ppr) : std + num(stats.rec);
  return { ppr: round1(ppr), half: round1(half), std: round1(std) };
}

const averagePoints = (lines: { points: Points }[]): Points | null => {
  if (lines.length === 0) return null;
  const sum = (key: keyof Points) => round1(lines.reduce((total, line) => total + line.points[key], 0) / lines.length);
  return { ppr: sum('ppr'), half: sum('half'), std: sum('std') };
};

/** Sleeper "player id" for one of our pool ids ("sleeper-4984" -> "4984", "sleeper-BUF" -> "BUF"). */
const sleeperIdOf = (id: string) => id.replace(/^sleeper-/, '');

/** Real games only: Sleeper lists rows for players who sat out with empty stats. */
const playedGame = (stats: Record<string, unknown>) =>
  stats.gp != null ? num(stats.gp) > 0 : Object.keys(stats).some((key) => key.startsWith('pts_'));

function toPlayer(row: Record<string, unknown>): Omit<ProjectedPlayer, 'recent' | 'seasonAvg' | 'seasonStats' | 'gamesPlayed' | 'upcoming'> | null {
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

  return {
    id: `sleeper-${playerId}`,
    name,
    position,
    team,
    opponent: text(row.opponent) || null,
    injury: text(info.injury_status) || null,
    points: pointsFrom(stats),
    stats: compactBox(boxFrom(stats)),
  };
}

/** Actual results for one finished week, keyed by our player id. */
async function getWeekStats(fetchJson: FetchJson, season: number, week: number, nowMs: number): Promise<Map<string, StatLine>> {
  const key = `${season}-${week}`;
  const cached = weekStatsCache.get(key);
  if (cached && nowMs - cached.at < PAST_CACHE_MS) return cached.value;

  const rows = await fetchJson(`${SLEEPER_STATS_URL}/${season}/${week}?season_type=regular&${positionsQuery()}`);
  if (!Array.isArray(rows)) throw new Error('Sleeper stats response was not a list.');
  const lines = new Map<string, StatLine>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const parsed = toPlayer(record);
    if (!parsed || !playedGame((record.stats ?? {}) as Record<string, unknown>)) continue;
    lines.set(parsed.id, {
      week,
      opponent: parsed.opponent,
      points: parsed.points,
      box: boxFrom((record.stats ?? {}) as Record<string, unknown>),
      injury: parsed.injury,
      name: parsed.name,
      position: parsed.position,
      team: parsed.team,
    });
  }
  weekStatsCache.set(key, { at: nowMs, value: lines });
  return lines;
}

/** Every finished week of the season before `week`, oldest first. Weeks Sleeper can't serve are skipped. */
async function getPastWeeks(fetchJson: FetchJson, season: number, week: number, currentWeek: number, nowMs: number) {
  const lastFinished = Math.min(week, currentWeek) - 1;
  const weeks = Array.from({ length: Math.max(0, lastFinished) }, (_, i) => i + 1);
  const results = await Promise.allSettled(weeks.map((w) => getWeekStats(fetchJson, season, w, nowMs)));
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

/** Sleeper's projections for a future week: each player's line, and which teams play that week. */
async function getFutureWeek(fetchJson: FetchJson, season: number, seasonType: string, week: number, nowMs: number) {
  const key = `${season}-${seasonType}-${week}`;
  const cached = futureCache.get(key);
  if (cached && nowMs - cached.at < CACHE_MS) return cached.value;
  const rows = await fetchJson(`${SLEEPER_PROJECTIONS_URL}/${season}/${week}?season_type=${seasonType}&${positionsQuery()}&order_by=pts_ppr`);
  if (!Array.isArray(rows)) throw new Error('Sleeper projections response was not a list.');
  const teams = new Set<string>();
  const lines = new Map<string, GameLine>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const player = toPlayer(row as Record<string, unknown>);
    if (!player) continue;
    if (player.team && player.opponent) teams.add(player.team);
    const existing = lines.get(player.id);
    if (!existing || existing.points.ppr < player.points.ppr) {
      lines.set(player.id, { week, opponent: player.opponent, points: player.points, stats: player.stats });
    }
  }
  const value = { teams, lines };
  futureCache.set(key, { at: nowMs, value });
  return value;
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

  const url = `${SLEEPER_PROJECTIONS_URL}/${state.season}/${week}?season_type=${seasonType}&${positionsQuery()}&order_by=pts_ppr`;
  const futureWeeks = seasonType === 'regular'
    ? Array.from({ length: UPCOMING_WEEKS }, (_, i) => week + 1 + i).filter((w) => w <= LAST_REGULAR_WEEK)
    : [];
  const [rows, pastWeeks, futureResults] = await Promise.all([
    fetchJson(url),
    seasonType === 'regular' ? getPastWeeks(fetchJson, state.season, week, state.week, nowMs) : Promise.resolve([]),
    // A future week Sleeper can't serve is simply left out.
    Promise.allSettled(futureWeeks.map((w) => getFutureWeek(fetchJson, state.season, seasonType, w, nowMs))),
  ]);
  const future = futureResults.flatMap((result, i) => (result.status === 'fulfilled' ? [{ week: futureWeeks[i], ...result.value }] : []));
  if (!Array.isArray(rows)) throw new Error('Sleeper projections response was not a list.');

  // Every game each player has played this season, oldest first.
  const games = new Map<string, StatLine[]>();
  for (const weekLines of pastWeeks) {
    for (const [id, line] of weekLines) {
      if (!games.has(id)) games.set(id, []);
      games.get(id)!.push(line);
    }
  }
  const withHistory = (player: Omit<ProjectedPlayer, 'recent' | 'seasonAvg' | 'seasonStats' | 'gamesPlayed' | 'upcoming'>): ProjectedPlayer => {
    const played = games.get(player.id) ?? [];
    return {
      ...player,
      recent: played.slice(-RECENT_GAMES).map(({ week: w, opponent, points, box }) => ({ week: w, opponent, points, stats: compactBox(box) })),
      seasonAvg: averagePoints(played),
      seasonStats: averageBox(played.map((line) => line.box)),
      gamesPlayed: played.length,
      upcoming: future.flatMap((f) => {
        const line = f.lines.get(player.id);
        if (line) return [line];
        // No line on a week their team plays means Sleeper doesn't expect them to; on a bye it's left out.
        return f.teams.has(player.team) ? [{ week: f.week, opponent: null, points: { ppr: 0, half: 0, std: 0 } }] : [];
      }),
    };
  };

  const byId = new Map<string, ProjectedPlayer>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const player = toPlayer(row as Record<string, unknown>);
    if (!player) continue;
    // Injured players stay in the list even with no projection, so the page can show who's out.
    if (player.points.ppr <= 0 && player.points.std <= 0 && !player.injury) continue;
    const existing = byId.get(player.id);
    if (!existing || existing.points.ppr < player.points.ppr) byId.set(player.id, withHistory(player));
  }

  // Players hurt for the long haul can drop out of the projections entirely; their latest game still says so.
  for (const [id, played] of games) {
    const latest = played[played.length - 1];
    if (byId.has(id) || !latest.injury) continue;
    byId.set(id, withHistory({
      id, name: latest.name, position: latest.position, team: latest.team, opponent: null,
      injury: latest.injury, points: { ppr: 0, half: 0, std: 0 }, stats: {},
    }));
  }

  const value: WeekProjections = {
    defense: buildDefenseTable(pastWeeks),
    season: state.season,
    week,
    currentWeek: state.week,
    upcomingWeeks: future.map((f) => f.week),
    seasonType,
    fetchedAt: now.toISOString(),
    players: [...byId.values()].sort((a, b) => b.points.ppr - a.points.ppr),
  };
  projectionCache.set(key, { at: nowMs, value });
  return value;
}

async function getPlayerSeason(fetchJson: FetchJson, playerId: string, season: number, nowMs: number): Promise<SeasonGame[]> {
  const key = `${playerId}-${season}`;
  const cached = playerSeasonCache.get(key);
  if (cached && nowMs - cached.at < PAST_CACHE_MS) return cached.value;

  const raw = await fetchJson(
    `${SLEEPER_STATS_URL}/player/${encodeURIComponent(sleeperIdOf(playerId))}?season_type=regular&season=${season}&grouping=week`,
  );
  // Sleeper answers with { "1": row, "2": row, ... } (null for byes); accept a plain list too.
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw as Record<string, unknown>) : [];
  const games: SeasonGame[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const stats = (record.stats ?? {}) as Record<string, unknown>;
    const week = Math.trunc(num(record.week));
    if (!week || !playedGame(stats)) continue;
    games.push({
      season,
      week,
      team: text(record.team) || null,
      points: pointsFrom(stats),
      box: boxFrom(stats),
      opponent: text(record.opponent) || null,
    });
  }
  playerSeasonCache.set(key, { at: nowMs, value: games });
  return games;
}

/** A player's games against one opponent over the last few seasons (this one included), newest first. */
export async function getMatchupHistory(
  fetchJson: FetchJson, now: Date, playerId: string, opponent: string,
): Promise<MatchupHistory> {
  const nowMs = now.getTime();
  const state = await currentState(fetchJson, nowMs);
  const seasons = Array.from({ length: MATCHUP_SEASONS }, (_, i) => state.season - i);
  const results = await Promise.allSettled(seasons.map((season) => getPlayerSeason(fetchJson, playerId, season, nowMs)));
  if (results.every((result) => result.status === 'rejected')) throw new Error('Sleeper player stats were unavailable.');

  const target = opponent.toUpperCase();
  const games = results
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .filter((game) => (game.opponent ?? '').toUpperCase() === target)
    .map(({ season, week, team, points, box }) => ({ season, week, team, points, box }))
    .sort((a, b) => b.season - a.season || b.week - a.week);

  return { playerId, opponent: target, games, average: averagePoints(games) };
}

const DEFENSE_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
// Big games against each defense to show as examples.
const NOTABLE_GAMES = 3;

/**
 * Per-game totals each defense allowed to each position: every player's game is credited to the
 * team they played against, then summed per week (so three WRs in one game count as one game).
 */
export function buildDefenseTable(pastWeeks: Map<string, StatLine>[]): Record<string, Record<string, DefenseVsPosition>> {
  type Totals = { weeks: Set<number>; points: Points; box: BoxScore; games: NotableGame[] };
  const totals = new Map<string, Totals>();
  for (const weekLines of pastWeeks) {
    for (const [id, line] of weekLines) {
      if (!line.opponent || !DEFENSE_POSITIONS.includes(line.position)) continue;
      const key = `${line.opponent}|${line.position}`;
      let entry = totals.get(key);
      if (!entry) {
        entry = { weeks: new Set(), points: { ppr: 0, half: 0, std: 0 }, box: boxFrom({}), games: [] };
        totals.set(key, entry);
      }
      entry.games.push({ id, name: line.name, team: line.team, week: line.week, points: line.points, box: line.box });
      entry.weeks.add(line.week);
      for (const k of ['ppr', 'half', 'std'] as const) entry.points[k] += line.points[k];
      for (const [k] of BOX_KEYS) entry.box[k] += line.box[k];
    }
  }

  const table: Record<string, Record<string, DefenseVsPosition>> = {};
  for (const [key, entry] of totals) {
    const [team, position] = key.split('|');
    const games = entry.weeks.size;
    const per = (value: number) => round1(value / games);
    const box = {} as BoxScore;
    for (const [k] of BOX_KEYS) box[k] = per(entry.box[k]);
    table[team] = table[team] ?? {};
    table[team][position] = {
      games,
      points: { ppr: per(entry.points.ppr), half: per(entry.points.half), std: per(entry.points.std) },
      box,
      rank: 0,
      teams: 0,
      top: entry.games.sort((a, b) => b.points.ppr - a.points.ppr).slice(0, NOTABLE_GAMES),
    };
  }

  for (const position of DEFENSE_POSITIONS) {
    const rows = Object.values(table).map((byPosition) => byPosition[position]).filter(Boolean);
    rows.sort((a, b) => b.points.ppr - a.points.ppr);
    rows.forEach((row, index) => {
      row.rank = index + 1;
      row.teams = rows.length;
    });
  }
  return table;
}
