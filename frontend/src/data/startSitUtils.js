// Helpers for the Start/Sit page: line projections up with a roster and pick the best lineup.

export const SCORING_OPTIONS = [
  { value: 'ppr', label: 'PPR' },
  { value: 'half', label: 'Half PPR' },
  { value: 'std', label: 'Standard' },
];

// Statuses that mean the player won't play (or very likely won't); they are kept off the starting lineup.
const UNAVAILABLE = new Set(['out', 'ir', 'doubtful', 'pup', 'sus', 'na', 'cov', 'dnr']);

const FLEX_POSITIONS = ['RB', 'WR', 'TE'];
const SUPERFLEX_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

export const STANDARD_LINEUP = { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, superFlex: 0, k: 1, def: 1 };

export const normalizePosition = (position) => {
  const value = String(position || '').toUpperCase();
  return value === 'DEF' || value === 'D/ST' ? 'DST' : value;
};

export const isUnavailable = (injury) => UNAVAILABLE.has(String(injury || '').toLowerCase());

const toCount = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * Starting slots for a league's roster settings, in display order. Settings can also carry an explicit
 * `slots` list ([{ label, positions }]), as imported Sleeper leagues do.
 */
export const buildSlots = (rosterSettings = STANDARD_LINEUP) => {
  if (Array.isArray(rosterSettings?.slots)) {
    return rosterSettings.slots.map((slot, index) => ({
      key: `${slot.label}-${index}`,
      label: slot.label,
      positions: (slot.positions || []).map(normalizePosition),
    }));
  }
  const settings = { ...STANDARD_LINEUP, ...rosterSettings };
  const slots = [];
  const add = (label, positions, count) => {
    for (let i = 0; i < toCount(count); i += 1) slots.push({ key: `${label}-${i}`, label, positions });
  };
  add('QB', ['QB'], settings.qb);
  add('RB', ['RB'], settings.rb);
  add('WR', ['WR'], settings.wr);
  add('TE', ['TE'], settings.te);
  add('K', ['K'], settings.k);
  add('DST', ['DST'], settings.def);
  // Flex goes before superflex: flex can't use a QB, so this leaves the best QB for superflex.
  add('FLEX', FLEX_POSITIONS, settings.flex);
  add('SUPERFLEX', SUPERFLEX_POSITIONS, settings.superFlex);
  return slots;
};

/** Joins roster players with this week's projections. */
export const withProjections = (players, projectionsById, scoring, week) => players.map((player) => {
  const projection = projectionsById.get(player.id);
  const onBye = Number(player.bye) > 0 && Number(player.bye) === Number(week);
  return {
    id: player.id,
    name: projection?.name || player.name,
    position: normalizePosition(projection?.position || player.position),
    team: projection?.team || player.team,
    opponent: projection?.opponent || null,
    injury: projection?.injury || null,
    onBye: !!projection?.onBye || (onBye && !projection),
    points: projection ? Number(projection.points?.[scoring] ?? 0) : null,
    recent: projection?.recent || [],
    seasonAvg: projection?.seasonAvg || null,
    gamesPlayed: projection?.gamesPlayed || 0,
    seasonStats: projection?.seasonStats || null,
    upcoming: projection?.upcoming || [],
    usage: projection?.usage || null,
    spread: projection?.spread || null,
    age: player.age ?? null,
  };
});

const sortByPoints = (a, b) => (b.points ?? -1) - (a.points ?? -1) || a.name.localeCompare(b.name);

/** Best lineup by projection. Returns { starters: [{slot, player|null}], bench: [player], total }. */
export const buildLineup = (players, rosterSettings) => {
  const slots = buildSlots(rosterSettings);
  const available = players
    .filter((p) => p.points != null && !p.onBye && !isUnavailable(p.injury))
    .sort(sortByPoints);
  const used = new Set();

  // Fill the narrowest slots first (QB before FLEX before SUPERFLEX), then show them in league order.
  const fillOrder = slots.map((slot, index) => ({ slot, index })).sort((a, b) => a.slot.positions.length - b.slot.positions.length || a.index - b.index);
  const picks = new Map();
  fillOrder.forEach(({ slot }) => {
    const pick = available.find((p) => !used.has(p.id) && slot.positions.includes(p.position));
    if (pick) used.add(pick.id);
    picks.set(slot.key, pick || null);
  });
  const starters = slots.map((slot) => ({ slot, player: picks.get(slot.key) }));

  const bench = players.filter((p) => !used.has(p.id)).sort(sortByPoints);
  const total = starters.reduce((sum, s) => sum + (s.player?.points || 0), 0);
  return { starters, bench, total: Math.round(total * 10) / 10 };
};

/** Why a bench player sits, for the bench list. */
export const benchReason = (player) => {
  if (player.onBye) return 'On bye';
  if (isUnavailable(player.injury)) return player.injury;
  if (player.points == null) return 'No projection';
  return null;
};

