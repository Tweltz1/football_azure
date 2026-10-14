// Every API endpoint, ported from the C# Azure Functions in api/functions/.
// Routes and response shapes match the old API so the React app keeps working,
// with one deliberate change: the acting user always comes from the sign-in token,
// never from a userId/adminId the browser puts in the request body.

import type { Broadcaster, HistoryStore, LeagueStore, Logger, ProfileStore, StoredLeague } from './ports.ts';
import type { Bid, League, Player, RosterSettings, Team, UserProfile } from './models.ts';
import {
  clone, ensureDefaults, forClient, isManual, isWhiteboard, MANUAL, normalizeBiddingMode, normalizeDraftMode,
  normalizeDraftTimers, normalizeRosterSettings, WHITEBOARD_AUTO,
} from './models.ts';
import {
  applyByesToLeague, applyByesToPlayers, awardPlayerToTeam, clearActiveBids, getMaxBid, getOpenRosterSpots,
  getPreferredTeamName, getRosterSpotTotal, getUniqueTeamName, isKnownTeam, maxBidMessage, parseBoard,
  secondsFromNow, startNextPlayer,
} from './draftLogic.ts';
import { diffObjects } from './diff.ts';
import { learnFromBoard, sanitizeHandwriting } from './handwriting.ts';
import { draftNumberOf, historySummary, isCompleted, snapshotDraft } from './history.ts';
import { type FetchJson, getMatchupHistory, getWeekProjections } from './startSit.ts';
import { getSleeperTeams, isValidSleeperUsername, SleeperUserNotFound } from './sleeperImport.ts';
import { getMarketValues, marketSettingsFrom } from './market.ts';

export interface Ctx {
  leagues: LeagueStore;
  profiles: ProfileStore;
  history: HistoryStore;
  broadcaster: Broadcaster;
  log: Logger;
  now: () => Date;
  newId: () => string;
  playerPool: () => Player[];
  /** GETs a URL and parses the JSON body; used for Sleeper's weekly projections. */
  fetchJson: FetchJson;
  /** Signed-in user's id, or null when the request had no valid token. */
  userId: string | null;
  /** Name from the sign-in provider, used when a profile is first created. */
  displayName: string | null;
}

export interface Res {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

type Body = Record<string, unknown>;

const ok = (body?: unknown): Res => ({ status: 200, body });
const bad = (message: string): Res => ({ status: 400, body: message });
const unauthorized = (): Res => ({ status: 401 });
const forbidden = (): Res => ({ status: 403 });
const notFound = (message: string): Res => ({ status: 404, body: message });
const conflict = (message: string): Res => ({ status: 409, body: message });
const leagueNotFound = (id: string) => notFound(`League with ID '${id}' not found.`);

const str = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
const blank = (value: unknown) => str(value).trim() === '';
const int = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseInt(str(value), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

// ---- League persistence + live updates --------------------------------------

type Modify = (league: League) => Res | null | void;

interface Updated {
  league: League;
  version: number;
}

async function broadcastLeagueChange(ctx: Ctx, before: League | null, beforeVersion: number, after: League, version: number) {
  try {
    applyByesToLeague(after);
    const next = forClient(clone(after));
    const prev = before ? forClient(clone(before)) : {};
    // Sent even when empty (a sealed bid changes nothing others may see) so every browser's version keeps up.
    const ops = diffObjects(prev, next);
    await ctx.broadcaster.send(after.id, 'draftStateDiff', {
      leagueId: after.id,
      baseVersion: before ? beforeVersion : null,
      version,
      ops,
    });
  } catch (error) {
    ctx.log.warn(`Draft state broadcast failed for league ${after.id} after the league was saved.`, error);
  }
}

// A short random wait before retrying a save that clashed with someone else's, growing with each try.
// Without it, bids sent in the same instant keep re-reading and clashing in lockstep.
const conflictBackoff = (attempt: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.random() * Math.min(400, 25 * 2 ** attempt)));

/**
 * Read-modify-write with optimistic concurrency (the port of CosmosHelper.UpdateLeagueAsync).
 * With retries = 0 a conflict is reported instead of retried, for the timer callbacks every browser fires at once.
 */
async function updateLeague(
  ctx: Ctx,
  leagueId: string,
  modify: Modify,
  retries = 10,
): Promise<Updated | Res | 'conflict'> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const stored = await ctx.leagues.get(leagueId);
    if (!stored) return leagueNotFound(leagueId);

    const before = clone(stored.league);
    const league = ensureDefaults(stored.league);
    const error = modify(league);
    if (error) return error;

    const version = await ctx.leagues.replace(league, stored.version);
    if (version != null) {
      if (!isCompleted(before) && isCompleted(league)) await archiveDraft(ctx, league);
      await broadcastLeagueChange(ctx, before, stored.version, league, version);
      return { league, version };
    }
    ctx.log.warn(`Version conflict on attempt ${attempt + 1}/${retries} for league ${leagueId}.`);
    if (attempt < retries) await conflictBackoff(attempt);
  }
  return retries === 0 ? 'conflict' : { status: 409, body: 'The league was busy. Please try again.' };
}

/** Saves a finished draft to history. A failure here never undoes the save that finished the draft. */
async function archiveDraft(ctx: Ctx, league: League, onlyIfMissing = false) {
  if ((league.draftLog ?? []).length === 0) return;
  try {
    const entry = snapshotDraft(league, ctx.now());
    if (onlyIfMissing && await ctx.history.get(entry.id)) return;
    await ctx.history.save(entry);
  } catch (error) {
    ctx.log.warn(`Saving draft history failed for league ${league.id}.`, error);
  }
}

const isRes = (value: unknown): value is Res =>
  !!value && typeof value === 'object' && 'status' in (value as Res) && !('league' in (value as Res));

async function readLeague(ctx: Ctx, leagueId: string): Promise<StoredLeague | Res> {
  const stored = await ctx.leagues.get(leagueId);
  if (!stored) return leagueNotFound(leagueId);
  ensureDefaults(stored.league);
  return stored;
}

function clientLeague(ctx: Ctx, league: League, version: number) {
  applyByesToLeague(league);
  return forClient(league, version, ctx.userId ?? null);
}

// ---- Profiles (port of UserProfileStore) --------------------------------------

function normalizeProfile(profile: UserProfile): UserProfile {
  profile.userId = blank(profile.userId) ? profile.id : profile.userId;
  profile.id = blank(profile.id) ? profile.userId : profile.id;
  profile.displayName = blank(profile.displayName) ? profile.userId : profile.displayName;
  profile.defaultTeamName = blank(profile.defaultTeamName) ? `${profile.displayName}'s Team` : profile.defaultTeamName;
  profile.favoritePlayerIds = (profile.favoritePlayerIds ?? []).filter((id) => !blank(id));
  profile.playerNotes = profile.playerNotes ?? {};
  profile.playerTiers = profile.playerTiers ?? {};
  profile.budgetPlan = profile.budgetPlan ?? {};
  profile.budgetRosterSettings = profile.budgetRosterSettings ?? {};
  profile.handwriting = sanitizeHandwriting(profile.handwriting);
  return profile;
}

const newProfile = (userId: string, displayName: string): UserProfile => ({
  id: userId,
  userId,
  displayName,
  defaultTeamName: `${displayName}'s Team`,
  favoritePlayerIds: [],
  playerNotes: {},
  playerTiers: {},
  budgetPlan: {},
  budgetRosterSettings: {},
  handwriting: {},
});

async function findProfile(ctx: Ctx, userId: string): Promise<UserProfile | null> {
  if (blank(userId)) return null;
  const profile = await ctx.profiles.find(userId);
  return profile ? normalizeProfile(profile) : null;
}

