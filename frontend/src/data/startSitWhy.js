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
  factors.push({
    key: 'value', label: 'Trade value',
    start: pts(result.getTotal), sit: pts(result.giveTotal),
    detail: [getPicks.length ? `incl. ${getPicks.length} pick${getPicks.length > 1 ? 's' : ''}` : null, givePicks.length ? `incl. ${givePicks.length} pick${givePicks.length > 1 ? 's' : ''}` : null],
    edge: valueEdge,
  });

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
  const valueGap = pts(Math.abs(result.getTotal - result.giveTotal));
  const sentences = [];
  if (valueEdge === 'even') sentences.push(`The value is close: ${pts(result.getTotal)} coming in for ${pts(result.giveTotal)} going out.`);
  else if (valueEdge === 'start') sentences.push(`You get ${valueGap} more in trade value than you give (${pts(result.getTotal)} vs ${pts(result.giveTotal)}).`);
  else sentences.push(`You give up ${valueGap} more in trade value than you get (${pts(result.giveTotal)} vs ${pts(result.getTotal)}).`);

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

  let watch = null;
  const hurt = [...getHurt, ...giveHurt].filter((p) => !p.onBye);
  if (hurt.length) {
    const p = hurt[0];
    const mine = getHurt.includes(p);
    watch = `${p.name} is listed ${p.injury}, which lowers ${firstName(p)}'s value here. `
      + (mine ? 'If the injury clears up, this trade gets better for you.' : 'If the injury clears up, you are giving up more than this shows.');
  } else if (Math.abs(result.share) <= 0.2 && Math.abs(result.myChange) < 1.5) {
    watch = 'Values blend season averages with this week\'s projection, so a close trade like this can tip either way as the weeks go by.';
  }

  return {
    call: TRADE_CALLS[result.verdict.tone] || TRADE_CALLS.fair,
    headline: result.verdict.label,
    names: ['You get', 'You give'],
    factors,
    summary: sentences.join(' '),
    watch,
  };
};