/** Head-to-head verdict for the compare tool. */
export const compareVerdict = (players) => {
  // Players who can't play this week (out, on bye) only win when nobody else can play either.
  const scored = [...players].filter((p) => p.points != null).sort(sortByPoints);
  const ranked = [...scored.filter((p) => !benchReason(p)), ...scored.filter((p) => benchReason(p))];
  if (ranked.length < 2) return null;
  const [first, second] = ranked;
  const margin = Math.round((first.points - second.points) * 10) / 10;
  return { winner: first, runnerUp: second, margin, close: margin < 1.5 };
};

const average = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);
const round1 = (value) => Math.round(value * 10) / 10;

/**
 * How a player has been trending: average of their last 3 games against their season average.
 * direction is 'up' or 'down' when the gap is at least 15% (and 1.5 pts), else 'flat'.
 */
export const trendFor = (player, scoring) => {
  const recent = (player?.recent || []).map((game) => ({ ...game, value: Number(game.points?.[scoring] ?? 0) }));
  const lastThree = average(recent.slice(-3).map((game) => game.value));
  const season = player?.seasonAvg ? Number(player.seasonAvg[scoring] ?? 0) : null;
  let direction = 'flat';
  if (lastThree != null && season != null && season > 0) {
    const gap = lastThree - season;
    if (Math.abs(gap) >= 1.5 && Math.abs(gap) / season >= 0.15) direction = gap > 0 ? 'up' : 'down';
  }
  return {
    recent,
    lastThree: lastThree == null ? null : round1(lastThree),
    season: season == null ? null : round1(season),
    gamesPlayed: player?.gamesPlayed || 0,
    direction,
  };
};

// Teammates whose absence moves touches: skill players only, and not kickers or defenses.
const SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const HURT = new Set(['out', 'ir', 'doubtful', 'questionable', 'pup', 'sus']);

/** Injured teammates of a player, biggest season average first. */
export const teammatesOut = (player, allPlayers, scoring) => {
  if (!player?.team || !SKILL_POSITIONS.includes(player.position)) return [];
  return (allPlayers || [])
    .filter((p) => p.team === player.team && p.id !== player.id && SKILL_POSITIONS.includes(normalizePosition(p.position)))
    .filter((p) => HURT.has(String(p.injury || '').toLowerCase()))
    .map((p) => ({
      id: p.id,
      name: p.name,
      position: normalizePosition(p.position),
      injury: p.injury,
      seasonAvg: p.seasonAvg ? round1(Number(p.seasonAvg[scoring] ?? 0)) : null,
      // Same position, or any pass catcher when the player is one too, competes for the same work.
      overlaps: normalizePosition(p.position) === player.position
        || (['WR', 'TE', 'RB'].includes(player.position) && ['WR', 'TE'].includes(normalizePosition(p.position))),
    }))
    .sort((a, b) => (b.seasonAvg ?? 0) - (a.seasonAvg ?? 0));
};

/** Points lost to injured teammates who do the same job, as a rough "extra work available" number. */
export const vacatedPoints = (teammates) => round1(
  teammates.filter((t) => t.overlaps && !['questionable'].includes(String(t.injury).toLowerCase()))
    .reduce((sum, t) => sum + (t.seasonAvg || 0), 0),
);

const ordinal = (n) => {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
};

const ypc = (box) => (box.rushAtt > 0 ? Math.round((box.rushYd / box.rushAtt) * 10) / 10 : 0);

/** Stats worth showing for a position, as [label, value from a box score]. */
const DEFENSE_STATS = {
  QB: [['Pass yds', (b) => b.passYd], ['Pass TD', (b) => b.passTd], ['INT', (b) => b.int], ['Rush yds', (b) => b.rushYd]],
  RB: [['Carries', (b) => b.rushAtt], ['Rush yds', (b) => b.rushYd], ['Yds/carry', ypc], ['Catches', (b) => b.rec], ['TDs', (b) => b.rushTd + b.recTd]],
  WR: [['Targets', (b) => b.tgt], ['Catches', (b) => b.rec], ['Rec yds', (b) => b.recYd], ['Rec TD', (b) => b.recTd]],
  TE: [['Targets', (b) => b.tgt], ['Catches', (b) => b.rec], ['Rec yds', (b) => b.recYd], ['Rec TD', (b) => b.recTd]],
};

/**
 * How this week's opponent has defended the player's position, next to the league average.
 * Returns null when there is no data (week 1, kickers, defenses).
 */