const profileResponse = (profile: UserProfile) => {
  const p = normalizeProfile(profile);
  return {
    id: p.id,
    userId: p.userId,
    displayName: p.displayName,
    defaultTeamName: p.defaultTeamName,
    favoritePlayerIds: p.favoritePlayerIds,
    playerNotes: p.playerNotes,
    playerTiers: p.playerTiers,
    budgetPlan: p.budgetPlan,
    budgetRosterSettings: p.budgetRosterSettings,
    handwriting: p.handwriting,
  };
};

// ---- Leagues ---------------------------------------------------------------

async function getLeagues(ctx: Ctx): Promise<Res> {
  const leagues = await ctx.leagues.listForMember(ctx.userId!);
  return ok(leagues.map(({ league, version }) => clientLeague(ctx, ensureDefaults(league), version)));
}

async function checkLeagueName(ctx: Ctx, query: URLSearchParams): Promise<Res> {
  const leagueName = query.get('leagueName');
  if (!leagueName) return bad('Please provide a league name.');
  const existing = await ctx.leagues.findByName(leagueName);
  return ok({ isUnique: existing == null });
}

/** A fresh copy of the master player list, minus positions the league doesn't roster. */
function buildPlayerPool(ctx: Ctx, rosterSettings: RosterSettings): Player[] {
  const pool = ctx.playerPool();
  applyByesToPlayers(pool);

  const positionAllowed: Record<string, number> = {
    QB: rosterSettings.qb, RB: rosterSettings.rb, WR: rosterSettings.wr, TE: rosterSettings.te,
    K: rosterSettings.k, DST: rosterSettings.def, DEF: rosterSettings.def,
  };
  return pool.filter((player) => {
    if (!isKnownTeam(player.team)) return false;
    const limit = positionAllowed[(player.position ?? '').toUpperCase()];
    return limit === undefined ? true : limit > 0;
  });
}

async function createLeague(ctx: Ctx, data: Body): Promise<Res> {
  const adminId = ctx.userId!;
  const name = str(data.name);
  if (!name) return bad('Please provide a league name and admin ID.');

  const profile = await findProfile(ctx, adminId);
  const rosterSettings = normalizeRosterSettings(data.rosterSettings);
  const draftTimers = normalizeDraftTimers(data.draftTimers);
  const filteredPool = buildPlayerPool(ctx, rosterSettings);

  const league: League = ensureDefaults({
    id: ctx.newId(),
    name,
    adminId,
    password: str(data.password) || null,
    members: [adminId],
    teams: [{
      id: ctx.newId(),
      ownerId: adminId,
      name: getUniqueTeamName([], getPreferredTeamName(profile, adminId), profile?.displayName ?? adminId),
      budget: 200,
      roster: [],
      favoritePlayerIds: profile?.favoritePlayerIds ?? [],
    }],
    status: 'created',
    draftMode: normalizeDraftMode(data.draftMode),
    biddingMode: normalizeBiddingMode(data.biddingMode),
    readyMembers: [],
    rosterSettings,
    draftTimers,
    initialPlayerPool: filteredPool,
    currentPlayerId: null,
    activeBids: {},
    auctionTimer: null,
    draftLog: [],
    beerBitchTeamId: null,
    tieBreaker: null,
    boardReview: null,
    onlineUserIds: [],
    awayUserIds: [],
  } as League);

  await ctx.leagues.create(league);
  return ok({ id: league.id, name: league.name });
}

async function joinLeague(ctx: Ctx, data: Body): Promise<Res> {
  const userId = ctx.userId!;
  const leagueId = str(data.leagueId).trim();
  const leagueName = str(data.leagueName);
  if (!leagueId && !leagueName) return bad('User ID and league name or invite ID are required.');

  const found = leagueId ? await ctx.leagues.get(leagueId) : await ctx.leagues.findByName(leagueName);
  if (!found) return notFound('League not found.');

  const isInviteJoin = !!leagueId;
  const profile = await findProfile(ctx, userId);

  const result = await updateLeague(ctx, found.league.id, (league) => {
    if (!isInviteJoin && league.password && league.password !== str(data.password)) return unauthorized();
    if (league.members.includes(userId)) return conflict('You are already a member of this league.');
    if (isCompleted(league)) return bad('This draft is already finished. Ask the commissioner to start a new season first.');

    league.members.push(userId);
    if (isManual(league.draftMode)) return null;

    league.teams.push({
      id: ctx.newId(),
      ownerId: userId,
      name: getUniqueTeamName(league.teams, getPreferredTeamName(profile, userId), profile?.displayName ?? userId),
      budget: 200,
      roster: [],
      favoritePlayerIds: profile?.favoritePlayerIds ?? [],
    });
    return null;
  });
  if (isRes(result)) return result;
  if (result === 'conflict') return conflict('The league was busy. Please try again.');
  return ok({ id: result.league.id, name: result.league.name });
}

/** What an invite link shows before joining: enough to recognize the league, nothing private. */
async function getInvite(ctx: Ctx, leagueId: string): Promise<Res> {
  const stored = await ctx.leagues.get(leagueId);
  if (!stored) return notFound('This invite link is not valid anymore. Ask the commissioner for a new one.');
  const league = ensureDefaults(stored.league);
  const commissionerTeam = league.teams.find((team) => team?.ownerId === league.adminId);
  return ok({
    id: league.id,
    name: league.name,
    status: league.status,
    draftMode: league.draftMode,
    memberCount: league.members.length,
    commissionerTeamName: commissionerTeam?.name ?? null,
    isMember: league.members.includes(ctx.userId!),
  });
}

async function getLeagueState(ctx: Ctx, leagueId: string): Promise<Res> {
  const stored = await readLeague(ctx, leagueId);
  if (isRes(stored)) return stored;
  return ok(clientLeague(ctx, stored.league, stored.version));
}

async function deleteLeague(ctx: Ctx, leagueId: string): Promise<Res> {
  const stored = await readLeague(ctx, leagueId);
  if (isRes(stored)) return stored;
  if (stored.league.adminId !== ctx.userId) return unauthorized();
  await ctx.leagues.delete(leagueId);
  return ok();
}

