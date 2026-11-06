// Position rankings for the Rankings page and the rank badges on Start/Sit.
// Weekly ranks come from Sleeper's projections for the week; season ranks come from the
// draft pool the Tuesday job regenerates (playerData.js).

export const POSITION_TABS = [
  { value: 'QB', label: 'QB', positions: ['QB'] },
  { value: 'RB', label: 'RB', positions: ['RB'] },
  { value: 'WR', label: 'WR', positions: ['WR'] },
  { value: 'TE', label: 'TE', positions: ['TE'] },
  { value: 'FLEX', label: 'Flex', positions: ['RB', 'WR', 'TE'] },
  { value: 'K', label: 'K', positions: ['K'] },
  { value: 'DST', label: 'DST', positions: ['DST'] },
];

const tabPositions = (tab) => (POSITION_TABS.find((t) => t.value === tab) || POSITION_TABS[0]).positions;

const pointsFor = (player, scoring) => Number(player?.points?.[scoring] ?? 0);

const byPointsThenName = (scoring) => (a, b) => pointsFor(b, scoring) - pointsFor(a, scoring) || a.name.localeCompare(b.name);

/** Only players with a real projection are ranked; players who are out project to 0. */
const projected = (player, scoring) => pointsFor(player, scoring) > 0;

/** Map of player id -> rank at their own position this week (1 = most projected points). */
export const positionRanks = (players, scoring) => {
  const groups = new Map();
  for (const player of players || []) {
    if (!projected(player, scoring)) continue;
    if (!groups.has(player.position)) groups.set(player.position, []);
    groups.get(player.position).push(player);
  }
  const ranks = new Map();
  for (const group of groups.values()) {
    group.sort(byPointsThenName(scoring)).forEach((player, index) => ranks.set(player.id, index + 1));
  }
  return ranks;
};

/**
 * This week's list for one position tab, best first. Each row has `rank` (within the tab) and
 * `positionRank` (within the player's own position, which differs from rank on the Flex tab).
 * `hidden` counts players in the tab with no projection (out, on bye or not expected to play).
 */
export const weeklyRankings = (players, tab, scoring) => {
  const positions = tabPositions(tab);
  const inTab = (players || []).filter((player) => positions.includes(player.position));
  const ranks = positionRanks(inTab, scoring);
  const rows = inTab
    .filter((player) => projected(player, scoring))
    .sort(byPointsThenName(scoring))
    .map((player, index) => ({
      ...player,
      projection: pointsFor(player, scoring),
      rank: index + 1,
      positionRank: ranks.get(player.id),
    }));
  return { rows, hidden: inTab.length - rows.length };
};

/**
 * Season-long ranks from the draft pool for one tab. `change` is how many spots a player moved
 * at their position since the previous weekly update (positive = up), or null when they are new.
 */
export const seasonRankings = (pool, tab) => {
  const positions = tabPositions(tab);
  const inTab = (pool || []).filter((player) => positions.includes(player.position));

  const rankWithin = (key) => {
    const ranks = new Map();
    const groups = new Map();
    for (const player of inTab) {
      if (!Number.isFinite(Number(player[key]))) continue;
      if (!groups.has(player.position)) groups.set(player.position, []);
      groups.get(player.position).push(player);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => Number(a[key]) - Number(b[key])).forEach((player, index) => ranks.set(player.id, index + 1));
    }
    return ranks;
  };
  const now = rankWithin('rank');
  const before = rankWithin('previousRank');

  return inTab
    .filter((player) => now.has(player.id))
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .map((player, index) => {
      const positionRank = now.get(player.id);
      const previous = before.get(player.id);
      return {
        ...player,
        rank: index + 1,
        overallRank: Number(player.rank),
        positionRank,
        change: previous == null ? null : previous - positionRank,
      };
    });
};

/** "WR12" style label, or the bare position when there is no rank. */
export const rankLabel = (position, rank) => (rank ? `${position}${rank}` : position || '');
