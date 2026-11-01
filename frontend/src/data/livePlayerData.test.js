import { applyPlayerData, currentFetchedAt } from './livePlayerData';
import { initialPlayerList, playerPoolMeta } from './playerData';
import { playerRankMovements } from './playerInsights';

const download = (fetchedAt, count = 60) => ({
  playerPoolMeta: { ...playerPoolMeta, fetchedAt },
  initialPlayerList: Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, position: 'WR', team: 'KC', rank: i + 1, bye: 10 })),
  playerRankMovements: { risers: [{ id: 'p1' }], fallers: [] },
});

test('swaps in a newer downloaded player list, ignores older or broken ones', () => {
  const bundled = currentFetchedAt();
  expect(applyPlayerData(download('2000-01-01T00:00:00.000Z'))).toBe(false);
  expect(applyPlayerData(download('2999-01-01T00:00:00.000Z', 3))).toBe(false);
  expect(applyPlayerData(null)).toBe(false);
  expect(currentFetchedAt()).toBe(bundled);

  expect(applyPlayerData(download('2999-01-01T00:00:00.000Z'))).toBe(true);
  expect(playerPoolMeta.fetchedAt).toBe('2999-01-01T00:00:00.000Z');
  expect(initialPlayerList).toHaveLength(60);
  expect(initialPlayerList[0].id).toBe('p0');
  expect(playerRankMovements.risers).toEqual([{ id: 'p1' }]);
});