async function resultsCsv(ctx: Ctx, leagueId: string): Promise<Res> {
  const stored = await readLeague(ctx, leagueId);
  if (isRes(stored)) return stored;
  const league = stored.league;
  const esc = (value: unknown) => str(value).replace(/"/g, '""');

  const lines = ['Pick Number,Player Name,Position,NFL Team,Winning Bid,Drafted By'];
  league.draftLog.forEach((pick, index) => {
    const team = league.teams.find((t) => t.id === pick.winningTeamId);
    lines.push(`${index + 1},"${esc(pick.player?.name)}",${esc(pick.player?.position)},${esc(pick.player?.team)},${pick.winningBid},"${esc(team?.name ?? 'N/A')}"`);
  });

  const filename = `${league.name}-DraftResults.csv`.replace(/["\\\r\n]/g, '');
  return {
    status: 200,
    body: lines.join('\r\n') + '\r\n',
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  };
}

// ---- Membership, presence, settings ---------------------------------------------

function applyPresence(league: League, userId: string, status: 'active' | 'away' | 'offline') {
  const remove = (list: string[]) => {
    const index = list.indexOf(userId);
    if (index >= 0) list.splice(index, 1);
  };
  if (status === 'offline') {
    remove(league.onlineUserIds);
    remove(league.awayUserIds);
    return;
  }
  if (!league.onlineUserIds.includes(userId)) league.onlineUserIds.push(userId);
  if (status === 'away') {
    if (!league.awayUserIds.includes(userId)) league.awayUserIds.push(userId);
  } else {
    remove(league.awayUserIds);
  }
}

function normalizePresence(value: unknown): 'active' | 'away' | 'offline' | null {
  switch (str(value).trim().toLowerCase()) {
    case 'active':
    case 'online':
      return 'active';
    case 'away':
    case 'hidden':
    case 'blurred':
      return 'away';
    case 'offline':
    case 'disconnect':
    case 'disconnected':
      return 'offline';
    default:
      return null;
  }
}

const done = (result: Updated | Res | 'conflict', body?: unknown | ((u: Updated) => unknown)): Res => {
  if (result === 'conflict') return conflict('The league was busy. Please try again.');
  if (isRes(result)) return result;
  return ok(typeof body === 'function' ? (body as (u: Updated) => unknown)(result) : body);
};

const leagueBody = (ctx: Ctx, u: Updated) => clientLeague(ctx, clone(u.league), u.version);

async function setPresence(ctx: Ctx, leagueId: string, status: 'active' | 'away' | 'offline', requireMember: boolean): Promise<Res> {
  const userId = ctx.userId!;
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (requireMember && !league.members.includes(userId) && !league.teams.some((t) => t?.ownerId === userId)) {
      return notFound('User is not a member of this league.');
    }
    applyPresence(league, userId, status);
    return null;
  });
  return done(result, requireMember ? { userId, status } : undefined);
}

async function presence(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const status = normalizePresence(data.status);
  if (!status) return bad('User ID and a valid status are required.');
  return setPresence(ctx, leagueId, status, true);
}

async function setReady(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const userId = ctx.userId!;
  const result = await updateLeague(ctx, leagueId, (league) => {
    league.readyMembers = league.readyMembers.filter((id) => id !== userId);
    if (data.isReady === true) league.readyMembers.push(userId);
    return null;
  });
  return done(result);
}

async function editTeamName(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const newTeamName = str(data.newTeamName);
  if (!newTeamName) return bad('User ID and a new team name are required.');
  const result = await updateLeague(ctx, leagueId, (league) => {
    const team = league.teams.find((t) => t.ownerId === ctx.userId);
    if (!team) return notFound(`Team for user '${ctx.userId}' not found in league '${leagueId}'.`);
    team.name = newTeamName;
    return null;
  });
  return done(result, { newTeamName });
}

async function updateSettings(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();

    if (!blank(data.draftMode)) {
      const nextMode = normalizeDraftMode(data.draftMode);
      if (nextMode !== league.draftMode) {
        const status = str(league.status).toLowerCase();
        if (status !== 'created' && status !== 'lobby') return bad('Draft mode can only be changed before the draft starts.');
        league.draftMode = nextMode;
      }
    }
    if (!blank(data.biddingMode)) {
      const nextStyle = normalizeBiddingMode(data.biddingMode);
      if (nextStyle !== league.biddingMode) {
        const status = str(league.status).toLowerCase();
        if (status === 'drafting' || status === 'tiebreaker' || status === BOARD_REVIEW) {
          return bad('Bidding style can only be changed between players.');
        }
        league.biddingMode = nextStyle;
      }
    }
    if (data.rosterSettings) league.rosterSettings = normalizeRosterSettings(data.rosterSettings);
    if (data.draftTimers) league.draftTimers = normalizeDraftTimers(data.draftTimers);
    return null;
  });
  return done(result, (u: Updated) => leagueBody(ctx, u));
}

async function kickMember(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const teamIdToKick = str(data.teamIdToKick);
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    const adminTeam = league.teams.find((t) => t.ownerId === league.adminId);
    if (adminTeam && teamIdToKick === adminTeam.id) return bad('Admin cannot kick themselves.');

    const team = league.teams.find((t) => t.id === teamIdToKick);
    if (!team) return notFound('Team not found.');

    for (const spot of team.roster) {
      const inPool = league.initialPlayerPool.find((p) => p.id === spot.player?.id);
      if (inPool) {
        inPool.isDrafted = false;
        inPool.price = 0;
      }
    }
    league.teams = league.teams.filter((t) => t !== team);
    league.members = league.members.filter((id) => id !== team.ownerId);
    league.readyMembers = league.readyMembers.filter((id) => id !== team.ownerId);
    ctx.log.info(`Team ${team.name} was kicked from league ${league.name}.`);
    return null;
  });
  return done(result, 'Member kicked successfully.');
}

// ---- Auction draft --------------------------------------------------------------

/** Whiteboard styles: the clock has ended, every board is revealed, and the commissioner awards the player. */
const BOARD_REVIEW = 'boardreview';

const newTimer = (ctx: Ctx, seconds: number) => ({ endTime: secondsFromNow(ctx.now(), seconds), isPaused: false, timeRemainingOnPause: 0 });

async function startDraft(ctx: Ctx, leagueId: string): Promise<Res> {
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();

    clearActiveBids(league);
    league.tieBreaker = null;

    if (isManual(league.draftMode)) {
      league.currentPlayerId = null;
      league.status = MANUAL;
      league.auctionTimer = null;
      return null;
    }

    const others = league.members.filter((id) => id !== league.adminId);
    if (others.length > 0 && !others.every((id) => league.readyMembers.includes(id))) {
      return bad('Not all other members are ready.');
    }
    startNextPlayer(league, ctx.now());
    return null;
  });
  return done(result);
}

function validateBid(league: League, userId: string, amount: number): Res | null {
  const team = league.teams.find((t) => t.ownerId === userId);
  if (!team) return notFound('Team not found.');
  const maxBid = getMaxBid(league, team);
  if (amount > maxBid) return bad(maxBidMessage(amount, maxBid));
  return null;
}

/**
 * Whiteboard styles: "Lock in board". The drawing is the bid; `amount` is only the auto-read guess (0 in the
 * manual style). Max bid is not checked here because the read may be wrong; the commissioner's award checks it.
 */
function lockInBoard(ctx: Ctx, league: League, userId: string, amount: number, board: number[][] | null): Res | null {
  if (str(league.status).toLowerCase() !== 'drafting') return bad('Boards can only be locked in while a player is up for bid.');
  if (!league.teams.some((t) => t.ownerId === userId)) return notFound('Team not found.');
  if (!board) return bad('Draw your bid on the board before locking it in.');
  const read = league.biddingMode === WHITEBOARD_AUTO ? Math.min(9999, Math.max(0, amount)) : 0;
  league.activeBids[userId] = { amount: read, timestamp: ctx.now().toISOString(), board };
  return null;
}

async function placeBid(ctx: Ctx, leagueId: string, data: Body, okBody?: unknown): Promise<Res> {
  const amount = int(data.amount);
  const parsed = parseBoard(data.board);
  if ('error' in parsed) return bad(parsed.error);
  if (amount <= 0 && !parsed.board) return bad('Bid must be at least $1.');
  const userId = ctx.userId!;
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (isWhiteboard(league.biddingMode)) return lockInBoard(ctx, league, userId, amount, parsed.board);
    if (amount <= 0) return bad('Bid must be at least $1.');
    // A bid that lands after the clock ran out (or once a rebid round began) is too late, so it can't sneak into the next round.
    if (str(league.status).toLowerCase() !== 'drafting') return bad('Bidding is closed for this player.');
    if (!timerRunning(ctx, league.auctionTimer)) return bad("Time's up for this player.");
    const error = validateBid(league, userId, amount);
    if (error) return error;
    league.activeBids[userId] = { amount, timestamp: ctx.now().toISOString() };
    return null;
  });
  // Bids are sealed from the live updates, so the bidder learns their own bid from this response.
  return done(result, okBody ?? ((u: Updated) => leagueBody(ctx, u)));
}

async function cancelBid(ctx: Ctx, leagueId: string): Promise<Res> {
  const userId = ctx.userId!;
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (userId in league.activeBids) {
      delete league.activeBids[userId];
      ctx.log.info(`User ${userId} cancelled their bid in league ${league.name}.`);
    }
    return null;
  });
  return done(result, (u: Updated) => leagueBody(ctx, u));
}

