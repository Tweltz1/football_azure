// League-wide odds for the chat bar's team questions: power rankings, playoff, title and last-place
// chances, from a Sleeper league's schedule (startsit/league) and our rest-of-season player values.
// The rest of the regular season and the playoffs are played out thousands of times with each team's
// expected score each week and a normal week-to-week swing.
import { buildLineup, withProjections } from './startSitUtils.js';
import { buildOutlooks } from './outlook.js';

const SIMS = 5000;
// A team's weekly score swings by about a fifth of what it averages.
const SWING = 0.2;
const MIN_SWING = 12;
// How much a team's points scored so far count next to its projected lineup, once it has played.
const ACTUAL_WEIGHT = 0.25;
const ACTUAL_MIN_GAMES = 2;

/** Small seeded random number generator, so the same question gets the same answer. */
const seeded = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const normal = (rng) => {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

/** Seed order for a bracket of `size` (a power of 2): 1 v 8, 4 v 5, 2 v 7, 3 v 6 for 8 teams. */
export const bracketOrder = (size) => {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, n - seed]);
  }
  return order;
};

/**
 * A team's expected lineup points for each week from `fromWeek` to `toWeek`. players are rated
 * startsit players with an outlook (perGame when playing, missed = games expected to miss from now).
 */
export const weeklyExpected = (players, rosterSettings, fromWeek, toWeek) => {
  const result = new Map();
  for (let week = fromWeek; week <= toWeek; week += 1) {
    const ahead = week - fromWeek;
    const rated = players.map((p) => {
      const outlook = p.outlook;
      const missed = outlook?.missed || 0;
      const playing = Number(p.bye) === week ? 0 : Math.max(0, Math.min(1, 1 - (missed - ahead)));
      return { ...p, injury: null, onBye: false, points: (outlook?.perGame || 0) * playing };
    });
    result.set(week, buildLineup(rated, rosterSettings).total);
  }
  return result;
};

