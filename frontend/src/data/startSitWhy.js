// Plain-English reasons behind each Start/Sit call: why one player starts over another.
// Everything comes from the same data the lineup uses (Sleeper projections, this season's games,
// what each defense has allowed, injury reports), so the reasons change as that data does.

import {
  benchReason, defenseMatchup, describeMarketSettings, isUnavailable, tagForSide, teammatesOut, trendFor, vacatedPoints,
} from './startSitUtils.js';
import { rankLabel } from './rankings.js';

const round1 = (value) => Math.round(value * 10) / 10;
const pts = (value) => `${round1(value).toFixed(1)}`;
const firstName = (player) => String(player?.name || '').split(' ').slice(-1)[0] || player?.name || '';

const CALLS = {
  clear: { key: 'clear', label: 'Clear call' },
  lean: { key: 'lean', label: 'Lean' },
  tossup: { key: 'tossup', label: 'Coin flip' },
  forced: { key: 'clear', label: 'Easy call' },
};

// ---- Confidence: how often one player outscores the other -------------------------------

// Typical game-to-game swing (standard deviation of fantasy points) by position, used when a
// player has few games of their own.
const DEFAULT_SPREAD = { QB: 7.5, RB: 7.5, WR: 7.5, TE: 6, K: 4, DST: 5.5 };
const SPREAD_PRIOR_GAMES = 3;

/** How much a player's score swings week to week: their own season blended with the position norm. */
export const spreadFor = (player, scoring) => {
  const fallback = DEFAULT_SPREAD[player?.position] ?? 7;
  const own = player?.spread ? Number(player.spread[scoring] ?? player.spread.ppr) : null;
  const n = Math.max(0, (player?.gamesPlayed || 0) - 1);
  if (own == null || !Number.isFinite(own) || !n) return fallback;
  return Math.sqrt((n * own * own + SPREAD_PRIOR_GAMES * fallback * fallback) / (n + SPREAD_PRIOR_GAMES));
};

// Standard normal CDF (Abramowitz and Stegun 26.2.17, accurate to about 1e-7).
const normalCdf = (z) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - tail : tail;
};

/**
 * Chance `a` scores more than `b` this week: each score is treated as their projection plus a swing
 * the size of their usual week-to-week spread.
 */
export const winChance = (a, b, scoring) => {
  const sa = spreadFor(a, scoring);
  const sb = spreadFor(b, scoring);
  return normalCdf(((a.points || 0) - (b.points || 0)) / Math.sqrt(sa * sa + sb * sb));
};

// ---- Usage and matchup evidence -----------------------------------------------------------

const pct = (x) => `${Math.round(x * 100)}%`;

/** The player's share of team targets (WR/TE) or carries (RB), season and last 3 games. */
export const usageFor = (player) => {
  const u = player?.usage;
  const key = player?.position === 'RB' ? 'carry' : ['WR', 'TE'].includes(player?.position) ? 'target' : null;
  if (!u || !key) return null;
  const season = u[`${key}Share`];
  const recent = u[`recent${key === 'carry' ? 'Carry' : 'Target'}Share`];
  if (season == null || recent == null) return null;
  return { kind: key === 'carry' ? 'carries' : 'targets', season, recent, change: recent - season, games: u.recentGames };
};

const seasonAverages = new WeakMap();
const averageOf = (ctx, id) => {
  if (!ctx.allPlayers) return null;
  let byId = seasonAverages.get(ctx.allPlayers);
  if (!byId) {
    byId = new Map(ctx.allPlayers.map((p) => [p.id, p]));
    seasonAverages.set(ctx.allPlayers, byId);
  }
  const p = byId.get(id);
  return p?.seasonAvg && (p.gamesPlayed || 0) >= 2 ? Number(p.seasonAvg[ctx.scoring] ?? 0) : null;
};

/**
 * How the lead player at this position has done against this defense compared with their own season
 * average: 0.18 means 18% better than usual. Needs at least 2 such games.
 */
export const defenseLift = (matchup, ctx) => {
  const games = (matchup?.notable || [])
    .map((g) => ({ ...g, average: averageOf(ctx, g.id) }))
    .filter((g) => g.average >= 3);
  if (games.length < 2) return null;
  const lift = games.reduce((sum, g) => sum + g.value / g.average, 0) / games.length - 1;
  return { lift: Math.round(lift * 100) / 100, games: games.length, examples: games.slice(0, 2) };
};

