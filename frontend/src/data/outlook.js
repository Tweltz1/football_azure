// Rest-of-season outlook for trade values: what a player should score per game from here on, and why.
// It weighs their own production against their preseason ranking (when they've played little), Sleeper's
// projections for the next few weeks, games they'll miss to injury, teammates coming back from (or going
// out with) injuries who share their work, and how soft or tough the defenses ahead are.

import { normalizePosition } from './startSitUtils.js';

/** Last week that counts: fantasy seasons (playoffs included) end in week 17. */
export const LAST_FANTASY_WEEK = 17;

const SKILL = ['QB', 'RB', 'WR', 'TE'];
const OUT_NOW = new Set(['out', 'ir', 'doubtful', 'pup', 'sus', 'nfi']);
// Games we expect a player to miss when Sleeper's upcoming weeks don't tell us.
const MISSED_BY_STATUS = { questionable: 0.25, doubtful: 0.8, out: 1.5, sus: 2, ir: 5, pup: 5, nfi: 5 };
// Share of an injured teammate's production that goes to a player in the same role, when we can't measure it.
const ROLE_SHARE = { RB: 0.3, WR: 0.15, TE: 0.2 };
const CROSS_SHARE = 0.08;

const round1 = (n) => Math.round(n * 10) / 10;
const mean = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : null);
const pointsOf = (points, scoring) => Number(points?.[scoring] ?? 0);
const statusOf = (player) => String(player?.injury || '').toLowerCase();
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Typical points per game for each preseason position rank, from what established players (3+ games)
 * are actually scoring: rank N's estimate is about the Nth-best scorer at the position.
 */
export const buildPriors = (players, scoring) => {
  const byPosition = {};
  (players || []).forEach((p) => {
    if ((p.gamesPlayed || 0) < 3 || !p.seasonAvg) return;
    const position = normalizePosition(p.position);
    (byPosition[position] = byPosition[position] || []).push(pointsOf(p.seasonAvg, scoring));
  });
  Object.values(byPosition).forEach((list) => list.sort((a, b) => b - a));
  return (position, rank) => {
    const list = byPosition[position];
    if (!list?.length || !rank) return null;
    // Average the neighbours so one hot or cold player doesn't set the whole tier.
    const i = Math.min(rank - 1, list.length - 1);
    return mean(list.slice(Math.max(0, i - 1), Math.min(list.length, i + 2)));
  };
};

/** Games the player is expected to miss from this week on, and how we know. */
const expectedMissed = (player, remaining, scoring) => {
  const status = statusOf(player);
  const thisWeek = OUT_NOW.has(status) ? 1 : status === 'questionable' ? 0.25 : 0;
  const upcoming = player.upcoming || [];
  const zeros = upcoming.filter((g) => pointsOf(g.points, scoring) <= 0);
  let missed;
  let backWeek = null;
  let longTerm = false;
  if (upcoming.length) {
    missed = thisWeek + zeros.length;
    backWeek = upcoming.find((g) => pointsOf(g.points, scoring) > 0)?.week ?? null;
    // Out now and not projected back in any of the weeks we can see: assume a longer absence.
    if (thisWeek >= 1 && !backWeek) {
      longTerm = true;
      missed = Math.max(missed + 2, MISSED_BY_STATUS[status] ?? 0);
    }
  } else {
    missed = MISSED_BY_STATUS[status] ?? 0;
    longTerm = (MISSED_BY_STATUS[status] ?? 0) >= 5;
  }
  return { missed: Math.min(missed, remaining), backWeek, longTerm, status };
};

const OVERLAP_PASS_CATCHERS = ['WR', 'TE'];
const sharesWork = (position, mate) => position === mate
  || (OVERLAP_PASS_CATCHERS.includes(position) && OVERLAP_PASS_CATCHERS.includes(mate));

/**
 * How teammates' injuries move this player's work from here on. Compares the games the player
 * played with and without each teammate (when both happened), and how much of the rest of the season
 * that teammate will miss against how much of the player's recent games they missed.
 */
