// Ports of api/Shared/{BidRules,DraftLogic,NflByeWeeks,TeamNameHelper}.cs

import type { Bid, League, Player, RosterSettings, RosterSpot, Team, UserProfile } from './models.ts';
import { ensureDefaults } from './models.ts';

// ---- Bye weeks -------------------------------------------------------------

const BYE_BY_TEAM: Record<string, number> = {
  ARI: 14, ATL: 11, BAL: 13, BUF: 7, CAR: 5, CHI: 10, CIN: 6, CLE: 11,
  DAL: 14, DEN: 10, DET: 6, GB: 11, HOU: 8, IND: 13, JAX: 7, KC: 5,
  LAC: 7, LAR: 11, LV: 13, MIA: 6, MIN: 6, NE: 11, NO: 8, NYG: 8,
  NYJ: 13, PHI: 10, PIT: 9, SEA: 11, SF: 8, TB: 10, TEN: 9, WAS: 7,
};

const TEAM_ALIASES: Record<string, string> = { WSH: 'WAS', JAC: 'JAX' };

export function normalizeTeam(team: string | null | undefined): string {
  if (!team || !team.trim()) return '';
  const normalized = team.trim().toUpperCase();
  return TEAM_ALIASES[normalized] ?? normalized;
}

export const isKnownTeam = (team: string | null | undefined): boolean =>
  Object.prototype.hasOwnProperty.call(BYE_BY_TEAM, normalizeTeam(team));

function applyByeToPlayer(player: Player | null | undefined) {
  if (!player || player.bye > 0) return;
  const normalized = normalizeTeam(player.team);
  const bye = BYE_BY_TEAM[normalized];
  if (bye !== undefined) {
    player.team = normalized;
    player.bye = bye;
  }
}

export function applyByesToPlayers(players: Player[] | null | undefined) {
  for (const player of players ?? []) applyByeToPlayer(player);
}

export function applyByesToLeague(league: League) {
  applyByesToPlayers(league.initialPlayerPool);
  for (const team of league.teams ?? []) {
    for (const spot of team.roster ?? []) applyByeToPlayer(spot.player);
  }
  for (const pick of league.draftLog ?? []) applyByeToPlayer(pick.player);
}

// ---- Bid rules ------------------------------------------------------------

export function getRosterSpotTotal(settings: RosterSettings): number {
  return Math.max(0, settings.qb) + Math.max(0, settings.rb) + Math.max(0, settings.wr)
    + Math.max(0, settings.te) + Math.max(0, settings.k) + Math.max(0, settings.def)
    + Math.max(0, settings.flex) + Math.max(0, settings.superFlex) + Math.max(0, settings.bench);
}

export function getOpenRosterSpots(league: League, team: Team): number {
  return Math.max(0, getRosterSpotTotal(league.rosterSettings) - (team.roster?.length ?? 0));
}

export function getMaxBid(league: League, team: Team): number {
  const open = getOpenRosterSpots(league, team);
  if (open <= 0) return 0;
  return Math.max(0, team.budget - (open - 1));
}

export const maxBidMessage = (amount: number, maxBid: number) =>
  `Your bid of $${amount} exceeds your max bid of $${maxBid}. You must keep at least $1 for each remaining roster spot.`;

// ---- Draft flow -----------------------------------------------------------

export const secondsFromNow = (now: Date, seconds: number) =>
  new Date(now.getTime() + seconds * 1000).toISOString();

export function clearActiveBids(league: League) {
  league.activeBids = {};
  league.boardReview = null;
}

// ---- Whiteboard boards ------------------------------------------------------

export const BOARD_LIMITS = { strokes: 30, points: 2000, bytes: 6000 };

/**
 * Checks a drawing sent with a bid: up to 30 strokes, each a flat [x, y, x, y, ...] list of numbers in 0-100,
 * at most 2,000 points and ~6 KB in all. Numbers are rounded. A missing or empty drawing is `board: null`.
 */
export function parseBoard(value: unknown): { board: number[][] | null } | { error: string } {
  if (value == null) return { board: null };
  const invalid = { error: 'The drawing could not be read. Clear the board and try again.' };
  if (!Array.isArray(value)) return invalid;
  if (value.length === 0) return { board: null };
  if (value.length > BOARD_LIMITS.strokes) {
    return { error: `That drawing has too many strokes (${BOARD_LIMITS.strokes} max). Clear the board and try again.` };
  }
  const board: number[][] = [];
  let points = 0;
  for (const stroke of value) {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length % 2 !== 0) return invalid;
    points += stroke.length / 2;
    if (points > BOARD_LIMITS.points) return { error: 'That drawing is too detailed. Clear the board and try again.' };
    const out: number[] = [];
    for (const n of stroke) {
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) return invalid;
      out.push(Math.round(n));
    }
    board.push(out);
  }
  if (JSON.stringify(board).length > BOARD_LIMITS.bytes) return { error: 'That drawing is too large. Clear the board and try again.' };
  return { board };
}