/** Floor and ceiling from the last few games (needs at least 2). */
const range = (trend) => {
  const values = trend.recent.map((game) => game.value);
  if (values.length < 2) return null;
  return { floor: round1(Math.min(...values)), ceiling: round1(Math.max(...values)), games: values.length };
};

const healthNote = (player) => {
  if (player.onBye) return 'On bye';
  if (isUnavailable(player.injury)) return player.injury;
  if (player.injury) return player.injury;
  return 'Healthy';
};

/** Everything we know about one player for this week, in one place. */
export const profile = (player, ctx) => {
  const trend = trendFor(player, ctx.scoring);
  const matchup = defenseMatchup(player, ctx.defense, ctx.scoring);
  const mates = teammatesOut(player, ctx.allPlayers, ctx.scoring);
  return {
    player,
    points: player.points ?? null,
    trend,
    range: range(trend),
    matchup,
    vacated: vacatedPoints(mates),
    matesOut: mates.filter((m) => m.overlaps && String(m.injury).toLowerCase() !== 'questionable'),
    out: !!benchReason(player),
    usage: usageFor(player),
    lift: matchup ? defenseLift(matchup, ctx) : null,
  };
};

const edgeBy = (a, b, minGap, higherIsBetter = true) => {
  if (a == null || b == null) return 'even';
  const gap = higherIsBetter ? a - b : b - a;
  if (gap >= minGap) return 'start';
  if (gap <= -minGap) return 'sit';
  return 'even';
};

const matchupText = (p) => {
  if (!p.player.opponent) return 'No game';
  if (!p.matchup) return `vs ${p.player.opponent}`;
  const label = { good: 'Easy', average: 'Average', tough: 'Tough' }[p.matchup.verdict];
  return `${label} vs ${p.player.opponent}`;
};

/** Side-by-side rows for the popover. Each says which side it favors. */
const compareFactors = (a, b) => {
  const factors = [];
  factors.push({
    key: 'projection',
    label: 'Projected',
    start: a.points == null ? '–' : pts(a.points),
    sit: b.points == null ? '–' : pts(b.points),
    detail: [a, b].map((p) => (p.player.posRank ? rankLabel(p.player.position, p.player.posRank) : null)),
    edge: edgeBy(a.points, b.points, 0.5),
  });
  if (a.trend.lastThree != null || b.trend.lastThree != null) {
    factors.push({
      key: 'form',
      label: 'Last 3 games',
      start: a.trend.lastThree == null ? '–' : pts(a.trend.lastThree),
      sit: b.trend.lastThree == null ? '–' : pts(b.trend.lastThree),
      detail: [a, b].map((p) => ({ up: 'Heating up', down: 'Cooling off' })[p.trend.direction] || null),
      edge: edgeBy(a.trend.lastThree, b.trend.lastThree, 1.5),
    });
  }
  if (a.matchup || b.matchup) {
    // A lower rank means the defense gives up more points to that position.
    factors.push({
      key: 'matchup',
      label: 'Matchup',
      start: matchupText(a),
      sit: matchupText(b),
      detail: [a, b].map((p) => (p.matchup ? p.matchup.rankLabel.replace(' points allowed to', ' allowed to') : null)),
      edge: a.matchup && b.matchup ? edgeBy(a.matchup.verdictRank, b.matchup.verdictRank, 5, false) : 'even',
    });
  }
  if (a.lift || b.lift) {
    const liftText = (p) => (p.lift ? `${p.lift.lift >= 0 ? '+' : '−'}${pct(Math.abs(p.lift.lift))} vs usual` : '–');
    factors.push({
      key: 'lift',
      label: 'Similar players vs this defense',
      start: liftText(a),
      sit: liftText(b),
      detail: [a, b].map((p) => (p.lift ? `top ${p.player.position} in last ${p.lift.games} games vs ${p.player.opponent}` : null)),
      edge: edgeBy(a.lift?.lift ?? 0, b.lift?.lift ?? 0, 0.1),
    });
  }
  if (a.usage || b.usage) {
    const usageText = (p) => (p.usage ? `${pct(p.usage.recent)} of ${p.usage.kind}` : '–');
    factors.push({
      key: 'usage',
      label: 'Share of team work (last 3)',
      start: usageText(a),
      sit: usageText(b),
      detail: [a, b].map((p) => (p.usage ? `season ${pct(p.usage.season)}` : null)),
      edge: edgeBy(a.usage?.change ?? 0, b.usage?.change ?? 0, 0.05),
    });
  }
  if (a.range || b.range) {
    factors.push({
      key: 'floor',
      label: 'Worst recent game',
      start: a.range ? pts(a.range.floor) : '–',
      sit: b.range ? pts(b.range.floor) : '–',
      detail: [a, b].map((p) => (p.range ? `Best ${pts(p.range.ceiling)}` : null)),
      edge: a.range && b.range ? edgeBy(a.range.floor, b.range.floor, 2) : 'even',
    });
  }
  if (a.vacated >= 3 || b.vacated >= 3) {
    factors.push({
      key: 'opportunity',
      label: 'Teammates out',
      start: a.vacated >= 3 ? `+${pts(a.vacated)} pts of work` : '–',
      sit: b.vacated >= 3 ? `+${pts(b.vacated)} pts of work` : '–',
      detail: [a, b].map((p) => (p.matesOut.length ? p.matesOut.slice(0, 2).map((m) => `${firstName(m)} ${m.injury}`).join(', ') : null)),
      edge: edgeBy(a.vacated, b.vacated, 3),
    });
  }
  const aHurt = a.player.injury || a.player.onBye;
  const bHurt = b.player.injury || b.player.onBye;
  if (aHurt || bHurt) {
    factors.push({
      key: 'health',
      label: 'Status',
      start: healthNote(a.player),
      sit: healthNote(b.player),
      detail: [null, null],
      edge: aHurt && !bHurt ? 'sit' : bHurt && !aHurt ? 'start' : 'even',
    });
  }
  return factors;
};

