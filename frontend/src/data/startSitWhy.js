// Plain-English reasons behind each Start/Sit call: why one player starts over another.
// Everything comes from the same data the lineup uses (Sleeper projections, this season's games,
// what each defense has allowed, injury reports), so the reasons change as that data does.

import { benchReason, defenseMatchup, isUnavailable, teammatesOut, trendFor, vacatedPoints } from './startSitUtils.js';
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
      detail: [a, b].map((p) => (p.matchup ? p.matchup.rankLabel.replace(' most points allowed to', ' most allowed to') : null)),
      edge: a.matchup && b.matchup ? edgeBy(a.matchup.verdictRank, b.matchup.verdictRank, 5, false) : 'even',
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
};

/**
 * Why `start` gets the spot over `sit`. Both are Start/Sit roster players (with points for the
 * chosen scoring). Returns { call, headline, summary, factors, watch, names }.
 */
export const explainPair = (start, sit, ctx, { headline } = {}) => {
  const a = profile(start, ctx);
  const b = profile(sit, ctx);
  for (const p of [a, b]) {
    if (p.matchup) p.matchup.verdictRank = Number((p.matchup.rankLabel.match(/^(\d+)/) || [])[1]) || null;
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

  let call = CALLS.lean;
  if (gap < 1.5) call = CALLS.tossup;
  else if (gap >= 3 && share >= 0.15 && forSit.length <= 1) call = CALLS.clear;

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

  return { call, headline: title, names, factors, summary, watch };
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

/** Why the player in this lineup slot starts: compared with the best bench player who could take the slot. */
export const explainStarter = (lineup, slotKey, ctx) => {
  const entry = lineup.starters.find((s) => s.slot.key === slotKey);
  if (!entry?.player) return null;
  const rivals = lineup.bench.filter((p) => entry.slot.positions.includes(p.position));
  const rival = rivals.find(healthy) || rivals[0];
  if (!rival) return explainAlone(entry.player, entry.slot.label, ctx);
  return explainPair(entry.player, rival, ctx);
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