async function tieBreakerBid(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const amount = int(data.amount);
  const userId = ctx.userId!;
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (str(league.status).toLowerCase() !== 'tiebreaker') return bad('Not in a tie-breaker round.');
    if (!league.tieBreaker || !league.tieBreaker.tiedTeamIds.includes(userId)) return unauthorized();
    if (league.tieBreaker.round >= 2) return bad('This tie is locked for admin resolution.');
    if (amount <= league.tieBreaker.tieAmount) return bad(`Bid must be greater than the tie amount of $${league.tieBreaker.tieAmount}.`);
    if (!timerRunning(ctx, league.auctionTimer)) return bad("Time's up for this player.");
    const error = validateBid(league, userId, amount);
    if (error) return error;
    league.activeBids[userId] = { amount, timestamp: ctx.now().toISOString() };
    return null;
  });
  return done(result, (u: Updated) => leagueBody(ctx, u));
}

function pauseForAdminTieResolution(ctx: Ctx, league: League) {
  league.auctionTimer = { endTime: ctx.now().toISOString(), isPaused: true, timeRemainingOnPause: 0 };
}

function addDefaultTieBreakerBids(ctx: Ctx, league: League): Res | null {
  const tie = league.tieBreaker;
  if (!tie || tie.tiedTeamIds.length === 0) return bad('Tie-breaker state is missing tied teams.');
  if (tie.round >= 2) return null;

  const requiredBid = tie.tieAmount + 1;
  for (const tiedUserId of [...new Set(tie.tiedTeamIds)]) {
    if (tiedUserId in league.activeBids) continue;
    const team = league.teams.find((t) => t.ownerId === tiedUserId);
    if (!team) {
      ctx.log.warn(`Unable to find tied team for user ${tiedUserId} while adding default tie-breaker bid.`);
      continue;
    }
    if (requiredBid > getMaxBid(league, team)) continue;
    league.activeBids[tiedUserId] = { amount: requiredBid, timestamp: ctx.now().toISOString() };
  }
  return null;
}

function moveCappedTieToAdminResolution(ctx: Ctx, league: League): Res | null {
  const tie = league.tieBreaker;
  if (!tie || tie.tiedTeamIds.length === 0) return bad('Tie-breaker state is missing tied teams.');
  const tiedTeams = [...new Set(tie.tiedTeamIds)]
    .map((userId) => league.teams.find((t) => t.ownerId === userId))
    .filter((t): t is Team => !!t);
  if (tiedTeams.length === 0) return bad('No tied teams were found.');

  league.status = 'tiebreaker';
  tie.round = 2;
  clearActiveBids(league);
  pauseForAdminTieResolution(ctx, league);
  return null;
}

/** Whiteboard styles: the clock ended, so reveal every board and wait for the commissioner. No tie-breaker round. */
function openBoardReview(ctx: Ctx, league: League) {
  const bids = league.activeBids;
  let topRead: { userIds: string[]; amount: number } | null = null;
  if (league.biddingMode === WHITEBOARD_AUTO) {
    const reads = Object.entries(bids).filter(([, bid]) => (bid?.amount ?? 0) > 0);
    if (reads.length > 0) {
      const high = Math.max(...reads.map(([, bid]) => bid.amount));
      topRead = { userIds: reads.filter(([, bid]) => bid.amount === high).map(([id]) => id), amount: high };
    }
  }
  league.activeBids = {};
  league.tieBreaker = null;
  league.status = BOARD_REVIEW;
  league.boardReview = { playerId: league.currentPlayerId, bids, topRead };
  // Paused at zero: no countdown, and the commissioner's paused-only tools (nominate, members) stay usable.
  pauseForAdminTieResolution(ctx, league);
}

const timerRunning = (ctx: Ctx, timer: League['auctionTimer']) =>
  !!timer && (timer.isPaused || new Date(timer.endTime).getTime() > ctx.now().getTime());

async function endBidding(ctx: Ctx, leagueId: string): Promise<Res> {
  // Every browser calls this when its clock hits zero, so check the cheap fields first.
  const light = await ctx.leagues.getLight(leagueId);
  if (!light) return leagueNotFound(leagueId);
  const lightStatus = str(light.status).toLowerCase();
  if ((lightStatus !== 'drafting' && lightStatus !== 'tiebreaker') || !light.auctionTimer) return ok('No active auction to close.');
  if (timerRunning(ctx, light.auctionTimer)) return ok('Auction timer is still active.');

  const result = await updateLeague(ctx, leagueId, (league) => {
    const status = str(league.status).toLowerCase();
    if ((status !== 'drafting' && status !== 'tiebreaker') || !league.auctionTimer) return ok('No active auction to close.');
    if (timerRunning(ctx, league.auctionTimer)) return ok('Auction timer is still active.');

    const player = league.initialPlayerPool.find((p) => p.id === league.currentPlayerId);
    if (!player) return bad('Current player was not found.');

    if (status === 'drafting' && isWhiteboard(league.biddingMode)) {
      openBoardReview(ctx, league);
      return null;
    }

    if (status === 'tiebreaker') {
      const error = addDefaultTieBreakerBids(ctx, league);
      if (error) return error;
    }

    const bids = Object.entries(league.activeBids) as [string, Bid][];
    if (bids.length > 0) {
      const high = Math.max(...bids.map(([, bid]) => bid.amount));
      const winners = bids.filter(([, bid]) => bid.amount === high);
      if (winners.length === 1) {
        const [winnerId, winningBid] = winners[0];
        const team = league.teams.find((t) => t.ownerId === winnerId);
        if (!team) return bad('Winning team was not found.');
        awardPlayerToTeam(league, player, team, winningBid.amount, ctx.now());
      } else {
        const previousRound = status === 'tiebreaker' ? (league.tieBreaker?.round ?? 1) : 0;
        league.status = 'tiebreaker';
        league.tieBreaker = { tiedTeamIds: winners.map(([id]) => id), tieAmount: high, round: previousRound >= 1 ? 2 : 1 };
        clearActiveBids(league);
        if (league.tieBreaker.round === 2) {
          pauseForAdminTieResolution(ctx, league);
        } else {
          league.auctionTimer = newTimer(ctx, league.draftTimers.rebidTimer);
        }
      }
    } else if (status === 'tiebreaker') {
      const error = moveCappedTieToAdminResolution(ctx, league);
      if (error) return error;
    } else {
      league.status = 'intermission';
      league.currentPlayerId = null;
      league.tieBreaker = null;
      league.auctionTimer = newTimer(ctx, league.draftTimers.intermissionTimer);
    }
    return null;
  }, 0);

  if (result === 'conflict') return ok('Auction already closed.');
  return done(result, 'Auction closed.');
}

async function nextRound(ctx: Ctx, leagueId: string): Promise<Res> {
  const light = await ctx.leagues.getLight(leagueId);
  if (!light) return leagueNotFound(leagueId);
  if (str(light.status).toLowerCase() !== 'intermission' || !light.auctionTimer) return ok('No intermission to advance.');
  if (timerRunning(ctx, light.auctionTimer)) return ok('Intermission timer is still active.');

  const result = await updateLeague(ctx, leagueId, (league) => {
    if (str(league.status).toLowerCase() !== 'intermission' || !league.auctionTimer) return ok('No intermission to advance.');
    if (timerRunning(ctx, league.auctionTimer)) return ok('Intermission timer is still active.');
    startNextPlayer(league, ctx.now());
    return null;
  }, 0);

  if (result === 'conflict') return ok('Next round already handled.');
  return done(result, 'Next round started.');
}

