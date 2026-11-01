// Draft history: a saved copy of each finished draft, so past drafts stay viewable
// after a league resets for a new season.

import type { DraftHistoryEntry, League } from './models.ts';
import { clone } from './models.ts';

/** NFL season a date belongs to: drafts in January or February count toward the season before. */
export function seasonFor(date: Date): number {
  return date.getUTCMonth() >= 2 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

export const draftNumberOf = (league: League): number =>
  Number.isFinite(league.draftNumber) && (league.draftNumber as number) > 0 ? (league.draftNumber as number) : 1;

export const historyIdFor = (league: League): string => `${league.id}-draft-${draftNumberOf(league)}`;

export function snapshotDraft(league: League, now: Date): DraftHistoryEntry {
  return {
    id: historyIdFor(league),
    leagueId: league.id,
    leagueName: league.name,
    draftNumber: draftNumberOf(league),
    season: seasonFor(now),
    completedAt: now.toISOString(),
    draftMode: league.draftMode,
    adminId: league.adminId,
    members: [...(league.members ?? [])],
    rosterSettings: clone(league.rosterSettings),
    teams: (league.teams ?? []).filter(Boolean).map((team) => ({
      id: team.id,
      ownerId: team.ownerId,
      name: team.name,
      budget: team.budget,
      roster: clone(team.roster ?? []),
    })),
    draftLog: (league.draftLog ?? []).filter((pick) => pick?.player).map((pick) => ({
      player: clone(pick.player),
      winningTeamId: pick.winningTeamId,
      winningBid: pick.winningBid,
      // Whiteboard drawings stay with the live league only; history keeps the amounts.
      allBids: Object.fromEntries(Object.entries(clone(pick.allBids ?? {})).map(([id, { board: _board, ...bid }]) => [id, bid])),
    })),
  };
}

export const isCompleted = (league: League | null | undefined): boolean =>
  String(league?.status ?? '').toLowerCase() === 'completed';

/** Short row for the history list. */
export function historySummary(entry: DraftHistoryEntry, userId: string) {
  const myTeam = entry.teams.find((team) => team.ownerId === userId);
  const topPick = entry.draftLog.reduce<DraftHistoryEntry['draftLog'][number] | null>(
    (best, pick) => (!best || pick.winningBid > best.winningBid ? pick : best),
    null,
  );
  return {
    id: entry.id,
    leagueId: entry.leagueId,
    leagueName: entry.leagueName,
    draftNumber: entry.draftNumber,
    season: entry.season,
    completedAt: entry.completedAt,
    draftMode: entry.draftMode,
    teamCount: entry.teams.length,
    pickCount: entry.draftLog.length,
    myTeamName: myTeam?.name ?? null,
    topPick: topPick
      ? { name: topPick.player.name, position: topPick.player.position, price: topPick.winningBid }
      : null,
  };
}