export const defenseMatchup = (player, defense, scoring) => {
  const stats = DEFENSE_STATS[player?.position];
  const row = player?.opponent && defense?.[player.opponent]?.[player.position];
  if (!stats || !row) return null;

  const all = Object.values(defense || {}).map((byPosition) => byPosition[player.position]).filter(Boolean);
  const leagueAvg = (pick) => (all.length ? Math.round((all.reduce((sum, r) => sum + pick(r), 0) / all.length) * 10) / 10 : 0);
  const pointsOf = (r) => Number(r.points?.[scoring] ?? 0);

  const third = Math.ceil(row.teams / 3);
  // Two games of defense numbers said nothing about the next game in past seasons (scripts/model),
  // so before the third game every matchup reads as average.
  const early = row.games < 3;
  const verdict = early ? 'average' : row.rank <= third ? 'good' : row.rank > row.teams - third ? 'tough' : 'average';
  return {
    opponent: player.opponent,
    position: player.position,
    games: row.games,
    rank: row.rank,
    // Rank 1 gives up the most points, so a high rank reads better as "fewest" (29th of 32 = 4th fewest).
    rankLabel: row.rank <= row.teams / 2
      ? `${ordinal(row.rank)} most points allowed to ${player.position}s, of ${row.teams} teams`
      : `${ordinal(row.teams - row.rank + 1)} fewest points allowed to ${player.position}s, of ${row.teams} teams`,
    // Other teams' lead player at this position in each recent game against this defense, newest first.
    notable: (row.recentGames || [])
      .filter((game) => game.id !== player.id)
      .map((game) => ({ ...game, value: pointsOf(game) })),
    verdict,
    early,
    rows: [
      { label: 'Fantasy pts', value: pointsOf(row), league: leagueAvg(pointsOf), higherIsEasier: true },
      ...stats.map(([label, pick]) => ({
        label,
        value: Math.round(pick(row.box) * 10) / 10,
        league: leagueAvg((r) => pick(r.box)),
        higherIsEasier: label !== 'INT',
      })),
    ],
  };
};

/** One past game as a short stat line, e.g. "6 rec, 90 yds, 1 TD". */
export const boxLine = (position, box) => {
  if (!box) return '';
  const parts = [];
  if (position === 'QB') {
    parts.push(`${box.passYd} pass yds`, `${box.passTd} TD`);
    if (box.int) parts.push(`${box.int} INT`);
    if (box.rushYd) parts.push(`${box.rushYd} rush yds`);
  } else if (position === 'RB') {
    parts.push(`${box.rushAtt} car`, `${box.rushYd} yds`);
    if (box.rec) parts.push(`${box.rec} rec`);
  } else if (position === 'WR' || position === 'TE') {
    parts.push(`${box.rec}/${box.tgt} rec`, `${box.recYd} yds`);
  }
  const tds = position === 'QB' ? box.rushTd : box.rushTd + box.recTd;
  if (tds) parts.push(`${tds} TD${tds === 1 ? '' : 's'}${position === 'QB' ? ' rush' : ''}`);
  return parts.join(', ');
};

/**
 * Changes from the lineup someone has set (e.g. on Sleeper) to the recommended one, best upgrade first:
 * [{ start: player | null, sit: player | null, shuffle, gain }]. Each player to start is paired with a
 * starter whose slot they can actually fill (startersBySlot says who is in which slot now); shuffle
 * means the swap only works after other starters move between slots. start is null for a starter to
 * bench with nobody taking their place.
 */
export const lineupChanges = (lineup, currentStarterIds, roster, startersBySlot = null) => {
  const current = new Set(currentStarterIds || []);
  const recommended = new Set(lineup.starters.map((s) => s.player?.id).filter(Boolean));
  const byId = new Map(roster.map((p) => [p.id, p]));
  const toStart = lineup.starters.map((s) => s.player).filter((p) => p && !current.has(p.id))
    .sort((a, b) => (b.points || 0) - (a.points || 0));
  const toSit = [...current].filter((id) => !recommended.has(id)).map((id) => byId.get(id)).filter(Boolean)
    .sort((a, b) => (a.points ?? -1) - (b.points ?? -1));

  // The slot a current starter is in on Sleeper; without that, every slot their position could fill.
  const slotted = Array.isArray(startersBySlot) && startersBySlot.length === lineup.starters.length;
  const slotsOf = (player) => {
    const index = slotted ? startersBySlot.indexOf(player.id) : -1;
    if (index >= 0) return [lineup.starters[index].slot];
    return lineup.starters.map((s) => s.slot).filter((slot) => slot.positions.includes(player.position));
  };
  const sharedSlots = (start, sit) => slotsOf(sit).filter((slot) => slot.positions.includes(start.position)).length;

  // Pair each player to start with a starter whose slot they can legally take: same position first,
  // then someone not already paired, then the most slots in common. An earlier pair is re-paired
  // only when that is the only way to fit a later player.
  const startForSit = new Map();
  const assign = (start, seen) => {
    const rank = (sit) => [sit.position === start.position ? 0 : 1, startForSit.has(sit.id) ? 1 : 0, -sharedSlots(start, sit)];
    const candidates = toSit
      .filter((sit) => sharedSlots(start, sit) > 0)
      .sort((a, b) => {
        const [ra, rb] = [rank(a), rank(b)];
        return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
      });
    return candidates.some((sit) => {
      if (seen.has(sit.id)) return false;
      seen.add(sit.id);
      const holder = startForSit.get(sit.id);
      if (holder && !assign(holder, seen)) return false;
      startForSit.set(sit.id, start);
      return true;
    });
  };
  toStart.forEach((start) => assign(start, new Set()));
  const sitForStart = new Map([...startForSit].map(([sitId, start]) => [start.id, byId.get(sitId)]));

  // Anyone left over only fits after other starters move between slots (or fills an empty slot).
  const leftoverSits = toSit.filter((sit) => !startForSit.has(sit.id));
  const emptySlots = slotted ? startersBySlot.filter((id) => !id).length : Math.max(0, lineup.starters.length - current.size);
  let leftoverIndex = 0;
  let emptyUsed = 0;
  const changes = toStart.map((start) => {
    let sit = sitForStart.get(start.id) || null;
    let shuffle = false;
    if (!sit) {
      if (emptyUsed < emptySlots) emptyUsed += 1;
      else {
        sit = leftoverSits[leftoverIndex] || null;
        leftoverIndex += 1;
        shuffle = true;
      }
    }
    // A starter who won't play scores nothing, whatever their projection says.
    const sitPoints = sit && !benchReason(sit) ? (sit.points || 0) : 0;
    return { start, sit, shuffle, gain: Math.round(((start.points || 0) - sitPoints) * 10) / 10 };
  });
  const benchOnly = leftoverSits.slice(leftoverIndex).map((sit) => ({ start: null, sit, shuffle: false, gain: 0 }));
  return [...changes, ...benchOnly];
};

