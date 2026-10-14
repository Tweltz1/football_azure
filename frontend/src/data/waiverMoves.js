// Waiver moves: who on your roster is the safest to drop, and which free agents are worth the spot.
// Everything is judged on rest-of-season value (the player outlooks: games left, injuries, role,
// schedule), blended with the trade market when it's loaded, so a top player who is hurt for a few
// weeks is held, not dropped.

import {
  fillsLineup, normalizePosition, ownTradeScore, seasonStarterIds, tradeValue,
} from './startSitUtils.js';

// An add has to beat the drop by this much (our value scale) to be worth a claim.
const MIN_GAIN = 1;
const MAX_DROPS = 5;
const MAX_MOVES = 5;
// Only the best free agents are paired up, which keeps the search quick.
const ADD_POOL = 25;

const round1 = (n) => Math.round(n * 10) / 10;

/** A player's value to keep: our rest-of-season value, blended with the market when there is one. */
export const keepValue = (p, { levels, scoring, dynasty, market }) => {
  const own = ownTradeScore(p, levels, scoring, dynasty).score;
  const marketValue = market?.players?.[p.id]?.value ?? null;
  const marketScore = marketValue == null ? null : market.toScore(marketValue);
  const score = marketScore == null ? own : market.weight * marketScore + (1 - market.weight) * own;
  return {
    score: round1(score),
    own: round1(own),
    marketValue,
    display: market ? market.toMarket(score) : null,
    perGame: round1(tradeValue(p, scoring)),
  };
};

/**
 * Hurt now but worth holding: they're expected to miss games, yet score like a starter at their
 * position when they play (or the market still rates them highly).
 */
const injuredKeeper = (p, levels, market) => {
  const outlook = p.outlook;
  if (!outlook || outlook.missed < 1) return null;
  const level = levels[normalizePosition(p.position)] ?? 0;
  const marketRank = market?.players?.[p.id]?.overallRank ?? null;
  const starterWhenHealthy = outlook.perGame >= level && outlook.perGame > 0;
  const marketLikes = marketRank != null && marketRank <= 100;
  if (!starterWhenHealthy && !marketLikes) return null;
  const back = outlook.backWeek ? `back around week ${outlook.backWeek}` : 'out for now';
  return `${p.injury || 'Hurt'} and ${back}, but worth about ${outlook.perGame.toFixed(1)} a game when playing`
    + `${marketLikes ? ` and still the market's #${marketRank} player` : ''}. Hold.`;
};

const why = (p, info, onBench) => {
  const bits = [`${info.perGame.toFixed(1)} pts/game rest of season`];
  if (p.outlook?.missed >= 1) bits.push(`expected to miss about ${Math.round(p.outlook.missed)} game${Math.round(p.outlook.missed) === 1 ? '' : 's'}`);
  if (onBench) bits.push('on your bench');
  if (info.marketValue == null && ['QB', 'RB', 'WR', 'TE'].includes(normalizePosition(p.position)) && info.display != null) bits.push('no trade market value');
  return bits.join(', ');
};

/**
 * roster and pool are Start/Sit players with outlooks attached. Returns
 * { drops: [{ player, info, reason }], holds: [{ player, info, reason }], moves: [{ add, drop, gain, lineupChange }] }.
 */
export const suggestWaiverMoves = ({ roster, pool, rosterSettings, scoring, levels, market = null, dynasty = false }) => {
  const ctx = { levels, scoring, dynasty, market };
  const starters = seasonStarterIds(roster, rosterSettings, scoring);
  const rated = roster.map((p) => ({ player: p, info: keepValue(p, ctx), starter: starters.has(p.id) }));

  const holds = [];
  const candidates = [];
  rated.forEach((r) => {
    const keeper = injuredKeeper(r.player, levels, market);
    if (keeper) holds.push({ player: r.player, info: r.info, reason: keeper });
    else if (!r.starter) candidates.push(r);
  });
  candidates.sort((a, b) => a.info.score - b.info.score);
  // A drop has to leave a roster that can still fill every slot.
  const droppable = candidates.filter((c) => fillsLineup(roster.filter((p) => p.id !== c.player.id), rosterSettings, scoring)
    || pool.some((a) => normalizePosition(a.position) === normalizePosition(c.player.position)));
  const drops = droppable.slice(0, MAX_DROPS).map((c) => ({ player: c.player, info: c.info, reason: why(c.player, c.info, true) }));

  const lineupTotal = (players) => {
    const ids = seasonStarterIds(players, rosterSettings, scoring);
    return players.filter((p) => ids.has(p.id)).reduce((sum, p) => sum + tradeValue(p, scoring), 0);
  };
  const before = lineupTotal(roster);
  const adds = pool
    .map((p) => ({ player: p, info: keepValue(p, ctx) }))
    .sort((a, b) => b.info.score - a.info.score)
    .slice(0, ADD_POOL);

  const moves = [];
  const usedDrops = new Set();
  for (const add of adds) {
    if (moves.length >= MAX_MOVES) break;
    const drop = droppable.find((d) => !usedDrops.has(d.player.id) && add.info.score - d.info.score >= MIN_GAIN && (() => {
      const after = [...roster.filter((p) => p.id !== d.player.id), add.player];
      return fillsLineup(after, rosterSettings, scoring);
    })());
    if (!drop) continue;
    usedDrops.add(drop.player.id);
    const after = [...roster.filter((p) => p.id !== drop.player.id), add.player];
    moves.push({
      add: { player: add.player, info: add.info, reason: why(add.player, add.info, false) },
      drop: { player: drop.player, info: drop.info },
      gain: round1(add.info.score - drop.info.score),
      displayGain: market ? add.info.display - drop.info.display : null,
      lineupChange: round1(lineupTotal(after) - before),
    });
  }
  return { drops, holds, moves };
};