async function skipIntermission(ctx: Ctx, leagueId: string): Promise<Res> {
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    if (str(league.status).toLowerCase() !== 'intermission') return bad('Can only skip during intermission.');
    startNextPlayer(league, ctx.now());
    return null;
  });
  return done(result, 'Intermission skipped.');
}

async function pauseDraft(ctx: Ctx, leagueId: string): Promise<Res> {
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    const timer = league.auctionTimer;
    if (!timer) return bad('There is no active draft timer to pause.');

    timer.isPaused = !timer.isPaused;
    if (timer.isPaused) {
      const remaining = (new Date(timer.endTime).getTime() - ctx.now().getTime()) / 1000;
      timer.timeRemainingOnPause = Math.trunc(Math.max(0, remaining));
    } else {
      timer.endTime = secondsFromNow(ctx.now(), timer.timeRemainingOnPause);
      timer.timeRemainingOnPause = 0;
    }
    return null;
  });
  return done(result, (u: Updated) => u.league.auctionTimer);
}

async function nominatePlayer(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const playerId = str(data.playerId);
  if (!playerId) return bad('Admin ID and player ID are required.');
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    if (!league.auctionTimer || !league.auctionTimer.isPaused) return bad('Draft must be paused to nominate a player.');
    const player = league.initialPlayerPool.find((p) => p.id === playerId);
    if (!player || player.isDrafted) return bad('Player is not available to be nominated.');

    league.status = 'drafting';
    league.currentPlayerId = player.id;
    clearActiveBids(league);
    league.tieBreaker = null;
    league.auctionTimer = newTimer(ctx, league.draftTimers.bidTimer);
    return null;
  });
  return done(result, 'Player nominated successfully.');
}

async function skipPlayer(ctx: Ctx, leagueId: string): Promise<Res> {
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    startNextPlayer(league, ctx.now(), league.currentPlayerId);
    return null;
  });
  return done(result, 'Player skipped successfully.');
}

async function resolveTie(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const winningTeamId = str(data.winningTeamId);
  if (!winningTeamId) return bad('Admin ID and winning team ID are required.');
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    const tie = league.tieBreaker;
    if (str(league.status).toLowerCase() !== 'tiebreaker' || tie?.round !== 2) {
      return bad('Can only resolve a final tie after the rebid round also tied.');
    }

    const winningTeam = league.teams.find((t) => t.id === winningTeamId);
    const player = league.initialPlayerPool.find((p) => p.id === league.currentPlayerId);
    if (!winningTeam) return notFound('Winning team not found.');
    if (!player) return notFound('Current player not found.');

    const tiedIds = tie.tiedTeamIds ?? [];
    if (!tiedIds.includes(winningTeam.ownerId) && !tiedIds.includes(winningTeam.id)) return bad('Winner must be one of the tied teams.');
    if (tie.tieAmount <= 0) return bad('Final tie amount is invalid.');

    const stamp = ctx.now().toISOString();
    for (const tiedId of [...new Set(tiedIds)]) {
      const tiedTeam = league.teams.find((t) => t.ownerId === tiedId || t.id === tiedId);
      if (!tiedTeam || blank(tiedTeam.ownerId)) continue;
      if (!(tiedTeam.ownerId in league.activeBids)) {
        league.activeBids[tiedTeam.ownerId] = { amount: tie.tieAmount, timestamp: stamp };
      }
    }
    league.activeBids[winningTeam.ownerId] = { amount: tie.tieAmount, timestamp: stamp };

    ctx.log.info(`Admin resolved tie, awarding ${player.name} to ${winningTeam.name}.`);
    awardPlayerToTeam(league, player, winningTeam, tie.tieAmount, ctx.now());
    return null;
  });
  return done(result, 'Tie resolved.');
}

/** Whiteboard styles: the commissioner reads the revealed boards and awards the player. */
async function awardBoard(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const winningTeamId = str(data.winningTeamId);
  const amount = int(data.amount);
  if (!winningTeamId) return bad('Choose the winning team.');
  if (amount < 1) return bad('Bid must be at least $1.');

  // Set inside the update (which can retry), used once the award has been saved.
  let learn = null as { userId: string; board: number[][] } | null;
  const result = await updateLeague(ctx, leagueId, (league) => {
    learn = null;
    if (league.adminId !== ctx.userId) return unauthorized();
    const review = league.boardReview;
    if (str(league.status).toLowerCase() !== BOARD_REVIEW || !review) return bad('There are no boards waiting to be awarded.');

    const team = league.teams.find((t) => t?.id === winningTeamId);
    if (!team) return notFound('Winning team not found.');
    const player = league.initialPlayerPool.find((p) => p.id === league.currentPlayerId);
    if (!player) return notFound('Current player not found.');
    const winnerBid = review.bids[team.ownerId];
    if (!winnerBid) return bad('The winner must be a team that locked in a board.');

    if (getOpenRosterSpots(league, team) <= 0) return bad(`${team.name} already has a full roster.`);
    const maxBid = getMaxBid(league, team);
    if (amount > maxBid) {
      return bad(`${team.name} can spend up to $${Math.max(0, maxBid)} and still keep $1 for each remaining roster spot.`);
    }

    // The pick keeps this round's boards; the winner's amount is what the commissioner entered.
    league.activeBids = { ...review.bids, [team.ownerId]: { ...winnerBid, amount } };
    ctx.log.info(`Admin awarded ${player.name} to ${team.name} for $${amount} from the whiteboards.`);
    awardPlayerToTeam(league, player, team, amount, ctx.now());
    if (league.biddingMode === WHITEBOARD_AUTO && Array.isArray(winnerBid.board)) {
      learn = { userId: team.ownerId, board: winnerBid.board };
    }
    return null;
  });
  const response = done(result, (u: Updated) => leagueBody(ctx, u));
  if (response.status === 200 && learn) await learnHandwriting(ctx, learn, amount);
  return response;
}

/**
 * Auto-read leagues: the awarded board is now public and its amount confirmed by the commissioner, so
 * it becomes labelled handwriting for the winner (only boards revealed in the review ever get here).
 * Best effort: a failure is logged and never undoes the award.
 */
async function learnHandwriting(ctx: Ctx, { userId, board }: { userId: string; board: number[][] }, amount: number) {
  try {
    const profile = await findProfile(ctx, userId);
    if (!profile) return;
    const handwriting = learnFromBoard(profile.handwriting, board, amount);
    if (!handwriting) return;
    profile.handwriting = handwriting;
    await ctx.profiles.upsert(normalizeProfile(profile));
  } catch (error) {
    ctx.log.warn(`Could not save handwriting examples for user ${userId}.`, error);
  }
}

async function undoLastPick(ctx: Ctx, leagueId: string): Promise<Res> {
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    const status = str(league.status).toLowerCase();
    if (status !== 'intermission' && status !== MANUAL) return bad('Can only undo a pick during intermission or manual draft mode.');

    const lastPick = league.draftLog[league.draftLog.length - 1];
    if (!lastPick) return bad('There are no picks to undo.');
    const playerId = lastPick.player?.id;
    if (blank(playerId)) return bad('The last pick is missing player data and cannot be undone safely.');

    const team = league.teams.find((t) => t?.id === lastPick.winningTeamId);
    if (!team) return notFound('Winning team not found.');

    let inPool = league.initialPlayerPool.find((p) => p?.id === playerId);
    if (!inPool) {
      inPool = { ...lastPick.player };
      league.initialPlayerPool.push(inPool);
    }

    team.budget += lastPick.winningBid;
    team.roster = team.roster.filter((spot) => spot?.player?.id !== playerId);
    inPool.isDrafted = false;
    inPool.price = 0;

    league.draftLog.pop();
    clearActiveBids(league);
    league.tieBreaker = null;
    league.currentPlayerId = null;
    if (isManual(league.draftMode)) {
      league.status = MANUAL;
      league.auctionTimer = null;
    }
    ctx.log.info(`Admin undid the last pick: ${inPool.name} from ${team.name} for league ${league.name}.`);
    return null;
  });
  return done(result, 'Last pick has been undone.');
}