// ---- Trades -----------------------------------------------------------------------------

// How much an injury designation cuts a player's rest-of-season value.
const INJURY_DISCOUNT = { out: 0.85, doubtful: 0.9, questionable: 0.97, ir: 0.35, pup: 0.4, sus: 0.8 };

/**
 * A player's expected points per game for the rest of the season. Uses the player's outlook when the
 * page has worked one out (see outlook.js: injuries, teammates, schedule, Sleeper's weeks ahead);
 * otherwise mostly their season average, nudged by this week's projection, discounted for injuries.
 */
export const tradeValue = (player, scoring) => {
  if (!player) return 0;
  if (player.outlook) return player.outlook.value;
  const projection = Number(player.points ?? 0);
  const average = player.seasonAvg ? Number(player.seasonAvg[scoring] ?? 0) : 0;
  let value;
  if ((player.gamesPlayed || 0) >= 2 && average > 0) value = 0.6 * average + 0.4 * (projection > 0 ? projection : average);
  else value = projection > 0 ? projection : average;
  const discount = INJURY_DISCOUNT[String(player.injury || '').toLowerCase()] ?? 1;
  return Math.round(value * discount * 10) / 10;
};

/**
 * Value of the last starter-quality player at each position in a league this size: anyone at or
 * below it is easy to find on waivers, so only the value above it counts in a trade.
 */
export const replacementLevels = (allPlayers, teamCount, rosterSettings, scoring) => {
  const slots = buildSlots(rosterSettings);
  const starters = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  slots.forEach((slot) => {
    if (slot.positions.length === 1) starters[slot.positions[0]] = (starters[slot.positions[0]] || 0) + 1;
    else if (slot.positions.includes('QB')) { starters.QB += 0.8; starters.RB += 0.1; starters.WR += 0.1; }
    else {
      const share = { RB: 0.4, WR: 0.5, TE: 0.1 };
      const allowed = slot.positions.filter((p) => share[p]);
      const total = allowed.reduce((sum, p) => sum + share[p], 0) || 1;
      allowed.forEach((p) => { starters[p] += share[p] / total; });
    }
  });

  const teams = Math.max(2, teamCount || 10);
  const levels = {};
  Object.keys(starters).forEach((position) => {
    const values = (allPlayers || [])
      .filter((p) => normalizePosition(p.position) === position)
      .map((p) => tradeValue(p, scoring))
      .sort((a, b) => b - a);
    const index = Math.max(0, Math.round(teams * Math.max(starters[position], 1)) - 1);
    levels[position] = values.length ? values[Math.min(index, values.length - 1)] : 0;
  });
  return levels;
};

// Dynasty: how much of a player's value is still ahead of them, by position and age.
// Running backs fade earliest, quarterbacks last.
const AGE_CURVES = {
  RB: [[24, 1.3], [25, 1.15], [26, 1], [27, 0.85], [28, 0.7], [Infinity, 0.5]],
  WR: [[24, 1.3], [26, 1.2], [27, 1.1], [28, 1], [29, 0.85], [30, 0.7], [Infinity, 0.55]],
  TE: [[25, 1.25], [28, 1.1], [29, 0.95], [30, 0.8], [Infinity, 0.6]],
  QB: [[26, 1.25], [30, 1.1], [33, 1], [35, 0.8], [Infinity, 0.6]],
};

export const ageMultiplier = (position, age) => {
  const curve = AGE_CURVES[normalizePosition(position)];
  if (!curve || !Number.isFinite(Number(age)) || !age) return 1;
  const years = Math.floor(Number(age));
  return curve.find(([maxAge]) => years <= maxAge)[1];
};

// Rookie picks in the same units as player trade value: a 1st is worth about a solid starter.
const PICK_ROUND_VALUE = { 1: 6, 2: 2.5, 3: 1 };

export const pickValue = (pick, firstSeason) => {
  const base = PICK_ROUND_VALUE[pick.round] ?? 0.4;
  const yearsOut = Math.max(0, Number(pick.season) - Number(firstSeason || pick.season));
  return Math.round(base * 0.85 ** yearsOut * 10) / 10;
};

const ordinalRound = (round) => ({ 1: '1st', 2: '2nd', 3: '3rd' })[round] || `${round}th`;
export const pickLabel = (pick, ownTeamName) => `${pick.season} ${ordinalRound(pick.round)}${pick.originalTeam && pick.originalTeam !== ownTeamName ? ` (from ${pick.originalTeam})` : ''}`;