const joinWords = (parts) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

// Short phrases for the summary, written from the point of view of the player each factor favors.
const PHRASES = {
  form: (w, l) => (w.trend.direction === 'up' ? 'is heating up' : `has been better lately (${pts(w.trend.lastThree)} vs ${pts(l.trend.lastThree)} over the last 3)`),
  matchup: (w) => `has the easier matchup against ${w.player.opponent}`,
  floor: () => 'has the safer floor',
  opportunity: (w) => `has extra work with ${joinWords(w.matesOut.slice(0, 2).map((m) => m.name))} out`,
  health: (w, l) => `is healthier (${l.player.name} is ${healthNote(l.player).toLowerCase()})`,
  lift: (w) => `faces a defense where the top ${w.player.position} has scored ${pct(Math.abs(w.lift.lift))} ${w.lift.lift >= 0 ? 'above' : 'below'} their usual (last ${w.lift.games} games)`,
  usage: (w) => (w.usage.change > 0
    ? `is getting more of the work (${pct(w.usage.recent)} of team ${w.usage.kind} lately, up from ${pct(w.usage.season)})`
    : `has the steadier role (${pct(w.usage.recent)} of team ${w.usage.kind})`),
};

/** What a call rests on, in one line. */
const basisOf = (a, b) => {
  const games = [a, b].map((p) => `${p.player.gamesPlayed || 0} game${p.player.gamesPlayed === 1 ? '' : 's'} for ${firstName(p.player)}`);
  const parts = ["Sleeper's projections", `this season's results (${joinWords(games)})`];
  if (a.lift || b.lift) parts.push('recent games against each defense');
  if (a.usage || b.usage) parts.push('team target and carry shares');
  parts.push('the injury report');
  return `Based on ${joinWords(parts)}.`;
};

/**
 * Why `start` gets the spot over `sit`. Both are Start/Sit roster players (with points for the
 * chosen scoring). Returns { call, headline, summary, factors, watch, names }.
 */