const roleChanges = (player, ctx, healthy, remaining) => {
  const position = normalizePosition(player.position);
  if (!['RB', 'WR', 'TE'].includes(position) || !player.team) return [];
  const myGames = (player.recent || []).map((g) => ({ week: g.week, value: pointsOf(g.points, ctx.scoring) }));
  if (!myGames.length) return [];

  return (ctx.byTeam.get(player.team) || [])
    .filter((mate) => mate.id !== player.id && sharesWork(position, normalizePosition(mate.position)))
    .filter((mate) => mate.seasonAvg && pointsOf(mate.seasonAvg, ctx.scoring) >= 5)
    .map((mate) => {
      const mateWeeks = new Set((mate.recent || []).map((g) => g.week));
      const without = myGames.filter((g) => !mateWeeks.has(g.week));
      const withMate = myGames.filter((g) => mateWeeks.has(g.week));
      const missedShare = without.length / myGames.length;
      const mateOut = OUT_NOW.has(statusOf(mate));
      const mateMissed = mateOut ? expectedMissed(mate, remaining, ctx.scoring) : null;
      const futureShare = mateMissed ? Math.min(1, mateMissed.missed / remaining) : 0;
      const shift = futureShare - missedShare;
      if (Math.abs(shift) < 0.2) return null;

      const mateAvg = pointsOf(mate.seasonAvg, ctx.scoring);
      const share = normalizePosition(mate.position) === position ? ROLE_SHARE[position] : CROSS_SHARE;
      const measured = without.length && withMate.length ? mean(without.map((g) => g.value)) - mean(withMate.map((g) => g.value)) : null;
      // A measured split is noisy over a few games, so it's blended with the usual share.
      const gain = Math.min(Math.max(measured == null ? share * mateAvg : 0.5 * measured + 0.5 * share * mateAvg, 0), 0.4 * healthy);
      const change = gain * shift;
      if (Math.abs(change) < 0.4) return null;

      let note;
      if (change < 0) {
        const when = mateMissed?.backWeek ? `expected back in week ${mateMissed.backWeek}` : mateOut ? 'due back' : 'back healthy';
        note = `${mate.name} (${mate.position}) is ${when} after missing ${plural(without.length, 'game')} of ${player.name}'s last ${myGames.length}: about ${round1(-change)} fewer pts a game with less work to go around.`;
      } else {
        note = `${mate.name} (${mate.position}) is ${mate.injury}${mateMissed?.longTerm ? ' with no return in sight' : ''}: about ${round1(change)} more pts a game for ${player.name} while out.`;
      }
      return { id: mate.id, name: mate.name, change: round1(change), note };
    })
    .filter(Boolean);
};

/** How the defenses on the schedule ahead treat this position, from what they've allowed so far. */
const scheduleAhead = (player, ctx) => {
  const position = normalizePosition(player.position);
  if (!SKILL.includes(position)) return null;
  const opponents = (player.upcoming || []).map((g) => g.opponent).filter(Boolean);
  if (!opponents.length || !ctx.defense) return null;
  const rows = Object.values(ctx.defense).map((byPos) => byPos[position]).filter((r) => r && r.games >= 2);
  const average = mean(rows.map((r) => pointsOf(r.points, ctx.scoring)));
  if (!average) return null;
  const factors = opponents.map((team) => {
    const row = ctx.defense[team]?.[position];
    return row && row.games >= 2 ? pointsOf(row.points, ctx.scoring) / average : 1;
  });
  const factor = mean(factors);
  const label = factor >= 1.08 ? 'easy' : factor <= 0.92 ? 'tough' : 'average';
  // Half the gap, and capped: matchups move weekly scores less than they seem to.
  const multiplier = Math.min(1.12, Math.max(0.88, 1 + 0.5 * (factor - 1)));
  return { opponents, factor: round1(factor * 100) / 100, label, multiplier };
};

/** How a player's touches have moved lately, as a note (or null when they haven't, or for QBs, K and DST). */
const workloadNote = (player) => {
  const position = normalizePosition(player.position);
  const key = position === 'RB' ? 'rushAtt' : ['WR', 'TE'].includes(position) ? 'tgt' : null;
  if (!key || (player.gamesPlayed || 0) < 3) return null;
  const recent = (player.recent || []).slice(-3).map((g) => Number(g.stats?.[key] ?? 0));
  const season = Number(player.seasonStats?.[key] ?? 0);
  const lately = mean(recent);
  if (lately == null || season < 2) return null;
  const word = key === 'rushAtt' ? 'carries' : 'targets';
  if (lately >= season * 1.2) return `More work lately: ${round1(lately)} ${word} a game over the last 3, up from ${round1(season)} on the season.`;
  if (lately <= season * 0.8) return `Less work lately: ${round1(lately)} ${word} a game over the last 3, down from ${round1(season)} on the season.`;
  return null;
};

/**
 * One player's rest-of-season outlook. ctx: { scoring, week, defense, byTeam (team -> players),
 * priors (from buildPriors), seasonRanks (id -> preseason position rank) }.
 * Returns { value, perGame, missed, remaining, notes, ... }: value is expected points per game over the
 * games left, with missed games counted as zero.
 */