// Best weekly lineup when every player is valued at their rest-of-season points per game.
const seasonLineup = (players, rosterSettings, scoring) => buildLineup(
  players.map((p) => ({ ...p, points: tradeValue(p, scoring), onBye: false, injury: null })),
  rosterSettings,
);
/** Starters (by id) of a team's best lineup when every player is valued on rest-of-season points per game. */
export const seasonStarterIds = (players, rosterSettings, scoring) => new Set(
  seasonLineup(players, rosterSettings, scoring).starters.filter((s) => s.player).map((s) => s.player.id),
);
/** Whether a roster can fill every lineup slot (ignoring this week's injuries and byes). */
export const fillsLineup = (players, rosterSettings, scoring) => seasonLineup(players, rosterSettings, scoring).starters.every((s) => s.player);
const slotById = (lineup) => new Map(lineup.starters.filter((s) => s.player).map((s) => [s.player.id, s.slot.label]));

// A weekly lineup change this size (pts) or more counts as helping or hurting the team.
const FIT_THRESHOLD = 1.5;

/** Combines the value verdict with how the trade changes your own starting lineup. */
const fitVerdict = (valueVerdict, myChange, getBenched) => {
  const pts = Math.abs(myChange).toFixed(1);
  const value = valueVerdict.tone;
  if (myChange >= FIT_THRESHOLD) {
    if (value === 'lose') {
      return { tone: 'fair', label: 'Overpaying, but it fills a need', detail: `You give up more value than you get, but your starting lineup gains ${pts} pts a week.` };
    }
    if (value === 'fair') {
      return { tone: 'win', label: 'Good trade for your team', detail: `Fair value, and your starting lineup gains ${pts} pts a week.` };
    }
    return { ...valueVerdict, detail: `${valueVerdict.detail} Your starting lineup also gains ${pts} pts a week.` };
  }
  if (myChange <= -FIT_THRESHOLD) {
    if (value === 'win') {
      return {
        tone: 'fair',
        label: 'Wins on value, but weakens your lineup',
        detail: `You get more value, but your starting lineup drops ${pts} pts a week. Worth it only if you have depth or are building for later.`,
      };
    }
    if (value === 'fair') {
      return { tone: 'lose', label: 'Fair value, but weakens your lineup', detail: `Your starting lineup drops ${pts} pts a week.` };
    }
    return { ...valueVerdict, detail: `${valueVerdict.detail} Your starting lineup also drops ${pts} pts a week.` };
  }
  const benchNote = getBenched ? ' What you get would sit on your bench.' : '';
  return { ...valueVerdict, detail: `${valueVerdict.detail} Your starting lineup barely changes.${benchNote}` };
};

/**
 * Rates a trade. give/get are players (with projections attached); myRoster/theirRoster are the full
 * rosters before the trade. Returns per-player values and roles on your team, totals, each side's weekly
 * lineup change, the value-only verdict, and a verdict that also weighs how your own lineup changes.
 */
/**
 * Our own trade value for a player, from projections alone: mostly what they score above a waiver
 * starter, plus a little raw scoring so depth isn't worth zero (and adjusted for age in dynasty).
 */
export const ownTradeScore = (p, levels, scoring, dynasty) => {
  const value = tradeValue(p, scoring);
  const surplus = Math.max(0, value - (levels[p.position] ?? 0));
  const ageFactor = dynasty ? ageMultiplier(p.position, p.age) : 1;
  return { value, surplus, ageFactor, score: (surplus + 0.2 * value) * ageFactor };
};

/** "12-team, superflex, half PPR, dynasty" for a set of market settings. */
export const describeMarketSettings = (s) => [
  `${s.teams}-team`, s.qbs === 2 ? 'superflex' : '1QB', s.ppr === 1 ? 'PPR' : s.ppr === 0.5 ? 'half PPR' : 'standard', s.dynasty ? 'dynasty' : 'redraft',
].join(', ');

// A player is a buy-low or sell-high when the market and our projections differ by this much.
const TAG_RATIO = 1.35;
const TAG_MIN_GAP = 1.5;

/** Buy-low / sell-high when the market and our projections disagree a lot (both on our value scale). */
export const marketTag = (own, market) => {
  if (market == null) return null;
  if (market >= own * TAG_RATIO && market - own >= TAG_MIN_GAP) return { key: 'sell', label: 'Sell high', detail: 'The trade market values this player more than our projections do.' };
  if (own >= market * TAG_RATIO && own - market >= TAG_MIN_GAP) return { key: 'buy', label: 'Buy low', detail: 'Our projections value this player more than the trade market does.' };
  return null;
};

/** The tag as it reads from your side of a trade: a sell-high player you'd be getting is a buy-high. */
export const tagForSide = (tag, side) => {
  if (!tag) return null;
  if (side === 'give') return tag.key === 'sell' ? tag : { ...tag, label: 'Selling low' };
  return tag.key === 'buy' ? tag : { ...tag, label: 'Buying high' };
};