async function completeDraft(ctx: Ctx, leagueId: string): Promise<Res> {
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    league.status = 'completed';
    league.currentPlayerId = null;
    clearActiveBids(league);
    league.auctionTimer = null;
    league.tieBreaker = null;
    return null;
  });
  return done(result, (u: Updated) => leagueBody(ctx, u));
}

// ---- Draft history and new seasons ----------------------------------------------------

async function listHistory(ctx: Ctx): Promise<Res> {
  const userId = ctx.userId!;
  const entries = await ctx.history.listForMember(userId);
  const saved = new Set(entries.map((entry) => entry.id));

  // Drafts that finished before history existed get saved the first time anyone looks.
  const leagues = await ctx.leagues.listForMember(userId);
  for (const { league } of leagues) {
    ensureDefaults(league);
    if (!isCompleted(league) || league.draftLog.length === 0) continue;
    const entry = snapshotDraft(league, ctx.now());
    if (saved.has(entry.id)) continue;
    try {
      await ctx.history.save(entry);
      entries.push(entry);
    } catch (error) {
      ctx.log.warn(`Saving draft history failed for league ${league.id}.`, error);
    }
  }

  entries.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return ok(entries.map((entry) => historySummary(entry, userId)));
}

async function getHistoryEntry(ctx: Ctx, historyId: string): Promise<Res> {
  const entry = await ctx.history.get(historyId);
  if (!entry || !entry.members.includes(ctx.userId!)) return notFound('That draft was not found.');
  return ok(entry);
}

/** Commissioner only: saves the finished draft to history and resets the league for next year's draft. */
async function startNewSeason(ctx: Ctx, leagueId: string): Promise<Res> {
  const finished: { league: League | null } = { league: null };
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    if (!isCompleted(league)) return bad('Finish the current draft before starting a new season.');
    finished.league = clone(league);

    league.draftNumber = draftNumberOf(league) + 1;
    league.status = 'created';
    league.readyMembers = [];
    league.initialPlayerPool = buildPlayerPool(ctx, league.rosterSettings);
    league.currentPlayerId = null;
    league.activeBids = {};
    league.auctionTimer = null;
    league.draftLog = [];
    league.beerBitchTeamId = null;
    league.tieBreaker = null;
    league.boardReview = null;
    for (const team of league.teams) {
      if (!team) continue;
      team.budget = 200;
      team.roster = [];
    }
    return null;
  });
  if (!isRes(result) && result !== 'conflict' && finished.league) await archiveDraft(ctx, finished.league, true);
  return done(result, (u: Updated) => leagueBody(ctx, u));
}

// ---- Start/Sit -------------------------------------------------------------------

async function startSit(ctx: Ctx, query: URLSearchParams): Promise<Res> {
  const week = int(query.get('week'));
  try {
    return ok(await getWeekProjections(ctx.fetchJson, ctx.now(), week || null));
  } catch (error) {
    ctx.log.warn('Loading Sleeper projections failed.', error);
    return { status: 502, body: 'Weekly projections are not available right now. Please try again in a few minutes.' };
  }
}

async function startSitSleeper(ctx: Ctx, query: URLSearchParams): Promise<Res> {
  const username = str(query.get('username')).trim();
  if (!isValidSleeperUsername(username)) return bad('Please enter your Sleeper username.');
  try {
    return ok(await getSleeperTeams(ctx.fetchJson, ctx.now(), username, ctx.playerPool()));
  } catch (error) {
    if (error instanceof SleeperUserNotFound) return notFound(`No Sleeper account is named '${username}'.`);
    ctx.log.warn(`Loading Sleeper teams failed for ${username}.`, error);
    return { status: 502, body: 'Sleeper is not answering right now. Please try again in a few minutes.' };
  }
}

async function startSitMatchup(ctx: Ctx, playerId: string, query: URLSearchParams): Promise<Res> {
  const opponent = str(query.get('opponent')).trim();
  if (!/^[A-Za-z]{2,4}$/.test(opponent)) return bad('Please provide the opponent team, like KC.');
  if (!/^sleeper-[A-Za-z0-9]+$/.test(playerId)) return bad('Unknown player.');
  try {
    return ok(await getMatchupHistory(ctx.fetchJson, ctx.now(), playerId, opponent));
  } catch (error) {
    ctx.log.warn(`Loading matchup history failed for ${playerId}.`, error);
    return { status: 502, body: 'Past matchups are not available right now. Please try again in a few minutes.' };
  }
}

async function startSitMarket(ctx: Ctx, query: URLSearchParams): Promise<Res> {
  const settings = marketSettingsFrom(query);
  try {
    return ok(await getMarketValues(ctx.fetchJson, ctx.now(), settings));
  } catch (error) {
    ctx.log.warn('Loading FantasyCalc market values failed.', error);
    return { status: 502, body: 'Trade market values are not available right now.' };
  }
}

// ---- Manual draft ----------------------------------------------------------------

async function manualSelectPlayer(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const playerId = str(data.playerId);
  if (!playerId) return bad('Player ID is required.');
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    if (!isManual(league.draftMode) || str(league.status).toLowerCase() !== MANUAL) {
      return bad('Manual player selection is only available during a manual draft.');
    }
    const player = league.initialPlayerPool.find((p) => p?.id === playerId);
    if (!player || player.isDrafted) return bad('Player is not available.');

    league.currentPlayerId = player.id;
    clearActiveBids(league);
    league.tieBreaker = null;
    league.auctionTimer = null;
    return null;
  });
  return done(result, (u: Updated) => leagueBody(ctx, u));
}

async function manualAward(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const playerId = str(data.playerId);
  const teamId = str(data.teamId);
  const amount = int(data.amount);
  if (!playerId) return bad('Player ID is required.');
  if (!teamId) return bad('Team ID is required.');
  if (amount < 1) return bad('Manual draft prices must be at least $1.');

  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    if (!isManual(league.draftMode) || str(league.status).toLowerCase() !== MANUAL) {
      return bad('Manual awards are only available after starting a manual draft.');
    }
    const team = league.teams.find((t) => t?.id === teamId);
    if (!team) return notFound('Team not found.');

    const player = league.initialPlayerPool.find((p) => p?.id === playerId);
    if (!player) return notFound("Player not found in this league's draft pool.");
    if (player.isDrafted) return bad(`${player.name} has already been drafted.`);

    const rosterTotal = getRosterSpotTotal(league.rosterSettings);
    if (rosterTotal > 0 && team.roster.length >= rosterTotal) return bad(`${team.name} already has a full roster.`);
    const remaining = rosterTotal > 0 ? rosterTotal - team.roster.length : 1;
    const maxBid = team.budget - Math.max(0, remaining - 1);
    if (amount > maxBid) {
      return bad(`${team.name} can spend up to $${Math.max(0, maxBid)} and still keep $1 for each remaining roster spot.`);
    }

    awardPlayerToTeam(league, player, team, amount, ctx.now(), MANUAL, false);
    return null;
  });
  return done(result, (u: Updated) => leagueBody(ctx, u));
}

async function addManualTeam(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    if (!isManual(league.draftMode)) return bad('Manual teams can only be added to manual drafts.');
    if (str(league.status).toLowerCase() === 'completed') return bad('Cannot add a team after the draft is completed.');

    const baseName = blank(data.teamName) ? `Team ${league.teams.length + 1}` : str(data.teamName).trim();
    const budget = int(data.budget) > 0 ? int(data.budget) : 200;
    league.teams.push({
      id: ctx.newId(),
      ownerId: `manual-${ctx.newId()}`,
      name: getUniqueTeamName(league.teams, baseName, baseName),
      budget,
      roster: [],
      favoritePlayerIds: [],
    });
    return null;
  });
  return done(result, (u: Updated) => leagueBody(ctx, u));
}