export const playerOutlook = (player, ctx) => {
  const position = normalizePosition(player.position);
  const remaining = Math.max(1, LAST_FANTASY_WEEK - (ctx.week || 1) + 1);
  const gp = player.gamesPlayed || 0;
  const season = player.seasonAvg ? pointsOf(player.seasonAvg, ctx.scoring) : null;
  const recent = (player.recent || []).slice(-3).map((g) => pointsOf(g.points, ctx.scoring));
  const lastThree = mean(recent);
  const own = gp > 0 && season != null ? (gp >= 3 && lastThree != null ? 0.65 * season + 0.35 * lastThree : season) : null;

  const rank = ctx.seasonRanks?.get(player.id) || null;
  const prior = rank && ctx.priors ? ctx.priors(position, rank) : null;
  const ownWeight = gp / (gp + 3);
  const thisWeek = pointsOf(player.points, ctx.scoring);
  const sleeperWeeks = (player.upcoming || []).map((g) => pointsOf(g.points, ctx.scoring)).filter((v) => v > 0);
  if (thisWeek > 0) sleeperWeeks.unshift(thisWeek);
  const sleeperAhead = mean(sleeperWeeks);

  let base;
  if (own != null && prior != null) base = ownWeight * own + (1 - ownWeight) * prior;
  else base = own ?? prior ?? sleeperAhead ?? 0;

  const roles = roleChanges(player, ctx, base, remaining);
  const roleChange = roles.reduce((sum, r) => sum + r.change, 0);
  const schedule = scheduleAhead(player, ctx);
  const healthy = Math.max(0, (base + roleChange) * (schedule?.multiplier ?? 1));
  const perGame = sleeperAhead != null && base > 0 ? 0.55 * healthy + 0.45 * sleeperAhead : healthy || sleeperAhead || 0;

  const availability = expectedMissed(player, remaining, ctx.scoring);
  const share = Math.max(0, (remaining - availability.missed) / remaining);
  const value = round1(perGame * share);

  const notes = [];
  const gamesLeft = plural(Math.round(remaining), 'game');
  if (availability.missed >= 0.5) {
    const missed = Math.round(availability.missed);
    if (availability.longTerm) notes.push(`${player.injury} with no return in sight in Sleeper's projections: counting about ${plural(missed, 'missed game')} of the ${gamesLeft} left.`);
    else if (availability.backWeek) notes.push(`${player.injury || 'Not expected to play'} now, projected back in week ${availability.backWeek}: about ${plural(missed, 'missed game')} of the ${gamesLeft} left.`);
    else notes.push(`${player.injury}: counting about ${plural(missed, 'missed game')} of the ${gamesLeft} left.`);
  } else if (availability.status === 'questionable') {
    notes.push('Questionable this week, but expected to play most of the way.');
  }
  if (prior != null && gp < 4) {
    notes.push(gp === 0
      ? `No games this season yet, so the value leans on the preseason ranking (${position}${rank}, worth about ${round1(prior)} a game).`
      : `Only ${plural(gp, 'game')} this season, so the value leans partly on the preseason ranking (${position}${rank}, about ${round1(prior)} a game).`);
  }
  roles.forEach((r) => notes.push(r.note));
  const workload = workloadNote(player);
  if (workload) notes.push(workload);
  if (schedule && schedule.label !== 'average') {
    notes.push(`${schedule.label === 'easy' ? 'Easy' : 'Tough'} schedule ahead: ${schedule.opponents.join(', ')} have given up ${Math.round(Math.abs(schedule.factor - 1) * 100)}% ${schedule.factor > 1 ? 'more' : 'less'} than average to ${position}s.`);
  }
  if (sleeperAhead != null && sleeperWeeks.length >= 2) notes.push(`Sleeper projects ${round1(sleeperAhead)} a game in the weeks ahead that ${player.name} is expected to play.`);

  return {
    value,
    perGame: round1(perGame),
    healthy: round1(healthy),
    own: own == null ? null : round1(own),
    prior: prior == null ? null : round1(prior),
    sleeperAhead: sleeperAhead == null ? null : round1(sleeperAhead),
    roleChange: round1(roleChange),
    schedule,
    missed: round1(availability.missed),
    backWeek: availability.backWeek,
    remaining,
    notes,
  };
};

/** Outlooks for every player, by id. players are /startsit players (points still per scoring format). */
export const buildOutlooks = (players, { scoring, week, defense, seasonRanks }) => {
  const byTeam = new Map();
  (players || []).forEach((p) => {
    if (!p.team) return;
    if (!byTeam.has(p.team)) byTeam.set(p.team, []);
    byTeam.get(p.team).push(p);
  });
  const ctx = { scoring, week, defense, byTeam, seasonRanks, priors: buildPriors(players, scoring) };
  return new Map((players || []).map((p) => [p.id, playerOutlook(p, ctx)]));
};