export const explainPair = (start, sit, ctx, { headline } = {}) => {
  const a = profile(start, ctx);
  const b = profile(sit, ctx);
  for (const p of [a, b]) {
    if (p.matchup) p.matchup.verdictRank = p.matchup.rank || null;
  }
  const factors = compareFactors(a, b);
  const title = headline || `Start ${start.name} over ${sit.name}`;
  const names = [start.name, sit.name];

  // The other player can't play: nothing else matters.
  if (b.out) {
    const reason = benchReason(sit);
    const why = sit.onBye ? `${sit.name} is on bye this week`
      : reason === 'No projection' ? `Sleeper doesn't expect ${sit.name} to play this week`
        : `${sit.name} is listed ${reason}`;
    return {
      call: CALLS.forced, headline: title, names, factors,
      summary: `${why}, so ${start.name} gets the spot${a.points ? ` (${pts(a.points)} projected)` : ''}.`,
      watch: null,
    };
  }

  const gap = round1((a.points || 0) - (b.points || 0));
  const share = gap / Math.max(b.points || 0, 1);
  const forStart = factors.filter((f) => f.key !== 'projection' && f.edge === 'start');
  const forSit = factors.filter((f) => f.key !== 'projection' && f.edge === 'sit');

  const chance = winChance(start, sit, ctx.scoring);
  let call = CALLS.lean;
  if (chance < 0.57 || gap < 1) call = CALLS.tossup;
  else if (chance >= 0.7 && share >= 0.1 && forSit.length <= 1) call = CALLS.clear;
  const confidence = {
    chance: Math.round(chance * 100),
    text: `${start.name} outscores ${sit.name} about ${Math.round(chance * 100)}% of the time, from their projections and how much each one's scoring swings week to week (±${pts(spreadFor(start, ctx.scoring))} and ±${pts(spreadFor(sit, ctx.scoring))} pts).`,
  };

  const pros = forStart.map((f) => PHRASES[f.key]?.(a, b)).filter(Boolean).slice(0, 2);
  const cons = forSit.map((f) => PHRASES[f.key]?.(b, a)).filter(Boolean).slice(0, 2);

  let summary;
  if (call === CALLS.tossup && cons.length > pros.length) {
    // The projection says one thing and most of the other evidence says the other.
    summary = `${start.name} projects only ${pts(Math.max(gap, 0))} more points, but ${sit.name} ${joinWords(cons)}.`;
    summary += ` It's close enough that ${sit.name} is a fine start too.`;
  } else if (call === CALLS.tossup) {
    summary = `${start.name} and ${sit.name} are within ${pts(Math.max(gap, 0))} points of each other`;
    summary += pros.length ? `. The tiebreaker: ${start.name} ${pros[0]}.` : ', so the projection barely picks a side.';
    if (cons.length) summary += ` ${sit.name} ${cons[0]}, so starting either is defensible.`;
  } else {
    summary = `${start.name} projects ${pts(gap)} more points`;
    summary += pros.length ? `, ${joinWords(pros)}.` : '.';
    if (cons.length) summary += ` ${sit.name} ${cons[0]}, but not by enough to make up the gap.`;
  }

  let watch = null;
  if (a.out) {
    return {
      call: CALLS.forced, headline: `Start ${sit.name} over ${start.name}`, names: [sit.name, start.name],
      factors: compareFactors(b, a),
      summary: `${start.name} projects more, but is ${start.onBye ? 'on bye' : `listed ${benchReason(start)}`} this week, so ${sit.name} is the one to start.`,
      watch: null,
    };
  }
  const questionable = [start, sit].find((p) => String(p.injury || '').toLowerCase() === 'questionable');
  if (questionable === start) watch = `${start.name} is questionable. If ${firstName(start)} is ruled out before kickoff, start ${sit.name} instead.`;
  else if (questionable === sit) watch = `${sit.name} is questionable, which also makes ${firstName(sit)} riskier to start.`;
  else if (call === CALLS.tossup) watch = 'Check injury news and weather before kickoff; small changes can flip a call this close.';

  return { call, headline: title, names, factors, summary, watch, confidence, basis: basisOf(a, b) };
};