/** Wins, losses and points from the weeks already played (median games count as a win or loss). */
export const recordsSoFar = (season) => {
  const records = new Map(season.teams.map((t) => [t.rosterId, { wins: 0, losses: 0, ties: 0, pointsFor: 0, games: 0, weekly: [] }]));
  for (const { week, games } of season.weeks) {
    if (week > season.lastScoredWeek) break;
    const scores = [];
    for (const g of games) {
      const a = records.get(g.a);
      const b = g.b == null ? null : records.get(g.b);
      if (a) scores.push([g.a, g.aPoints]);
      if (b) scores.push([g.b, g.bPoints]);
      if (!a || !b) continue;
      if (g.aPoints > g.bPoints) { a.wins += 1; b.losses += 1; } else if (g.bPoints > g.aPoints) { b.wins += 1; a.losses += 1; } else { a.ties += 1; b.ties += 1; }
    }
    scores.forEach(([id, points]) => {
      const r = records.get(id);
      r.pointsFor += points;
      r.games += 1;
      r.weekly.push(points);
    });
    if (season.medianGame && scores.length > 1) {
      const sorted = scores.map((s) => s[1]).sort((x, y) => x - y);
      const median = (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2;
      scores.forEach(([id, points]) => {
        const r = records.get(id);
        if (points > median) r.wins += 1; else if (points < median) r.losses += 1; else r.ties += 1;
      });
    }
  }
  return records;
};

/**
 * Each team's expected score per week, from its projected best lineup scaled to how this league
 * actually scores, mixed with its own points per game so far.
 */
export const teamStrengths = (season, projectedByTeam, records) => {
  const teams = season.teams.map((t) => t.rosterId);
  const played = teams.map((id) => records.get(id)).filter((r) => r.games > 0);
  const actualAvg = played.length ? played.reduce((s, r) => s + r.pointsFor / r.games, 0) / played.length : null;
  const projectedAll = teams.flatMap((id) => [...(projectedByTeam.get(id)?.values() || [])]).filter((v) => v > 0);
  const projectedAvg = projectedAll.length ? projectedAll.reduce((s, v) => s + v, 0) / projectedAll.length : null;
  const scale = actualAvg && projectedAvg && played.every((r) => r.games >= ACTUAL_MIN_GAMES) ? actualAvg / projectedAvg : 1;

  const strengths = new Map();
  teams.forEach((id) => {
    const record = records.get(id);
    const own = record.games >= ACTUAL_MIN_GAMES ? record.pointsFor / record.games : null;
    const byWeek = new Map();
    for (const [week, points] of projectedByTeam.get(id) || []) {
      const projected = points * scale;
      byWeek.set(week, own == null ? projected : (1 - ACTUAL_WEIGHT) * projected + ACTUAL_WEIGHT * own);
    }
    strengths.set(id, byWeek);
  });
  return strengths;
};

/**
 * Plays out the rest of the season. Returns per team: playoff, title and last-place chances, average
 * wins and seed, and the playoff chance if they win or lose their next game.
 */
export const simulateSeason = (season, strengths, records, { sims = SIMS, seed = 7 } = {}) => {
  const rng = seeded(seed);
  const ids = season.teams.map((t) => t.rosterId);
  const regularWeeks = season.playoffWeekStart - 1;
  const remaining = season.weeks.filter((w) => w.week > season.lastScoredWeek && w.week <= regularWeeks);
  const nextWeek = remaining[0]?.week ?? null;
  const playoffTeams = Math.min(season.playoffTeams, ids.length);
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, playoffTeams)));
  const order = bracketOrder(size);
  const lastWeekKnown = (id) => Math.max(0, ...strengths.get(id).keys());
  const meanFor = (id, week) => {
    const byWeek = strengths.get(id);
    return byWeek.get(week) ?? byWeek.get(lastWeekKnown(id)) ?? 0;
  };
  const score = (id, week) => {
    const mean = meanFor(id, week);
    return mean + normal(rng) * Math.max(MIN_SWING, mean * SWING);
  };

  const tally = new Map(ids.map((id) => [id, {
    playoffs: 0, title: 0, last: 0, wins: 0, seed: 0, nextWin: 0, nextWinPlayoffs: 0, nextLossPlayoffs: 0,
  }]));
  for (let s = 0; s < sims; s += 1) {
    const wins = new Map(ids.map((id) => [id, records.get(id).wins + records.get(id).ties / 2]));
    const points = new Map(ids.map((id) => [id, records.get(id).pointsFor]));
    const wonNext = new Map();
    for (const { week, games } of remaining) {
      const scores = new Map(ids.map((id) => [id, score(id, week)]));
      for (const g of games) {
        if (g.b == null || !scores.has(g.a) || !scores.has(g.b)) continue;
        const winner = scores.get(g.a) >= scores.get(g.b) ? g.a : g.b;
        wins.set(winner, wins.get(winner) + 1);
        if (week === nextWeek) {
          wonNext.set(g.a, winner === g.a);
          wonNext.set(g.b, winner === g.b);
        }
      }
      if (season.medianGame) {
        const sorted = [...scores.entries()].sort((x, y) => y[1] - x[1]);
        sorted.slice(0, Math.floor(sorted.length / 2)).forEach(([id]) => wins.set(id, wins.get(id) + 1));
      }
      scores.forEach((v, id) => points.set(id, points.get(id) + v));
    }
    const standings = [...ids].sort((x, y) => wins.get(y) - wins.get(x) || points.get(y) - points.get(x));
    standings.forEach((id, index) => {
      const t = tally.get(id);
      t.wins += wins.get(id);
      t.seed += index + 1;
      const inPlayoffs = index < playoffTeams;
      if (inPlayoffs) t.playoffs += 1;
      if (wonNext.has(id)) {
        if (wonNext.get(id)) { t.nextWin += 1; if (inPlayoffs) t.nextWinPlayoffs += 1; } else if (inPlayoffs) t.nextLossPlayoffs += 1;
      }
    });
    tally.get(standings[standings.length - 1]).last += 1;

    // Playoffs: a bracket with byes for the top seeds, one week per round.
    let alive = order.map((seedNo) => (seedNo <= playoffTeams ? standings[seedNo - 1] : null));
    let week = season.playoffWeekStart;
    while (alive.length > 1) {
      const next = [];
      for (let i = 0; i < alive.length; i += 2) {
        const [a, b] = [alive[i], alive[i + 1]];
        if (a == null || b == null) next.push(a ?? b);
        else next.push(score(a, week) >= score(b, week) ? a : b);
      }
      alive = next;
      week += 1;
    }
    if (alive[0] != null) tally.get(alive[0]).title += 1;
  }

  const result = new Map();
  ids.forEach((id) => {
    const t = tally.get(id);
    const nextGames = nextWeek == null ? 0 : sims;
    const nextLosses = nextGames - t.nextWin;
    result.set(id, {
      playoffs: t.playoffs / sims,
      title: t.title / sims,
      last: t.last / sims,
      wins: t.wins / sims,
      seed: t.seed / sims,
      nextWeek,
      winNext: nextGames && remaining[0].games.some((g) => g.b != null && (g.a === id || g.b === id)) ? t.nextWin / sims : null,
      playoffsIfWin: t.nextWin ? t.nextWinPlayoffs / t.nextWin : null,
      playoffsIfLoss: nextLosses > 0 && t.nextWin < sims ? t.nextLossPlayoffs / nextLosses : null,
    });
  });
  return result;
};

