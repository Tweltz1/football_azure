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

/** Starting slots for a league's roster settings, in the order they are filled. */
export const buildSlots = (rosterSettings = STANDARD_LINEUP) => {
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
    onBye: onBye && !projection,
    points: projection ? Number(projection.points?.[scoring] ?? 0) : null,
    recent: projection?.recent || [],
    seasonAvg: projection?.seasonAvg || null,
    gamesPlayed: projection?.gamesPlayed || 0,
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

  const starters = slots.map((slot) => {
    const pick = available.find((p) => !used.has(p.id) && slot.positions.includes(p.position));
    if (pick) used.add(pick.id);
    return { slot, player: pick || null };
  });

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
  const ranked = [...players].filter((p) => p.points != null).sort(sortByPoints);
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