/** Why a single player is on the field when nobody on the bench can take the slot. */
export const explainAlone = (player, slotLabel, ctx) => {
  const p = profile(player, ctx);
  const bits = [];
  if (p.matchup) bits.push(`${p.matchup.verdict === 'good' ? 'a good' : p.matchup.verdict === 'tough' ? 'a tough' : 'an average'} matchup against ${player.opponent}`);
  if (p.trend.direction === 'up') bits.push(`${pts(p.trend.lastThree)} a game over the last 3`);
  return {
    call: CALLS.forced,
    headline: `Start ${player.name}`,
    names: [player.name, null],
    factors: [],
    summary: `Nobody on your bench can play ${slotLabel}, so ${player.name} starts${p.points ? ` (${pts(p.points)} projected${bits.length ? `, with ${joinWords(bits)}` : ''})` : ''}.`,
    watch: player.injury ? `${player.name} is listed ${player.injury}. Keep an eye on the injury report.` : null,
  };
};

const healthy = (player) => !benchReason(player);

// A pickup has to beat the starter by this much to be worth a waiver claim.
const WAIVER_MIN_GAIN = 1.5;
const MAX_WAIVERS = 3;

/**
 * Players nobody in the league has rostered who project more than `player` this week at a position
 * the slot takes. ctx.waiverPool is those unrostered players (already scored for the league);
 * ctx.waiverNote says how sure we are they're free. Returns { note, players } or null.
 */
export const waiverOptions = (player, positions, ctx) => {
  if (!player || !ctx.waiverPool?.length) return null;
  const allowed = positions?.length ? positions : [player.position];
  const target = player.points || 0;
  const players = ctx.waiverPool
    .filter((p) => allowed.includes(p.position) && healthy(p) && p.points - target >= WAIVER_MIN_GAIN)
    .sort((x, y) => y.points - x.points)
    .slice(0, MAX_WAIVERS)
    .map((p) => {
      const matchup = defenseMatchup(p, ctx.defense, ctx.scoring);
      const trend = trendFor(p, ctx.scoring);
      const bits = [p.posRank ? rankLabel(p.position, p.posRank) : null];
      if (matchup) bits.push(`${{ good: 'easy', average: 'average', tough: 'tough' }[matchup.verdict]} matchup vs ${p.opponent}`);
      else if (p.opponent) bits.push(`vs ${p.opponent}`);
      if (trend.direction === 'up') bits.push('heating up');
      if (p.injury) bits.push(p.injury);
      return {
        id: p.id,
        name: p.name,
        team: p.team,
        position: p.position,
        points: round1(p.points),
        gain: round1(p.points - target),
        detail: bits.filter(Boolean).join(' · '),
      };
    });
  if (!players.length) return null;
  return { note: ctx.waiverNote || null, players };
};

const withWaivers = (why, player, positions, ctx) => (why ? { ...why, waivers: waiverOptions(player, positions, ctx) } : why);

/** Why the player in this lineup slot starts: compared with the best bench player who could take the slot. */
export const explainStarter = (lineup, slotKey, ctx) => {
  const entry = lineup.starters.find((s) => s.slot.key === slotKey);
  if (!entry?.player) return null;
  const rivals = lineup.bench.filter((p) => entry.slot.positions.includes(p.position));
  const rival = rivals.find(healthy) || rivals[0];
  const why = rival ? explainPair(entry.player, rival, ctx) : explainAlone(entry.player, entry.slot.label, ctx);
  return withWaivers(why, entry.player, entry.slot.positions, ctx);
};

/** Why a bench player sits: compared with the weakest starter whose spot they could take. */
export const explainBench = (lineup, playerId, ctx) => {
  const player = lineup.bench.find((p) => p.id === playerId);
  if (!player) return null;
  const starters = lineup.starters
    .filter((s) => s.player && s.slot.positions.includes(player.position))
    .map((s) => s.player)
    .sort((x, y) => (x.points || 0) - (y.points || 0));
  const starter = starters[0];
  if (!starter) {
    const reason = benchReason(player);
    return {
      call: CALLS.forced,
      headline: `Sit ${player.name}`,
      names: [player.name, null],
      factors: [],
      summary: reason
        ? `${player.name} ${player.onBye ? 'is on bye this week' : reason === 'No projection' ? 'has no projection this week' : `is listed ${reason}`}.`
        : `Your lineup has no open spot for a ${player.position}.`,
      watch: null,
    };
  }
  return explainPair(starter, player, ctx, { headline: `Sit ${player.name}, start ${starter.name}` });
};

// ---- Trades -----------------------------------------------------------------------------

const TRADE_CALLS = {
  win: { key: 'clear', label: 'Good for you' },
  fair: { key: 'lean', label: 'Fair' },
  lose: { key: 'lose', label: 'Bad for you' },
};