async function assignManualTeamOwner(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const teamId = str(data.teamId);
  const targetUserId = str(data.userId);
  if (!teamId || !targetUserId) return bad('Admin ID, team ID, and user ID are required.');

  const profile = await findProfile(ctx, targetUserId);
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    if (!isManual(league.draftMode)) return bad('Manual team assignment is only available for manual drafts.');
    if (!league.members.includes(targetUserId)) return bad('That user has not joined this league yet.');

    const target = league.teams.find((t) => t?.id === teamId);
    if (!target) return notFound('Team not found.');

    for (const team of league.teams) {
      if (team?.ownerId === targetUserId) team.ownerId = `manual-${ctx.newId()}`;
    }
    target.ownerId = targetUserId;
    target.favoritePlayerIds = profile?.favoritePlayerIds ?? [];
    return null;
  });
  return done(result, (u: Updated) => leagueBody(ctx, u));
}

// ---- Commissioner tools, beer, chat -------------------------------------------------

async function adjustBudget(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const teamId = str(data.teamId);
  const newBudget = int(data.newBudget);
  if (!teamId) return bad('Admin ID and team ID are required.');
  if (newBudget < 0) return bad('Budget cannot be negative.');

  let oldBudget = 0;
  let teamName = '';
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    const team = league.teams.find((t) => t?.id === teamId);
    if (!team) return notFound('Team not found.');
    oldBudget = team.budget;
    teamName = team.name;
    team.budget = newBudget;
    return null;
  });
  if (isRes(result) || result === 'conflict') return done(result);

  if (oldBudget !== newBudget) {
    try {
      await ctx.broadcaster.send(leagueId, 'budgetAdjustmentNotice', {
        leagueId, adminId: ctx.userId, teamId, teamName, oldBudget, newBudget, sentAt: ctx.now().toISOString(),
      });
    } catch (error) {
      ctx.log.warn(`Budget adjustment notice failed for league ${leagueId}.`, error);
    }
  }
  return ok('Budget adjusted successfully.');
}

async function assignBeerDuty(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const teamId = str(data.teamId);
  if (!teamId) return bad('Admin ID and team ID are required.');
  const result = await updateLeague(ctx, leagueId, (league) => {
    if (league.adminId !== ctx.userId) return unauthorized();
    const team = league.teams.find((t) => t?.id === teamId);
    if (!team) return notFound('Team not found.');
    league.beerBitchTeamId = team.id;
    return null;
  });
  return done(result, 'Beer duty assigned successfully.');
}

async function requestBeer(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const requestingTeamId = str(data.requestingTeamId);
  if (!requestingTeamId) return bad('Requesting team ID is required.');
  const stored = await readLeague(ctx, leagueId);
  if (isRes(stored)) return stored;
  const league = stored.league;

  if (!league.beerBitchTeamId) return bad('No team is currently on beer duty.');
  const requestingTeam = league.teams.find((t) => t?.id === requestingTeamId);
  if (!requestingTeam) return notFound('Requesting team not found.');
  const dutyTeam = league.teams.find((t) => t?.id === league.beerBitchTeamId);
  if (!dutyTeam || blank(dutyTeam.ownerId)) return notFound('Beer duty team not found.');

  await ctx.broadcaster.send(leagueId, 'beerRequestReceived', requestingTeam.name, dutyTeam.ownerId);
  return ok('Beer request sent.');
}

async function sendChat(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  const message = str(data.message).trim();
  if (!message) return bad('User ID and message are required.');
  if (message.length > 240) return bad('Messages must be 240 characters or fewer.');

  const stored = await readLeague(ctx, leagueId);
  if (isRes(stored)) return stored;
  const league = stored.league;

  const senderTeam = league.teams.find((t) => t?.ownerId === ctx.userId);
  let teamName = senderTeam?.name;
  if (blank(teamName)) {
    teamName = !blank(data.displayName) ? str(data.displayName).trim() : (ctx.displayName || 'Spectator');
  }

  const chatMessage = {
    leagueId: league.id,
    userId: ctx.userId,
    teamId: senderTeam?.id ?? null,
    teamName,
    message,
    sentAt: ctx.now().toISOString(),
  };
  await ctx.broadcaster.send(leagueId, 'draftChatMessage', chatMessage);
  return ok(chatMessage);
}

async function budgetReview(ctx: Ctx, leagueId: string): Promise<Res> {
  const stored = await readLeague(ctx, leagueId);
  if (isRes(stored)) return stored;
  const league = stored.league;
  if (league.adminId !== ctx.userId) return unauthorized();

  const adminTeam = league.teams.find((t) => t?.ownerId === ctx.userId);
  await ctx.broadcaster.send(leagueId, 'budgetReviewNotice', {
    leagueId,
    adminId: ctx.userId,
    adminTeamName: adminTeam?.name ?? 'Commissioner',
    sentAt: ctx.now().toISOString(),
  });
  return ok('Budget review notice sent.');
}

const cleanIds = (ids: unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const value = str(id).trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
};

async function updateFavorites(ctx: Ctx, leagueId: string, data: Body): Promise<Res> {
  if (!Array.isArray(data.playerIds)) return bad('User ID and a list of player IDs are required.');
  const userId = ctx.userId!;
  const favoriteIds = cleanIds(data.playerIds);

  const stored = await readLeague(ctx, leagueId);
  if (isRes(stored)) return stored;
  const hasTeam = stored.league.teams.some((t) => t?.ownerId === userId);
  if (!hasTeam && !stored.league.members.includes(userId)) {
    return notFound(`Team for user '${userId}' not found in league '${leagueId}'.`);
  }

  const profile = (await findProfile(ctx, userId)) ?? newProfile(userId, ctx.displayName || userId);
  profile.favoritePlayerIds = favoriteIds;
  await ctx.profiles.upsert(normalizeProfile(profile));

  let leagueTeamSynced = false;
  if (hasTeam) {
    const result = await updateLeague(ctx, leagueId, (league) => {
      const team = league.teams.find((t) => t?.ownerId === userId);
      if (team) team.favoritePlayerIds = [...favoriteIds];
      return null;
    });
    leagueTeamSynced = !isRes(result) && result !== 'conflict';
  }

  return ok({ message: 'Favorite players updated successfully.', favoritePlayerIds: favoriteIds, leagueTeamSynced });
}

// ---- Profiles ----------------------------------------------------------------------

function displayNameFrom(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    for (const key of ['displayName', 'name', 'userDetails']) {
      if (typeof v[key] === 'string' && (v[key] as string).trim()) return v[key] as string;
    }
  }
  return fallback;
}

async function getOrCreateProfile(ctx: Ctx, data: Body): Promise<Res> {
  const userId = ctx.userId!;
  let profile = await findProfile(ctx, userId);
  if (!profile) {
    profile = newProfile(userId, displayNameFrom(data.displayName, ctx.displayName || userId));
    await ctx.profiles.upsert(profile);
  }
  return ok(profileResponse(profile));
}

