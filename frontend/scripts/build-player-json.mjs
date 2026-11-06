// Copies the player list and insights into public/player-data.json, so the iPhone app can download the
// latest ones from the website each day instead of waiting for a new app build (see src/data/livePlayerData.js).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async (file) => {
  const text = await readFile(path.join(root, 'src', 'data', file), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
};

const players = await load('playerData.js');
const insights = await load('playerInsights.js');
const out = {
  playerPoolMeta: players.playerPoolMeta,
  initialPlayerList: players.initialPlayerList,
  playerInsightsMeta: insights.playerInsightsMeta,
  sleeperTrending: insights.sleeperTrending,
  playerRankMovements: insights.playerRankMovements,
  playerStatsById: insights.playerStatsById,
  positionAverages: insights.positionAverages,
};
await writeFile(path.join(root, 'public', 'player-data.json'), JSON.stringify(out));
console.log(`player-data.json: ${out.initialPlayerList.length} players, fetched ${out.playerPoolMeta.fetchedAt}`);
