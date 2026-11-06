// How well past weeks' projections and head-to-head calls held up, from the rows the
// startsit/accuracy endpoint returns: [id, name, position, proj ppr, half, std, actual ppr, half, std].
import { winChance } from './startSitWhy.js';

const COLUMN = { ppr: 0, half: 1, std: 2 };
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
// A start/sit question is between two players who both project like starters and are close.
const CALL_MIN_PROJECTION = 5;
const CALL_MAX_GAP = 6;
const CLEAR_CALL = 0.66;
export const CHANCE_BUCKETS = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.86]];

const pointsOf = (row, scoring) => {
  const c = COLUMN[scoring] ?? 0;
  return { projected: row[3 + c], actual: row[6 + c] };
};

export function summarizeAccuracy(data, scoring = 'ppr') {
  const weeks = data?.weeks || [];
  const misses = new Map(POSITIONS.map((pos) => [pos, { total: 0, count: 0 }]));
  const buckets = CHANCE_BUCKETS.map(([low, high]) => ({ low, high, said: 0, won: 0, count: 0 }));
  const clear = { right: 0, count: 0 };
  const calls = { right: 0, count: 0 };
  const bigMisses = [];

  for (const week of weeks) {
    const byPosition = new Map();
    for (const row of week.rows) {
      const [id, name, position] = row;
      const { projected, actual } = pointsOf(row, scoring);
      const miss = misses.get(position);
      if (miss) {
        miss.total += Math.abs(actual - projected);
        miss.count += 1;
      }
      if (projected >= 10) bigMisses.push({ id, name, position, week: week.week, projected, actual, diff: actual - projected });
      if (projected < CALL_MIN_PROJECTION || !['QB', 'RB', 'WR', 'TE'].includes(position)) continue;
      if (!byPosition.has(position)) byPosition.set(position, []);
      byPosition.get(position).push({ position, points: projected, actual });
    }

    // Every close pair at a position that week: did the one we'd start score more?
    for (const players of byPosition.values()) {
      for (let i = 0; i < players.length; i += 1) {
        for (let j = i + 1; j < players.length; j += 1) {
          const [a, b] = players[i].points >= players[j].points ? [players[i], players[j]] : [players[j], players[i]];
          if (a.points - b.points > CALL_MAX_GAP || a.actual === b.actual) continue;
          const chance = winChance(a, b);
          const right = a.actual > b.actual ? 1 : 0;
          calls.right += right;
          calls.count += 1;
          if (chance >= CLEAR_CALL) {
            clear.right += right;
            clear.count += 1;
          }
          const bucket = buckets.find((bk) => chance >= bk.low && chance < bk.high);
          if (bucket) {
            bucket.said += chance;
            bucket.won += right;
            bucket.count += 1;
          }
        }
      }
    }
  }

  bigMisses.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  return {
    weeks: weeks.map((w) => w.week),
    savedWeeks: weeks.filter((w) => w.source === 'saved').map((w) => w.week),
    players: weeks.reduce((n, w) => n + w.rows.length, 0),
    positions: POSITIONS
      .map((position) => ({ position, ...misses.get(position) }))
      .filter((m) => m.count > 0)
      .map((m) => ({ position: m.position, count: m.count, averageMiss: m.total / m.count })),
    buckets: buckets.filter((bk) => bk.count > 0).map((bk) => ({
      label: `${Math.round(bk.low * 100)}-${Math.min(85, Math.round(bk.high * 100))}%`,
      said: bk.said / bk.count,
      won: bk.won / bk.count,
      count: bk.count,
    })),
    calls: calls.count ? { right: calls.right / calls.count, count: calls.count } : null,
    clearCalls: clear.count ? { right: clear.right / clear.count, count: clear.count } : null,
    bigMisses: bigMisses.slice(0, 5),
  };
}