const signedPts = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${pts(Math.abs(n))}`;
const sumOf = (list, pick) => round1(list.reduce((total, item) => total + (pick(item) || 0), 0));
const namesOf = (list) => joinWords(list.map((p) => p.name));

/** Who on one side of a trade is hurt or on bye, as a short note. */
const sideHealth = (players) => {
  const hurt = players.filter((p) => p.injury || p.onBye);
  if (!hurt.length) return 'All healthy';
  return hurt.map((p) => `${firstName(p)} ${p.onBye ? 'bye' : p.injury}`).join(', ');
};

/**
 * Why the trade checker rated a trade the way it did. `result` is analyzeTrade's result; ctx is
 * { allPlayers, scoring, dynasty, partnerName }. Returns the same shape as explainPair, with the
 * left column for what you get and the right for what you give.
 */
export const explainTrade = (result, ctx) => {
  const getPlayers = result.get.filter((p) => !p.round);
  const givePlayers = result.give.filter((p) => !p.round);
  const getPicks = result.get.filter((p) => p.round);
  const givePicks = result.give.filter((p) => p.round);
  const them = ctx.partnerName || 'them';
  const factors = [];

  const valueEdge = result.share > 0.15 ? 'start' : result.share < -0.15 ? 'sit' : 'even';
  const hasMarket = result.getDisplay != null;
  const shown = (side) => (hasMarket ? result[`${side}Display`].toLocaleString() : pts(result[`${side}Total`]));
  factors.push({
    key: 'value', label: hasMarket ? 'Trade value (blended)' : 'Trade value',
    start: shown('get'), sit: shown('give'),
    detail: [getPicks.length ? `incl. ${getPicks.length} pick${getPicks.length > 1 ? 's' : ''}` : null, givePicks.length ? `incl. ${givePicks.length} pick${givePicks.length > 1 ? 's' : ''}` : null],
    edge: valueEdge,
  });

  // The two halves of the blend: what the trade market pays, and what our projections say.
  let marketLean = null;
  let projectionLean = null;
  if (hasMarket) {
    const marketSum = (list) => list.reduce((total, p) => total + (p.marketValue || 0), 0);
    const getMarket = marketSum(result.get);
    const giveMarket = marketSum(result.give);
    marketLean = getMarket > giveMarket * 1.1 ? 'start' : giveMarket > getMarket * 1.1 ? 'sit' : 'even';
    factors.push({
      key: 'market', label: 'Trade market',
      start: getMarket.toLocaleString(), sit: giveMarket.toLocaleString(),
      detail: ['FantasyCalc', 'FantasyCalc'],
      edge: marketLean,
    });
    const getOwn = sumOf(result.get, (p) => p.ownScore);
    const giveOwn = sumOf(result.give, (p) => p.ownScore);
    projectionLean = getOwn > giveOwn * 1.1 ? 'start' : giveOwn > getOwn * 1.1 ? 'sit' : 'even';
    factors.push({
      key: 'projection', label: 'Our projections',
      start: pts(getOwn), sit: pts(giveOwn),
      detail: ['your scoring, rest of season', null],
      edge: projectionLean,
    });
  }

  const getPpg = sumOf(getPlayers, (p) => p.value);
  const givePpg = sumOf(givePlayers, (p) => p.value);
  factors.push({
    key: 'ppg', label: 'Points per game',
    start: pts(getPpg), sit: pts(givePpg),
    detail: [getPlayers, givePlayers].map((list) => (list.length > 1 ? `${list.length} players, rest of season` : 'rest of season')),
    edge: edgeBy(getPpg, givePpg, 1.5),
  });

  const hasWeek = [...getPlayers, ...givePlayers].some((p) => p.points != null);
  if (hasWeek) {
    const getWeek = sumOf(getPlayers, (p) => p.points);
    const giveWeek = sumOf(givePlayers, (p) => p.points);
    factors.push({
      key: 'week', label: 'This week',
      start: pts(getWeek), sit: pts(giveWeek),
      detail: [null, null],
      edge: edgeBy(getWeek, giveWeek, 1.5),
    });
  }

  const trends = (list) => list.map((p) => trendFor(p, ctx.scoring)).filter((t) => t.lastThree != null);
  const getTrends = trends(getPlayers);
  const giveTrends = trends(givePlayers);
  if (getTrends.length || giveTrends.length) {
    const getForm = sumOf(getTrends, (t) => t.lastThree);
    const giveForm = sumOf(giveTrends, (t) => t.lastThree);
    const heat = (list) => {
      const up = list.filter((t) => t.direction === 'up').length;
      const down = list.filter((t) => t.direction === 'down').length;
      return up > down ? 'Heating up' : down > up ? 'Cooling off' : null;
    };
    factors.push({
      key: 'form', label: 'Last 3 games',
      start: pts(getForm), sit: pts(giveForm),
      detail: [heat(getTrends), heat(giveTrends)],
      edge: edgeBy(getForm, giveForm, 2),
    });
  }

  factors.push({
    key: 'lineup', label: 'Weekly lineup',
    start: `You ${signedPts(result.myChange)}`, sit: `Them ${signedPts(result.theirChange)}`,
    detail: [
      getPlayers.length ? getPlayers.map((p) => (p.role === 'would sit on your bench' ? `${firstName(p)} to bench` : `${firstName(p)} starts`)).join(', ') : null,
      givePlayers.some((p) => p.role && p.role !== 'your bench') ? `you lose ${givePlayers.filter((p) => p.role && p.role !== 'your bench').length} starter${givePlayers.filter((p) => p.role && p.role !== 'your bench').length > 1 ? 's' : ''}` : 'from your bench',
    ],
    // Their change is shown for context only; the highlight is about your lineup.
    edge: result.myChange >= 1.5 ? 'start' : result.myChange <= -1.5 ? 'startLose' : 'even',
  });

  const getVacated = sumOf(getPlayers, (p) => vacatedPoints(teammatesOut(p, ctx.allPlayers, ctx.scoring)));
  const giveVacated = sumOf(givePlayers, (p) => vacatedPoints(teammatesOut(p, ctx.allPlayers, ctx.scoring)));
  if (getVacated >= 3 || giveVacated >= 3) {
    factors.push({
      key: 'opportunity', label: 'Teammates out',
      start: getVacated >= 3 ? `+${pts(getVacated)} pts of work` : '–',
      sit: giveVacated >= 3 ? `+${pts(giveVacated)} pts of work` : '–',
      detail: [null, null],
      edge: edgeBy(getVacated, giveVacated, 3),
    });
  }

  const getHurt = getPlayers.filter((p) => p.injury || p.onBye);
  const giveHurt = givePlayers.filter((p) => p.injury || p.onBye);
  if (getHurt.length || giveHurt.length) {
    factors.push({
      key: 'health', label: 'Status',
      start: sideHealth(getPlayers), sit: sideHealth(givePlayers),
      detail: [null, null],
      edge: getHurt.length && !giveHurt.length ? 'sit' : giveHurt.length && !getHurt.length ? 'start' : 'even',
    });
  }

  if (ctx.dynasty) {
    const age = (list) => {
      const ages = list.map((p) => Number(p.age)).filter((a) => a > 0);
      return ages.length ? round1(ages.reduce((s, a) => s + a, 0) / ages.length) : null;
    };
    const getAge = age(getPlayers);
    const giveAge = age(givePlayers);
    if (getAge || giveAge) {
      factors.push({
        key: 'age', label: 'Average age',
        start: getAge ? pts(getAge) : '–', sit: giveAge ? pts(giveAge) : '–',
        detail: [null, null],
        edge: edgeBy(getAge, giveAge, 2, false),
      });
    }
  }

  // The summary: value first, then what it does to your lineup, then whether they'd take it.
  const valueGap = hasMarket ? Math.abs(result.getDisplay - result.giveDisplay).toLocaleString() : pts(Math.abs(result.getTotal - result.giveTotal));
  const sentences = [];
  if (valueEdge === 'even') sentences.push(`The value is close: ${shown('get')} coming in for ${shown('give')} going out.`);
  else if (valueEdge === 'start') sentences.push(`You get ${valueGap} more in trade value than you give (${shown('get')} vs ${shown('give')}).`);
  else sentences.push(`You give up ${valueGap} more in trade value than you get (${shown('give')} vs ${shown('get')}).`);
  if (marketLean && projectionLean && marketLean !== projectionLean && marketLean !== 'even' && projectionLean !== 'even') {
    sentences.push(projectionLean === 'start'
      ? 'The trade market rates what you give higher, but our projections for your scoring like what you get: a buy-low.'
      : 'The trade market rates what you get higher, but our projections for your scoring like what you give: you may be buying high.');
  }
  const adj = result.adjustment;
  if (adj?.get) sentences.push(`${namesOf(adj.get.players.map((name) => ({ name })))} wouldn't crack your lineup, so ${adj.get.players.length > 1 ? 'they count' : 'that counts'} for half to cover the roster spot.`);
  if (adj?.give) sentences.push(`${namesOf(adj.give.players.map((name) => ({ name })))} wouldn't crack ${them}'s lineup, so ${adj.give.players.length > 1 ? 'they count' : 'that counts'} for half on their side.`);

  const starting = getPlayers.filter((p) => p.role && p.role.startsWith('would start'));
  const lostStarters = givePlayers.filter((p) => p.role && p.role !== 'your bench');
  if (result.myChange >= 1.5) {
    sentences.push(`Your starting lineup gains ${pts(result.myChange)} pts a week${starting.length ? ` because ${namesOf(starting)} would start for you` : ''}.`);
  } else if (result.myChange <= -1.5) {
    const benched = getPlayers.filter((p) => !starting.includes(p));
    sentences.push(`Your starting lineup drops ${pts(-result.myChange)} pts a week${lostStarters.length ? ` without ${namesOf(lostStarters)}` : ''}`
      + `${benched.length ? `, and ${namesOf(benched)} would sit on your bench behind your current starters` : ''}.`);
  } else if (getPlayers.length && !starting.length) {
    sentences.push(`${namesOf(getPlayers)} would sit on your bench, so your lineup barely changes.`);
  } else {
    sentences.push('Your starting lineup barely changes.');
  }
  if (result.theirChange >= 1.5) sentences.push(`It helps ${them} too (${signedPts(result.theirChange)} a week), so they have a reason to say yes.`);
  else if (result.theirChange <= -1.5 && valueEdge !== 'sit') sentences.push(`It costs ${them} ${pts(-result.theirChange)} pts a week, so expect them to push back.`);

  const formEdge = factors.find((f) => f.key === 'form');
  if (formEdge?.edge === 'start') sentences.push('Recent form also favors what you get.');
  else if (formEdge?.edge === 'sit') sentences.push('Recent form favors what you give up, so you would be trading away players who are playing well right now.');

  // What moved each player's rest-of-season value: injuries, teammates, schedule (see outlook.js).
  const details = [...getPlayers.map((p) => ({ p, side: 'Get' })), ...givePlayers.map((p) => ({ p, side: 'Give' }))]
    .map(({ p, side }) => ({
      name: p.name,
      side,
      notes: [
        ...(p.tag ? [`${tagForSide(p.tag, side.toLowerCase()).label}: ${p.tag.detail.replace('this player', p.name)}`] : []),
        ...(p.outlook?.notes || []).slice(0, 2),
      ],
    }))
    .filter((d) => d.notes.length);

  let watch = null;
  const hurt = [...getHurt, ...giveHurt].filter((p) => !p.onBye);
  if (hurt.length) {
    const p = hurt[0];
    const mine = getHurt.includes(p);
    watch = `${p.name} is listed ${p.injury}. The value counts the games ${firstName(p)} is expected to miss, `
      + (mine ? 'so a quicker return makes this trade better for you.' : 'so a quicker return means you are giving up more than this shows.');
  } else if (Math.abs(result.share) <= 0.2 && Math.abs(result.myChange) < 1.5) {
    watch = 'This is close enough that a change in health or role on either side could tip it as the weeks go by.';
  }

  return {
    call: TRADE_CALLS[result.verdict.tone] || TRADE_CALLS.fair,
    headline: result.verdict.label,
    names: ['You get', 'You give'],
    factors,
    summary: sentences.join(' '),
    watch,
    details,
    basis: hasMarket
      ? `Based on trade market values from FantasyCalc (${describeMarketSettings(result.market.settings)} leagues), our rest-of-season projections for your scoring, both teams' lineups and the injury report.`
      : null,
  };
};