/** Average expected weekly score over the weeks left, for power rankings. */
const restOfSeasonAverage = (byWeek, fromWeek) => {
  const values = [...byWeek.entries()].filter(([week]) => week >= fromWeek).map(([, v]) => v);
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
};

/**
 * Everything the team questions need. ratedRoster(team) returns the team's players rated with an
 * outlook. myRosterId is the user's team in this league (or null).
 */
export const leagueOutlook = (season, { ratedRoster, rosterSettings, myRosterId = null, sims = SIMS }) => {
  const regularWeeks = season.playoffWeekStart - 1;
  const fromWeek = Math.min(season.lastScoredWeek + 1, season.playoffWeekStart);
  const rounds = Math.ceil(Math.log2(Math.max(2, Math.min(season.playoffTeams, season.teams.length))));
  const toWeek = season.playoffWeekStart + rounds - 1;
  const projectedByTeam = new Map(season.teams.map((t) => [t.rosterId, weeklyExpected(ratedRoster(t), rosterSettings, fromWeek, toWeek)]));
  const records = recordsSoFar(season);
  const strengths = teamStrengths(season, projectedByTeam, records);
  const odds = simulateSeason(season, strengths, records, { sims });
  const remainingWeeks = Math.max(0, regularWeeks - season.lastScoredWeek);

  const teams = season.teams.map((t) => {
    const record = records.get(t.rosterId);
    const strength = restOfSeasonAverage(strengths.get(t.rosterId), fromWeek);
    const recent = record.weekly.slice(-3);
    const recentAvg = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : null;
    const seasonAvg = record.games ? record.pointsFor / record.games : null;
    // Who they play the rest of the regular season, and how strong those teams are.
    const opponents = season.weeks
      .filter((w) => w.week > season.lastScoredWeek && w.week <= regularWeeks)
      .map((w) => {
        const g = w.games.find((game) => game.a === t.rosterId || game.b === t.rosterId);
        const other = g ? (g.a === t.rosterId ? g.b : g.a) : null;
        return other == null ? null : { week: w.week, rosterId: other };
      })
      .filter(Boolean);
    return {
      rosterId: t.rosterId,
      name: t.name,
      mine: t.rosterId === myRosterId,
      record,
      strength,
      seasonAvg,
      recentAvg,
      opponents,
      ...odds.get(t.rosterId),
    };
  });
  const byId = new Map(teams.map((t) => [t.rosterId, t]));
  const averageStrength = teams.reduce((s, t) => s + t.strength, 0) / Math.max(1, teams.length);
  teams.forEach((t) => {
    const opp = t.opponents.map((o) => byId.get(o.rosterId)?.strength).filter((v) => v != null);
    t.scheduleStrength = opp.length ? opp.reduce((s, v) => s + v, 0) / opp.length - averageStrength : null;
  });
  const powerOrder = [...teams].sort((a, b) => b.strength - a.strength);
  powerOrder.forEach((t, index) => { t.powerRank = index + 1; });
  const standings = [...teams].sort((a, b) => (b.record.wins + b.record.ties / 2) - (a.record.wins + a.record.ties / 2) || b.record.pointsFor - a.record.pointsFor);
  standings.forEach((t, index) => { t.standing = index + 1; });
  return {
    leagueName: season.leagueName,
    teams,
    byId,
    powerOrder,
    standings,
    playoffTeams: Math.min(season.playoffTeams, teams.length),
    playoffWeekStart: season.playoffWeekStart,
    remainingWeeks,
    nextWeek: teams[0]?.nextWeek ?? null,
    medianGame: season.medianGame,
  };
};

