// League and profile shapes. JSON field names match what the React app already reads.

export const AUCTION = 'auction';
export const MANUAL = 'manual';

export interface Player {
  id: string;
  name: string;
  position: string;
  team: string;
  rank: number;
  bye: number;
  isDrafted: boolean;
  price: number;
}

export interface Bid {
  amount: number;
  timestamp: string;
}

export interface AuctionTimer {
  endTime: string;
  isPaused: boolean;
  timeRemainingOnPause: number;
}

export interface RosterSpot {
  position: string;
  player: Player;
}

export interface Team {
  id: string;
  ownerId: string;
  name: string;
  budget: number;
  roster: RosterSpot[];
  favoritePlayerIds: string[];
}

export interface DraftPick {
  winningTeamId: string;
  winningBid: number;
  player: Player;
  allBids: Record<string, Bid>;
}

export interface TieBreakerInfo {
  tiedTeamIds: string[];
  tieAmount: number;
  round: number;
}

export interface RosterSettings {
  qb: number;
  wr: number;
  rb: number;
  te: number;
  k: number;
  def: number;
  flex: number;
  superFlex: number;
  bench: number;
}

export interface DraftTimers {
  bidTimer: number;
  intermissionTimer: number;
  rebidTimer: number;
}

export interface League {
  id: string;
  name: string;
  adminId: string;
  password: string | null;
  members: string[];
  teams: Team[];
  status: string | null;
  draftMode: string;
  readyMembers: string[];
  rosterSettings: RosterSettings;
  draftTimers: DraftTimers;
  initialPlayerPool: Player[];
  currentPlayerId: string | null;
  activeBids: Record<string, Bid>;
  auctionTimer: AuctionTimer | null;
  draftLog: DraftPick[];
  beerBitchTeamId: string | null;
  tieBreaker: TieBreakerInfo | null;
  onlineUserIds: string[];
  awayUserIds: string[];
}

export interface UserProfile {
  id: string;
  userId: string;
  displayName: string;
  defaultTeamName: string;
  favoritePlayerIds: string[];
  playerNotes: Record<string, string>;
  playerTiers: Record<string, number>;
  budgetPlan: Record<string, number>;
  budgetRosterSettings: Record<string, number>;
}

export const defaultRosterSettings = (): RosterSettings => ({
  qb: 1, wr: 3, rb: 2, te: 1, k: 1, def: 1, flex: 1, superFlex: 1, bench: 6,
});

export const defaultDraftTimers = (): DraftTimers => ({
  bidTimer: 20, intermissionTimer: 30, rebidTimer: 15,
});

const toInt = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

export const normalizeRosterSettings = (value: unknown): RosterSettings => {
  const defaults = defaultRosterSettings();
  if (!value || typeof value !== 'object') return defaults;
  const input = value as Record<string, unknown>;
  const read = (key: keyof RosterSettings, ...aliases: string[]) => {
    for (const name of [key, ...aliases]) {
      if (input[name] !== undefined && input[name] !== null) return toInt(input[name], defaults[key]);
    }
    return defaults[key];
  };
  return {
    qb: read('qb', 'QB'),
    wr: read('wr', 'WR'),
    rb: read('rb', 'RB'),
    te: read('te', 'TE'),
    k: read('k', 'K'),
    def: read('def', 'DEF'),
    flex: read('flex', 'FLEX'),
    superFlex: read('superFlex', 'SuperFlex', 'superflex'),
    bench: read('bench', 'Bench'),
  };
};

export const normalizeDraftTimers = (value: unknown): DraftTimers => {
  const defaults = defaultDraftTimers();
  if (!value || typeof value !== 'object') return defaults;
  const input = value as Record<string, unknown>;
  return {
    bidTimer: input.bidTimer == null ? defaults.bidTimer : toInt(input.bidTimer, defaults.bidTimer),
    intermissionTimer: input.intermissionTimer == null ? defaults.intermissionTimer : toInt(input.intermissionTimer, defaults.intermissionTimer),
    rebidTimer: input.rebidTimer == null ? defaults.rebidTimer : toInt(input.rebidTimer, defaults.rebidTimer),
  };
};

export const normalizeDraftMode = (value: unknown): string =>
  String(value ?? '').toLowerCase() === MANUAL ? MANUAL : AUCTION;

export const isManual = (value: unknown): boolean => normalizeDraftMode(value) === MANUAL;

export function ensureDefaults(league: League): League {
  league.members = league.members ?? [];
  league.teams = league.teams ?? [];
  league.readyMembers = league.readyMembers ?? [];
  league.rosterSettings = normalizeRosterSettings(league.rosterSettings);
  league.draftTimers = normalizeDraftTimers(league.draftTimers);
  league.initialPlayerPool = league.initialPlayerPool ?? [];
  league.activeBids = league.activeBids ?? {};
  league.draftLog = league.draftLog ?? [];
  league.onlineUserIds = league.onlineUserIds ?? [];
  league.awayUserIds = league.awayUserIds ?? [];
  league.draftMode = normalizeDraftMode(league.draftMode);
  league.currentPlayerId = league.currentPlayerId ?? null;
  league.auctionTimer = league.auctionTimer ?? null;
  league.tieBreaker = league.tieBreaker ?? null;
  league.beerBitchTeamId = league.beerBitchTeamId ?? null;
  league.status = league.status ?? null;
  if (league.tieBreaker) {
    league.tieBreaker.tiedTeamIds = league.tieBreaker.tiedTeamIds ?? [];
  }
  for (const team of league.teams) {
    if (!team) continue;
    team.roster = team.roster ?? [];
    team.favoritePlayerIds = team.favoritePlayerIds ?? [];
  }
  for (const pick of league.draftLog) {
    if (!pick) continue;
    pick.allBids = pick.allBids ?? {};
  }
  return league;
}

/** Copy sent to browsers: never includes the league password. */
/**
 * The league as browsers may see it. Bids are sealed until the round ends, so `activeBids` only ever
 * carries the viewer's own bid (none at all for live broadcasts, which every member receives).
 */
export function forClient(league: League, version?: number, viewerId: string | null = null): Record<string, unknown> {
  ensureDefaults(league);
  const { password: _password, ...rest } = league;
  const ownBid = viewerId ? league.activeBids[viewerId] : undefined;
  const activeBids = ownBid ? { [viewerId as string]: ownBid } : {};
  const copy: Record<string, unknown> = { ...rest, password: null, draftPlayers: null, activeBids };
  if (version !== undefined) copy._version = version;
  return copy;
}

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