// In a 2-for-1 (or 3-for-1...), the extra players count at a share of their value on the side getting
// more bodies: the roster spot they take has to come from somewhere, and one who starts pushes out a
// starter that team already has, so a single better player is worth more than the sum of two lesser
// ones (the trade market prices it the same way).
const BENCH_EXTRA_SHARE = 0.5;
const STARTER_EXTRA_SHARE = 0.75;

export const analyzeTrade = ({
  give, get, myRoster, theirRoster, rosterSettings, scoring, allPlayers, teamCount,
  dynasty = false, givePicks = [], getPicks = [], firstPickSeason = null, levels: knownLevels = null, market = null,
}) => {
  const levels = knownLevels || replacementLevels(allPlayers, teamCount, rosterSettings, scoring);
  const round1 = (n) => Math.round(n * 10) / 10;
  const rate = (p) => {
    const own = ownTradeScore(p, levels, scoring, dynasty);
    const marketValue = market?.players?.[p.id]?.value ?? null;
    const marketScore = marketValue == null ? null : market.toScore(marketValue);
    const score = marketScore == null ? own.score : market.weight * marketScore + (1 - market.weight) * own.score;
    return {
      ...p,
      value: own.value,
      surplus: round1(own.surplus),
      ageFactor: own.ageFactor,
      ownScore: round1(own.score),
      marketValue,
      marketScore: marketScore == null ? null : round1(marketScore),
      tag: marketTag(own.score, marketScore),
      score: round1(score),
      display: market ? market.toMarket(score) : null,
    };
  };
  const ratePick = (pick) => {
    const own = pickValue(pick, firstPickSeason);
    const marketValue = market?.picks?.[`${pick.season}-${pick.round}`] ?? null;
    const marketScore = marketValue == null ? null : market.toScore(marketValue);
    const score = marketScore == null ? own : 0.5 * marketScore + 0.5 * own;
    return { ...pick, ownScore: own, marketValue, score: round1(score), display: market ? market.toMarket(score) : null };
  };
  const giveRated = [...give.map(rate), ...givePicks.map(ratePick)];
  const getRated = [...get.map(rate), ...getPicks.map(ratePick)];
  const sum = (list, key = 'score') => round1(list.reduce((total, p) => total + (p[key] || 0), 0));

  const giveIds = new Set(give.map((p) => p.id));
  const getIds = new Set(get.map((p) => p.id));
  const myAfter = [...myRoster.filter((p) => !giveIds.has(p.id)), ...get];
  const theirAfter = [...theirRoster.filter((p) => !getIds.has(p.id)), ...give];
  const round = (n) => Math.round(n * 10) / 10;
  const myLineupBefore = seasonLineup(myRoster, rosterSettings, scoring);
  const myLineupAfter = seasonLineup(myAfter, rosterSettings, scoring);
  const myChange = round(myLineupAfter.total - myLineupBefore.total);
  const theirChange = round(seasonLineup(theirAfter, rosterSettings, scoring).total - seasonLineup(theirRoster, rosterSettings, scoring).total);

  // Where each player fits on your team: who you give up from your lineup, and where new players would start.
  const startingBefore = slotById(myLineupBefore);
  const startingAfter = slotById(myLineupAfter);
  giveRated.forEach((p) => {
    if (p.round) return;
    const slot = startingBefore.get(p.id);
    p.role = slot ? `your starting ${slot}` : 'your bench';
  });
  getRated.forEach((p) => {
    if (p.round) return;
    const slot = startingAfter.get(p.id);
    p.role = slot ? `would start at ${slot}` : 'would sit on your bench';
  });
  const getPlayers = getRated.filter((p) => !p.round);
  const getBenched = getPlayers.length > 0 && getPlayers.every((p) => !startingAfter.has(p.id));

  // 2-for-1 (or 3-for-1...) adjustment: the side getting more players has to cut someone, so its
  // extra players (the least valuable ones, benched first) count for less. The side getting the best player wins.
  const givePlayers = giveRated.filter((p) => !p.round);
  const theirStartingAfter = slotById(seasonLineup(theirAfter, rosterSettings, scoring));
  const extras = (list, others, starting) => {
    const extra = list.length - others.length;
    if (extra <= 0) return [];
    return [...list]
      .sort((a, b) => (starting.has(a.id) - starting.has(b.id)) || (a.score - b.score))
      .slice(0, extra)
      .map((p) => ({ ...p, starts: starting.has(p.id), share: starting.has(p.id) ? STARTER_EXTRA_SHARE : BENCH_EXTRA_SHARE }));
  };
  const discount = (list) => ({
    players: list.map((p) => p.name),
    benched: list.filter((p) => !p.starts).map((p) => p.name),
    starting: list.filter((p) => p.starts).map((p) => p.name),
    score: -round1(list.reduce((total, p) => total + p.score * (1 - p.share), 0)),
    display: market ? -Math.round(list.reduce((total, p) => total + (p.display || 0) * (1 - p.share), 0)) : null,
  });
  const getExtras = extras(getPlayers, givePlayers, startingAfter);
  const giveExtras = extras(givePlayers, getPlayers, theirStartingAfter);
  const adjustment = getExtras.length || giveExtras.length
    ? { get: getExtras.length ? discount(getExtras) : null, give: giveExtras.length ? discount(giveExtras) : null }
    : null;
  const giveTotal = round1(sum(giveRated) + (adjustment?.give?.score || 0));
  const getTotal = round1(sum(getRated) + (adjustment?.get?.score || 0));
  const giveDisplay = market ? sum(giveRated, 'display') + (adjustment?.give?.display || 0) : null;
  const getDisplay = market ? sum(getRated, 'display') + (adjustment?.get?.display || 0) : null;

  const gap = getTotal - giveTotal;
  // A floor keeps small trades (a point or two either way) from reading as lopsided.
  const scale = Math.max(giveTotal, getTotal, 10);
  const share = gap / scale;
  let verdict;
  if (Math.abs(share) <= 0.15) verdict = { tone: 'fair', label: 'Fair trade', detail: 'Both sides get about the same value.' };
  else if (share > 0) {
    verdict = share > 0.4
      ? { tone: 'win', label: 'Lopsided in your favor', detail: 'You get a lot more value. The other team may say no.' }
      : { tone: 'win', label: 'You win this trade', detail: 'You get more value than you give.' };
  } else {
    verdict = share < -0.4
      ? { tone: 'lose', label: 'Lopsided against you', detail: 'You give up a lot more value than you get.' }
      : { tone: 'lose', label: 'They win this trade', detail: 'You give up more value than you get.' };
  }

  return {
    give: giveRated, get: getRated, giveTotal, getTotal, myChange, theirChange, levels, share,
    adjustment, giveDisplay: giveDisplay == null ? null : Math.round(giveDisplay), getDisplay: getDisplay == null ? null : Math.round(getDisplay),
    market: market ? { settings: market.settings, fetchedAt: market.fetchedAt, weight: market.weight } : null,
    valueVerdict: verdict, verdict: fitVerdict(verdict, myChange, getBenched),
  };
};

