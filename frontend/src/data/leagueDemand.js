// What the rosters in your leagues say about value. It's one signal next to projections and the trade
// market, not a replacement for them:
// - The real waiver wire: the best players nobody in this league has set what "a starter you could find
//   on waivers" is worth, blended with the projection-based estimate.
// - Position demand: how many players at each position teams carry against how many they start. Teams
//   hoarding backs leave a thin waiver wire, which the waiver levels then reflect.
// - Player demand: how many teams across all your leagues roster and start each player.

import { buildSlots, normalizePosition, tradeValue } from './startSitUtils.js';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
// The waiver level is the average of this many best free agents, since other teams claim too.
const WAIVER_DEPTH = 3;
// How much the real waiver wire counts against the projection-based level.
const REAL_WAIVER_WEIGHT = 0.5;

const round1 = (n) => Math.round(n * 10) / 10;
const leagueRosters = (league) => [
  { players: league.players || [], starters: league.starters || [] },
  ...(league.opponents || []).map((team) => ({ players: team.players || [], starters: team.starters || [] })),
];

/** Across every imported league: how many teams roster and start each player. */
export const playerDemand = (sleeperTeams) => {
  const byId = new Map();
  let teams = 0;
  (sleeperTeams || []).forEach((league) => {
    const rosters = leagueRosters(league);
    teams += rosters.length;
    rosters.forEach((roster) => {
      const starters = new Set(roster.starters);
      roster.players.forEach((p) => {
        const row = byId.get(p.id) || { rostered: 0, started: 0 };
        row.rostered += 1;
        if (starters.has(p.id)) row.started += 1;
        byId.set(p.id, row);
      });
    });
  });
  return { byId, teams, leagues: (sleeperTeams || []).length };
};

/** "Rostered on 9 of 24 teams in your 2 leagues, started by 6", or null without league rosters. */
export const demandNote = (id, demand) => {
  if (!demand?.teams) return null;
  const row = demand.byId.get(id) || { rostered: 0, started: 0 };
  const where = demand.leagues === 1 ? 'in this league' : `across your ${demand.leagues} leagues`;
  if (!row.rostered) return `On no team ${where}.`;
  return `On ${row.rostered} of ${demand.teams} teams ${where}, started by ${row.started}.`;
};

/** Per position, the average of the best few free agents' rest-of-season value in this league. */
export const realWaiverLevels = (allPlayers, rosteredIds, scoring) => {
  if (!rosteredIds?.size) return null;
  const levels = {};
  POSITIONS.forEach((position) => {
    const free = (allPlayers || [])
      .filter((p) => normalizePosition(p.position) === position && !rosteredIds.has(p.id) && p.team && p.team !== 'FA')
      .map((p) => tradeValue(p, scoring))
      .sort((a, b) => b - a)
      .slice(0, WAIVER_DEPTH);
    levels[position] = free.length === WAIVER_DEPTH ? free.reduce((s, v) => s + v, 0) / free.length : null;
  });
  return levels;
};

/** Projection-based levels blended with the real waiver wire, where we can see it. */
export const blendLevels = (estimated, real) => {
  if (!real) return estimated;
  const levels = { ...estimated };
  Object.keys(levels).forEach((position) => {
    if (real[position] != null) levels[position] = (1 - REAL_WAIVER_WEIGHT) * levels[position] + REAL_WAIVER_WEIGHT * real[position];
  });
  return levels;
};

/**
 * How deep teams in one league go at each position: players carried per team against starting spots
 * (flex spots split by how often each position fills them), plus the best free agent's value.
 */
export const positionDemand = (league, rosterSettings, positionOf, real) => {
  const rosters = leagueRosters(league);
  if (rosters.length < 2) return [];
  const starting = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  buildSlots(rosterSettings).forEach((slot) => {
    if (slot.positions.length === 1) starting[slot.positions[0]] += 1;
    else if (slot.positions.includes('QB')) starting.QB += 1;
    else {
      const share = { RB: 0.4, WR: 0.5, TE: 0.1 };
      const allowed = slot.positions.filter((p) => share[p]);
      const total = allowed.reduce((sum, p) => sum + share[p], 0) || 1;
      allowed.forEach((p) => { starting[p] += share[p] / total; });
    }
  });
  return POSITIONS.filter((position) => starting[position] > 0).map((position) => {
    const carried = rosters.reduce((sum, r) => sum + r.players.filter((p) => normalizePosition(positionOf(p)) === position).length, 0);
    const perTeam = carried / rosters.length;
    return {
      position,
      perTeam: round1(perTeam),
      starting: round1(starting[position]),
      depth: starting[position] ? round1(perTeam / starting[position]) : null,
      bestFree: real?.[position] != null ? round1(real[position]) : null,
    };
  });
};