const BUDGET_ROSTER_KEYS: Record<string, string> = {
  qb: 'qb', rb: 'rb', wr: 'wr', te: 'te', flex: 'flex', superflex: 'superFlex', k: 'k', def: 'def', dst: 'def', bench: 'bench',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

async function updateProfile(ctx: Ctx, pathUserId: string, data: Body): Promise<Res> {
  if (pathUserId !== ctx.userId) return forbidden();

  const fields = ['displayName', 'defaultTeamName', 'favoritePlayerIds', 'playerNotes', 'playerTiers', 'budgetPlan', 'budgetRosterSettings'];
  if (!fields.some((field) => data[field] != null)) return bad('At least one profile field is required.');

  const profile = await findProfile(ctx, pathUserId);
  if (!profile) return notFound(`User profile for '${pathUserId}' not found.`);

  if (data.displayName != null) {
    if (blank(data.displayName)) return bad('Display name cannot be empty.');
    profile.displayName = str(data.displayName).trim();
  }
  if (data.defaultTeamName != null) {
    if (blank(data.defaultTeamName)) return bad('Default team name cannot be empty.');
    profile.defaultTeamName = str(data.defaultTeamName).trim();
  }
  if (Array.isArray(data.favoritePlayerIds)) profile.favoritePlayerIds = cleanIds(data.favoritePlayerIds);

  const entries = (value: unknown) => (value && typeof value === 'object' ? Object.entries(value as Record<string, unknown>) : []);

  if (data.playerNotes != null) {
    const notes: Record<string, string> = {};
    for (const [key, value] of entries(data.playerNotes)) {
      if (blank(key) || blank(value)) continue;
      notes[key.trim()] = str(value).trim().slice(0, 1000);
    }
    profile.playerNotes = notes;
  }
  if (data.playerTiers != null) {
    const tiers: Record<string, number> = {};
    for (const [key, value] of entries(data.playerTiers)) {
      const tier = int(value);
      if (blank(key) || tier < 1 || tier > 5) continue;
      tiers[key.trim()] = tier;
    }
    profile.playerTiers = tiers;
  }
  if (data.budgetPlan != null) {
    const plan: Record<string, number> = {};
    for (const [key, value] of entries(data.budgetPlan)) {
      if (blank(key)) continue;
      plan[key.trim().toUpperCase()] = clamp(int(value), 0, 200);
    }
    profile.budgetPlan = plan;
  }
  if (data.budgetRosterSettings != null) {
    const settings: Record<string, number> = {};
    for (const [key, value] of entries(data.budgetRosterSettings)) {
      const canonical = BUDGET_ROSTER_KEYS[key.trim().toLowerCase()];
      if (canonical) settings[canonical] = clamp(int(value), 0, 30);
    }
    profile.budgetRosterSettings = settings;
  }

  await ctx.profiles.upsert(normalizeProfile(profile));

  if (Array.isArray(data.favoritePlayerIds)) {
    const favoriteIds = profile.favoritePlayerIds;
    for (const { league } of await ctx.leagues.listForMember(pathUserId)) {
      try {
        await updateLeague(ctx, league.id, (current) => {
          for (const team of current.teams) {
            if (team?.ownerId === pathUserId) team.favoritePlayerIds = [...favoriteIds];
          }
          return null;
        });
      } catch (error) {
        ctx.log.warn(`Profile favorites were saved, but league ${league.id} could not be synced for user ${pathUserId}.`, error);
      }
    }
  }

  return ok(profileResponse(profile));
}

// ---- Router -----------------------------------------------------------------------

type LeagueAction = (ctx: Ctx, leagueId: string, data: Body) => Promise<Res>;

const LEAGUE_POSTS: Record<string, LeagueAction> = {
  connect: (ctx, id) => setPresence(ctx, id, 'active', false),
  disconnect: (ctx, id) => setPresence(ctx, id, 'offline', false),
  presence,
  ready: setReady,
  teams: editTeamName,
  settings: updateSettings,
  kick: kickMember,
  startDraft: (ctx, id) => startDraft(ctx, id),
  bid: (ctx, id, data) => placeBid(ctx, id, data),
  'submit-final-bid': (ctx, id, data) => placeBid(ctx, id, data),
  'cancel-bid': (ctx, id) => cancelBid(ctx, id),
  'tiebreaker-bid': tieBreakerBid,
  endBidding: (ctx, id) => endBidding(ctx, id),
  nextRound: (ctx, id) => nextRound(ctx, id),
  'skip-intermission': (ctx, id) => skipIntermission(ctx, id),
  pause: (ctx, id) => pauseDraft(ctx, id),
  nominate: nominatePlayer,
  skip: (ctx, id) => skipPlayer(ctx, id),
  'resolve-tie': resolveTie,
  'board-award': awardBoard,
  'undo-pick': (ctx, id) => undoLastPick(ctx, id),
  complete: (ctx, id) => completeDraft(ctx, id),
  'new-season': (ctx, id) => startNewSeason(ctx, id),
  'manual-current-player': manualSelectPlayer,
  'manual-award': manualAward,
  'manual-teams': addManualTeam,
  'manual-teams/assign': assignManualTeamOwner,
  'adjust-budget': adjustBudget,
  'beer-bitch': assignBeerDuty,
  'request-beer': requestBeer,
  chat: sendChat,
  'budget-review': (ctx, id) => budgetReview(ctx, id),
  favorites: updateFavorites,
};

/**
 * Dispatches one API call. `path` is the part after `/api/`, e.g. `leagues/abc/bid`.
 */
export async function handle(ctx: Ctx, method: string, path: string, query: URLSearchParams, body: unknown): Promise<Res> {
  const data: Body = body && typeof body === 'object' && !Array.isArray(body) ? (body as Body) : {};
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  method = method.toUpperCase();

  // Endpoints that work without signing in.
  if (method === 'GET' && parts.length === 1 && parts[0].toLowerCase() === 'health') {
    // Touches the database so the scheduled keep-alive counts as activity on the free plan.
    await ctx.leagues.getLight('keep-alive');
    return ok({ status: 'ok' });
  }
  if (method === 'GET' && parts.length === 3 && parts[0] === 'leagues' && parts[2] === 'results.csv') return resultsCsv(ctx, parts[1]);

  if (!ctx.userId) return unauthorized();

  if (parts.length === 1) {
    const name = parts[0].toLowerCase();
    if (method === 'GET' && name === 'getleagues') return getLeagues(ctx);
    if (method === 'GET' && name === 'checkleaguename') return checkLeagueName(ctx, query);
    if (method === 'POST' && name === 'createleague') return createLeague(ctx, data);
    if (method === 'POST' && name === 'joinleague') return joinLeague(ctx, data);
    if (method === 'POST' && name === 'user-profile') return getOrCreateProfile(ctx, data);
    if (method === 'GET' && name === 'history') return listHistory(ctx);
    if (method === 'GET' && name === 'startsit') return startSit(ctx, query);
  }

  if (parts.length === 2 && method === 'GET' && parts[0] === 'history') return getHistoryEntry(ctx, parts[1]);
  if (parts.length === 2 && method === 'GET' && parts[0] === 'invite') return getInvite(ctx, parts[1]);
  if (parts.length === 2 && method === 'GET' && parts[0] === 'startsit' && parts[1] === 'sleeper') return startSitSleeper(ctx, query);
  if (parts.length === 2 && method === 'GET' && parts[0] === 'startsit' && parts[1] === 'market') return startSitMarket(ctx, query);
  if (parts.length === 3 && method === 'GET' && parts[0] === 'startsit' && parts[1] === 'matchup') return startSitMatchup(ctx, parts[2], query);

  if (parts.length === 2 && parts[0] === 'user-profile' && method === 'POST') return updateProfile(ctx, parts[1], data);

  if (parts[0] === 'leagues' && parts.length >= 2) {
    const leagueId = parts[1];
    const action = parts.slice(2).join('/');
    if (method === 'DELETE' && action === '') return deleteLeague(ctx, leagueId);
    if (method === 'GET' && (action === 'state' || action === 'details')) return getLeagueState(ctx, leagueId);
    if (method === 'POST' && LEAGUE_POSTS[action]) return LEAGUE_POSTS[action](ctx, leagueId, data);
  }

  return notFound('Not found.');
}