// ---- Trade finder -------------------------------------------------------------------------

const TRADE_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
// Only the players worth trading for are tried, which keeps the search quick.
const FINDER_PLAYERS_PER_TEAM = 10;

/**
 * Looks through every other team for 1-for-1 and 2-for-1 trades (either way) that improve your
 * starting lineup, don't hurt theirs much, and are fair enough on value that they might say yes.
 * partners: [{ key, name, roster }] with projections attached. Returns the best few, best first.
 */
export const findTrades = ({
  myRoster, partners, rosterSettings, scoring, allPlayers, dynasty = false, limit = 6, market = null,
}) => {
  const teamCount = partners.length + 1;
  const levels = replacementLevels(allPlayers, teamCount, rosterSettings, scoring);
  const tradeable = (roster) => roster
    .filter((p) => TRADE_POSITIONS.includes(p.position))
    .map((p) => ({ p, value: tradeValue(p, scoring) }))
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, FINDER_PLAYERS_PER_TEAM)
    .map(({ p }) => p);
  const pairs = (list) => list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b]));
  const mine = tradeable(myRoster);

  const found = [];
  partners.forEach((partner) => {
    const theirs = tradeable(partner.roster);
    const packages = [
      ...mine.flatMap((a) => theirs.map((b) => [[a], [b]])),
      ...pairs(mine).flatMap((two) => theirs.map((b) => [two, [b]])),
      ...mine.flatMap((a) => pairs(theirs).map((two) => [[a], two])),
    ];
    packages.forEach(([give, get]) => {
      const result = analyzeTrade({
        give, get, myRoster, theirRoster: partner.roster, rosterSettings, scoring, allPlayers, teamCount, dynasty, levels, market,
      });
      const share = (result.getTotal - result.giveTotal) / Math.max(result.giveTotal, result.getTotal, 10);
      // Worth suggesting: your lineup gets clearly better, theirs doesn't get clearly worse,
      // and the values are close enough that they might accept.
      if (result.myChange < 1 || result.theirChange < -1 || Math.abs(share) > 0.25) return;
      found.push({
        partnerKey: partner.key,
        partnerName: partner.name,
        give,
        get,
        myChange: result.myChange,
        theirChange: result.theirChange,
        verdict: result.verdict,
        valueVerdict: result.valueVerdict,
        // Your gain counts most; their gain helps it get accepted; taking far more value than you give doesn't.
        rank: result.myChange + 0.5 * result.theirChange - 20 * Math.max(0, share - 0.1),
      });
    });
  });

  // Best first, no more than two ideas per partner so the list covers the league, and only the
  // best way to get any one set of their players.
  const perPartner = new Map();
  const seen = new Set();
  return found
    .sort((a, b) => b.rank - a.rank)
    .filter((idea) => {
      const target = `${idea.partnerKey}:${idea.get.map((p) => p.id).sort().join(',')}`;
      const count = perPartner.get(idea.partnerKey) || 0;
      if (count >= 2 || seen.has(target)) return false;
      seen.add(target);
      perPartner.set(idea.partnerKey, count + 1);
      return true;
    })
    .slice(0, limit);
};

// ---- Balancing a trade --------------------------------------------------------------------