/** Only the newest pick keeps its drawings, so the league document doesn't grow every round. */
export function stripOldBoards(league: League) {
  for (const pick of league.draftLog ?? []) {
    for (const bid of Object.values(pick?.allBids ?? {}) as Bid[]) {
      if (bid && 'board' in bid) delete bid.board;
    }
  }
}

function getMaxForPosition(settings: RosterSettings, position: string): number {
  switch (position.toUpperCase()) {
    case 'QB': return settings.qb;
    case 'RB': return settings.rb;
    case 'WR': return settings.wr;
    case 'TE': return settings.te;
    case 'K': return settings.k;
    case 'DEF':
    case 'DST': return settings.def;
    case 'FLEX': return settings.flex;
    case 'SUPERFLEX': return settings.superFlex;
    case 'BENCH': return settings.bench;
    default: return 0;
  }
}

export function getBestAvailableRosterSpot(settings: RosterSettings, roster: RosterSpot[], player: Player): string {
  const natural = (player?.position ?? '').toUpperCase();
  const count = (position: string) => roster.filter((spot) => spot.position === position).length;

  if (count(natural) < getMaxForPosition(settings, natural)) return natural;
  if (['RB', 'WR', 'TE'].includes(natural) && count('FLEX') < getMaxForPosition(settings, 'FLEX')) return 'FLEX';
  if (['QB', 'RB', 'WR', 'TE'].includes(natural) && count('SUPERFLEX') < getMaxForPosition(settings, 'SUPERFLEX')) return 'SUPERFLEX';
  return 'BENCH';
}

export function awardPlayerToTeam(
  league: League,
  player: Player,
  winningTeam: Team,
  amount: number,
  now: Date,
  nextStatus = 'intermission',
  startIntermissionTimer = true,
) {
  ensureDefaults(league);
  winningTeam.roster = winningTeam.roster ?? [];

  player.isDrafted = true;
  player.price = amount;
  winningTeam.budget -= amount;

  const rosterPosition = getBestAvailableRosterSpot(league.rosterSettings, winningTeam.roster, player);
  winningTeam.roster.push({ player: { ...player }, position: rosterPosition });

  stripOldBoards(league);
  league.draftLog.push({
    winningTeamId: winningTeam.id,
    winningBid: amount,
    player: { ...player },
    allBids: { ...(league.activeBids ?? {}) },
  });

  league.status = nextStatus || 'intermission';
  clearActiveBids(league);
  league.currentPlayerId = null;
  league.tieBreaker = null;
  league.auctionTimer = startIntermissionTimer
    ? { endTime: secondsFromNow(now, league.draftTimers.intermissionTimer), isPaused: false, timeRemainingOnPause: 0 }
    : null;
}

export function getNextRandomPlayerId(
  league: League,
  excludePlayerId: string | null = null,
  random: () => number = Math.random,
): string | null {
  const undrafted = (league.initialPlayerPool ?? [])
    .filter((p) => !p.isDrafted && isKnownTeam(p.team) && p.id !== excludePlayerId);
  if (undrafted.length === 0) return null;
  return undrafted[Math.floor(random() * undrafted.length)].id;
}

/** Puts the next random player up for bidding, or completes the draft when none remain. */
export function startNextPlayer(league: League, now: Date, excludePlayerId: string | null = null) {
  clearActiveBids(league);
  league.tieBreaker = null;
  league.currentPlayerId = getNextRandomPlayerId(league, excludePlayerId);
  if (league.currentPlayerId == null) {
    league.status = 'completed';
    league.auctionTimer = null;
  } else {
    league.status = 'drafting';
    league.auctionTimer = { endTime: secondsFromNow(now, league.draftTimers.bidTimer), isPaused: false, timeRemainingOnPause: 0 };
  }
}

// ---- Team names -----------------------------------------------------------

export function getPreferredTeamName(profile: UserProfile | null, fallbackUserId: string): string {
  if (profile?.defaultTeamName?.trim()) return profile.defaultTeamName.trim();
  const displayName = profile?.displayName?.trim() ? profile.displayName.trim() : fallbackUserId;
  return displayName && displayName.trim() ? `${displayName}'s Team` : 'New Team';
}

function slugify(value: string | null | undefined): string {
  if (!value || !value.trim()) return '';
  let out = '';
  for (const ch of value.trim()) {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      out += ch;
    } else if (out.length > 0 && !out.endsWith('_')) {
      out += '_';
    }
  }
  return out.replace(/^_+|_+$/g, '');
}

export function getUniqueTeamName(existingTeams: Team[], preferredName: string, displayName: string): string {
  const existing = new Set(
    (existingTeams ?? []).map((t) => t?.name).filter((n): n is string => !!n && !!n.trim()).map((n) => n.trim().toLowerCase()),
  );
  const has = (name: string) => existing.has(name.toLowerCase());

  const baseName = preferredName && preferredName.trim() ? preferredName.trim() : 'New Team';
  if (!has(baseName)) return baseName;

  const ownerPart = slugify(displayName);
  const candidateBase = ownerPart ? `${baseName}_${ownerPart}` : baseName;
  if (!has(candidateBase)) return candidateBase;

  let index = 2;
  while (has(`${candidateBase}_${index}`)) index += 1;
  return `${candidateBase}_${index}`;
}