/**
 * Which league team is the user's: the one whose roster shares the most players with theirs.
 */
export const findMyTeam = (season, myPlayerIds) => {
  let best = null;
  let bestOverlap = 0;
  for (const team of season.teams) {
    const overlap = team.players.filter((id) => myPlayerIds.has(id)).length;
    if (overlap > bestOverlap) { best = team.rosterId; bestOverlap = overlap; }
  }
  return best;
};

/**
 * League odds straight from the page's data: season is the startsit/league response, projections the
 * /startsit response for this week (already in the league's scoring), byes each player's bye week.
 */
export const leagueOutlookFrom = (season, {
  projections, scoring, rosterSettings, myIds = new Set(), seasonRanks = null, byes = new Map(), sims = SIMS,
}) => {
  const players = projections?.players || [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const outlooks = buildOutlooks(players, { scoring, week: projections?.week, defense: projections?.defense, seasonRanks: seasonRanks || new Map() });
  const ratedRoster = (team) => withProjections(team.players.map((id) => byId.get(id)).filter(Boolean), byId, scoring, projections?.week)
    .map((p) => ({ ...p, bye: byes.get(p.id) ?? null, outlook: outlooks.get(p.id) || null }));
  return leagueOutlook(season, { ratedRoster, rosterSettings, myRosterId: findMyTeam(season, myIds), sims });
};

/** "78%", with the ends kept honest. */
export const percent = (chance) => {
  if (chance == null) return '';
  if (chance <= 0) return '0%';
  if (chance < 0.01) return 'under 1%';
  if (chance >= 1) return '100%';
  if (chance > 0.99) return 'over 99%';
  return `${Math.round(chance * 100)}%`;
};

const ordinal = (n) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${suffix}`;
};

export const recordText = (record) => `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ''}`;

/** Where a team is headed, in a few plain sentences. */
export const trajectoryText = (team, outlook) => {
  const who = team.mine ? 'You are' : `${team.name} is`;
  const parts = [];
  parts.push(team.record.games
    ? `${who} ${recordText(team.record)}, ${ordinal(team.standing)} of ${outlook.teams.length}.`
    : `${who} yet to play.`);
  if (outlook.remainingWeeks > 0) {
    const finalWins = Math.round(team.wins);
    const games = team.record.wins + team.record.losses + team.record.ties + outlook.remainingWeeks * (outlook.medianGame ? 2 : 1);
    const chance = percent(team.playoffs);
    parts.push(`${chance[0].toUpperCase()}${chance.slice(1)} to make the playoffs (top ${outlook.playoffTeams}), finishing about ${finalWins}-${Math.max(0, games - finalWins)}.`);
    if (team.playoffsIfWin != null && team.playoffsIfLoss != null && Math.abs(team.playoffsIfWin - team.playoffsIfLoss) >= 0.03) {
      parts.push(`Win in week ${outlook.nextWeek} and that goes to ${percent(team.playoffsIfWin)}; lose and it's ${percent(team.playoffsIfLoss)}.`);
    }
    if (team.scheduleStrength != null && Math.abs(team.scheduleStrength) >= 4) {
      parts.push(`The rest of the schedule is ${team.scheduleStrength > 0 ? 'tougher' : 'easier'} than average (opponents project ${Math.abs(Math.round(team.scheduleStrength))} pts a week ${team.scheduleStrength > 0 ? 'more' : 'less'}).`);
    }
  } else {
    parts.push(team.playoffs >= 0.5 ? `In the playoffs as the ${ordinal(Math.round(team.seed))} seed.` : 'Out of the playoffs.');
  }
  if (team.recentAvg != null && team.seasonAvg != null && team.record.games >= 4) {
    const diff = team.recentAvg - team.seasonAvg;
    if (Math.abs(diff) >= 6) parts.push(`Scoring is ${diff > 0 ? 'up' : 'down'} lately: ${Math.round(team.recentAvg)} a week over the last 3 vs ${Math.round(team.seasonAvg)} for the season.`);
  }
  parts.push(`Title chance ${percent(team.title)}, last place ${percent(team.last)}.`);
  return parts.join(' ');
};

/** percent() for narrow table cells. */
export const shortPercent = (chance) => percent(chance).replace('under ', '<').replace('over ', '>');
