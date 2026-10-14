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

// Kickers and defenses: one starter is enough, so a new one is only worth it as a clear upgrade.
const ONE_STARTER = ['K', 'DST'];
const ONE_STARTER_UPGRADE = 3;

// Handcuffs: the next man up behind a team's lead back or top receiver. Chance the starter misses
// any given game the rest of the way, and how much of the starter's production the backup takes over.
const HANDCUFF = {
  RB: { usage: 'carryShare', minShare: 0.55, missChance: 0.2, takeOver: 0.7 },
  WR: { usage: 'targetShare', minShare: 0.24, missChance: 0.12, takeOver: 0.55 },
};
// Backing up your own starter is insurance for your lineup, so it counts extra.
const OWN_HANDCUFF_BONUS = 1.5;
const perGameOf = (p, scoring) => p.outlook?.perGame ?? tradeValue(p, scoring);

/**
 * When p is the next man up behind a high-usage RB1 or WR1, what that's worth: the chance the starter
 * misses a game times how far above a waiver starter the backup would score filling in.
 */
const handcuffOf = (p, { allPlayers, levels, scoring, rosterIds }) => {
  const position = normalizePosition(p.position);
  const rule = HANDCUFF[position];
  if (!rule || !p.team || !allPlayers) return null;
  const mates = allPlayers.filter((m) => m.team === p.team && normalizePosition(m.position) === position && m.id !== p.id);
  if (!mates.length) return null;
  const starter = mates.reduce((best, m) => (perGameOf(m, scoring) > perGameOf(best, scoring) ? m : best));
  const level = levels[position] ?? 0;
  const starterPerGame = perGameOf(starter, scoring);
  const share = starter.usage?.[rule.usage] ?? 0;
  if (share < rule.minShare || starterPerGame < 1.25 * level || perGameOf(p, scoring) >= starterPerGame) return null;
  // Only the next man up: nobody else behind the starter projects more.
  if (mates.some((m) => m.id !== starter.id && perGameOf(m, scoring) > perGameOf(p, scoring))) return null;
  const fillIn = rule.takeOver * starterPerGame;
  const own = rosterIds.has(starter.id);
  const bonus = rule.missChance * Math.max(0, fillIn - level) * (own ? OWN_HANDCUFF_BONUS : 1);
  if (bonus <= 0) return null;
  const usageWord = position === 'RB' ? 'carries' : 'targets';
  return {
    starter, own, bonus,
    note: `handcuff to ${own ? 'your ' : ''}${starter.name} (${Math.round(share * 100)}% of ${usageWord}), about ${round1(fillIn)} a game if he misses time`,
  };
};

/** A player's value to keep: our rest-of-season value, blended with the market when there is one. */
export const keepValue = (p, { levels, scoring, dynasty, market, handcuff = null }) => {
  const own = ownTradeScore(p, levels, scoring, dynasty).score + (handcuff?.bonus ?? 0);
  const marketValue = market?.players?.[p.id]?.value ?? null;
  const marketScore = marketValue == null ? null : market.toScore(marketValue);
  const score = marketScore == null ? own : market.weight * marketScore + (1 - market.weight) * own;
  return {
    score: round1(score),
    own: round1(own),
    marketValue,
    display: market ? market.toMarket(score) : null,
    perGame: round1(tradeValue(p, scoring)),
    handcuff,
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
  if (info.handcuff) bits.push(info.handcuff.note);
  if (onBench) bits.push('on your bench');
  if (info.marketValue == null && ['QB', 'RB', 'WR', 'TE'].includes(normalizePosition(p.position)) && info.display != null) bits.push('no trade market value');
  return bits.join(', ');
};

/**
 * roster and pool are Start/Sit players with outlooks attached. Returns
 * { drops: [{ player, info, reason }], holds: [{ player, info, reason }], moves: [{ add, drop, gain, lineupChange }] }.
 */
export const suggestWaiverMoves = ({
  roster, pool, rosterSettings, scoring, levels, market = null, dynasty = false, allPlayers = null,
}) => {
  const rosterIds = new Set(roster.map((p) => p.id));
  const everyone = allPlayers || [...roster, ...pool];
  const rate = (p) => keepValue(p, {
    levels, scoring, dynasty, market, handcuff: handcuffOf(p, { allPlayers: everyone, levels, scoring, rosterIds }),
  });
  const starters = seasonStarterIds(roster, rosterSettings, scoring);
  const rated = roster.map((p) => ({ player: p, info: rate(p), starter: starters.has(p.id) }));

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
    // Players without an NFL team can't score for you.
    .filter((p) => p.team && p.team !== 'FA')
    .map((p) => ({ player: p, info: rate(p) }))
    .sort((a, b) => b.info.score - a.info.score)
    .slice(0, ADD_POOL);

  const moves = [];
  const usedDrops = new Set();
  for (const add of adds) {
    if (moves.length >= MAX_MOVES) break;
    const addPosition = normalizePosition(add.player.position);
    // A kicker or defense only replaces your own, and only as a clear upgrade on it.
    const current = ONE_STARTER.includes(addPosition)
      ? roster.filter((p) => normalizePosition(p.position) === addPosition)
      : [];
    let drop;
    if (current.length) {
      const best = Math.max(...current.map((c) => perGameOf(c, scoring)));
      if (perGameOf(add.player, scoring) - best < ONE_STARTER_UPGRADE) continue;
      const worst = current.reduce((a, b) => (perGameOf(a, scoring) <= perGameOf(b, scoring) ? a : b));
      drop = usedDrops.has(worst.id) ? null : rated.find((r) => r.player.id === worst.id);
    } else {
      drop = droppable.find((d) => !usedDrops.has(d.player.id) && add.info.score - d.info.score >= MIN_GAIN && (() => {
        const after = [...roster.filter((p) => p.id !== d.player.id), add.player];
        return fillsLineup(after, rosterSettings, scoring);
      })());
    }
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