// Value gap (as a share of the bigger side) that still counts as a fair trade.
const FAIR_SHARE = 0.15;

/**
 * Ways to make an uneven trade fair: add one of their players or picks when you give more, add one
 * of yours when you get more, or drop something from the heavier side. Takes analyzeTrade's
 * arguments plus the pick lists you could add (myPickPool / theirPickPool). Best options first.
 */
export const balanceTrade = ({ myPickPool = [], theirPickPool = [], limit = 3, ...args }) => {
  const levels = args.levels || replacementLevels(args.allPlayers, args.teamCount, args.rosterSettings, args.scoring);
  const base = analyzeTrade({ ...args, levels });
  if (Math.abs(base.share) <= FAIR_SHARE) return [];
  const youGiveMore = base.share < 0;
  const { give, get, givePicks = [], getPicks = [], myRoster, theirRoster, dynasty } = args;
  const inTrade = new Set([...give, ...get, ...givePicks, ...getPicks].map((x) => x.id));
  const tradeable = (roster) => roster.filter((p) => !inTrade.has(p.id) && TRADE_POSITIONS.includes(p.position));
  const freePicks = (pool) => (dynasty ? pool.filter((pick) => !inTrade.has(pick.id)) : []);

  const options = [];
  if (youGiveMore) {
    tradeable(theirRoster).forEach((p) => options.push({ action: 'add', side: 'get', item: p, change: { get: [...get, p] } }));
    freePicks(theirPickPool).forEach((pick) => options.push({ action: 'add', side: 'get', item: pick, change: { getPicks: [...getPicks, pick] } }));
    if (give.length + givePicks.length > 1) {
      give.forEach((p) => options.push({ action: 'remove', side: 'give', item: p, change: { give: give.filter((x) => x !== p) } }));
      givePicks.forEach((pick) => options.push({ action: 'remove', side: 'give', item: pick, change: { givePicks: givePicks.filter((x) => x !== pick) } }));
    }
  } else {
    tradeable(myRoster).forEach((p) => options.push({ action: 'add', side: 'give', item: p, change: { give: [...give, p] } }));
    freePicks(myPickPool).forEach((pick) => options.push({ action: 'add', side: 'give', item: pick, change: { givePicks: [...givePicks, pick] } }));
    if (get.length + getPicks.length > 1) {
      get.forEach((p) => options.push({ action: 'remove', side: 'get', item: p, change: { get: get.filter((x) => x !== p) } }));
      getPicks.forEach((pick) => options.push({ action: 'remove', side: 'get', item: pick, change: { getPicks: getPicks.filter((x) => x !== pick) } }));
    }
  }

  return options
    .map((option) => {
      const result = analyzeTrade({ ...args, ...option.change, levels });
      return { ...option, share: result.share, myChange: result.myChange, verdict: result.verdict, valueVerdict: result.valueVerdict };
    })
    .filter((option) => Math.abs(option.share) <= FAIR_SHARE)
    // Closest to even first; between similar ones, the one that's better for your lineup.
    .sort((a, b) => Math.abs(a.share) - Math.abs(b.share) + 0.02 * (b.myChange - a.myChange))
    .slice(0, limit)
    .map(({ change, ...option }) => option);
};

// ---- Team needs ---------------------------------------------------------------------------

/**
 * How strong each team is at each position: the points per game its best lineup gets from that
 * position, ranked across the league (1 = best). The top third is 'strong', the bottom third 'weak'.
 * teams: [{ key, name, roster }] with projections attached.
 */
export const teamNeeds = ({ teams, rosterSettings, scoring }) => {
  const rows = teams.map((team) => {
    const lineup = seasonLineup(team.roster, rosterSettings, scoring);
    const points = Object.fromEntries(TRADE_POSITIONS.map((pos) => [pos, 0]));
    lineup.starters.forEach(({ player }) => {
      if (player && points[player.position] != null) points[player.position] += player.points;
    });
    return { key: team.key, name: team.name, mine: !!team.mine, total: round1(lineup.total), points };
  });
  const count = rows.length;
  const tierFor = (rank) => {
    if (count < 3) return 'average';
    if (rank <= Math.ceil(count / 3)) return 'strong';
    if (rank > count - Math.ceil(count / 3)) return 'weak';
    return 'average';
  };
  const rankBy = (value) => {
    const sorted = [...rows].sort((a, b) => value(b) - value(a));
    return new Map(sorted.map((row, index) => [row.key, index + 1]));
  };
  const totalRanks = rankBy((row) => row.total);
  const positionRanks = Object.fromEntries(TRADE_POSITIONS.map((pos) => [pos, rankBy((row) => row.points[pos])]));
  return {
    positions: TRADE_POSITIONS,
    rows: rows
      .map((row) => ({
        key: row.key,
        name: row.name,
        mine: row.mine,
        total: row.total,
        totalRank: totalRanks.get(row.key),
        cells: Object.fromEntries(TRADE_POSITIONS.map((pos) => {
          const rank = positionRanks[pos].get(row.key);
          return [pos, { points: round1(row.points[pos]), rank, tier: tierFor(rank) }];
        })),
      }))
      .sort((a, b) => a.totalRank - b.totalRank),
  };
};
