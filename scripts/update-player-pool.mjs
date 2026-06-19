#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const FANTASYPROS_API_BASE_URL = 'https://api.fantasypros.com/v2/json/nfl';
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const SLEEPER_STATE_URL = 'https://api.sleeper.app/v1/state/nfl';
const DEFAULT_LIMIT = 350;
const DEFAULT_SCORING = 'PPR';
const DEFAULT_POSITION = 'ALL';
const APP_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const POSITION_SORT = new Map(APP_POSITIONS.map((position, index) => [position, index]));
const OUTPUTS = {
  csharp: path.join('api', 'Shared', 'PlayerData.cs'),
  javascript: path.join('frontend', 'src', 'data', 'playerData.js'),
};

const source = normalizeDataSource(process.env.PLAYER_POOL_SOURCE || 'sleeper');
const limit = parsePositiveInteger(process.env.PLAYER_POOL_LIMIT || process.env.FANTASYPROS_LIMIT, DEFAULT_LIMIT);
const fetchedAt = new Date().toISOString();

const { players, meta } = source === 'fantasypros'
  ? await buildFantasyProsPlayerPool(limit, fetchedAt)
  : await buildSleeperPlayerPool(limit, fetchedAt);

if (players.length === 0) {
  fail(`${meta.source} returned no usable players. PlayerData files were not updated.`);
}

if (players.length < limit) {
  console.warn(`${meta.source} returned ${players.length} usable players, fewer than requested limit ${limit}.`);
}

await writeGeneratedFile(OUTPUTS.csharp, renderCSharp(players, meta));
await writeGeneratedFile(OUTPUTS.javascript, renderJavaScript(players, meta));

console.log(`Updated ${OUTPUTS.csharp} and ${OUTPUTS.javascript} with ${players.length} ${meta.source} players.`);
console.log(`${meta.source} last updated: ${meta.lastUpdated || 'not provided'}`);

async function buildSleeperPlayerPool(maxPlayers, generatedAt) {
  const [playerMap, state] = await Promise.all([
    fetchJson(SLEEPER_PLAYERS_URL),
    fetchJson(SLEEPER_STATE_URL).catch((error) => {
      console.warn(`Could not fetch Sleeper state: ${error.message}`);
      return {};
    }),
  ]);

  const players = normalizeSleeperPlayers(playerMap, maxPlayers);
  const meta = {
    source: 'Sleeper',
    attribution: 'Player metadata from Sleeper',
    sport: 'NFL',
    ranking: 'Sleeper player search_rank ordering',
    season: String(state.season || state.league_season || new Date().getUTCFullYear()),
    week: String(state.week ?? state.display_week ?? '0'),
    scoring: 'PPR-compatible player pool',
    position: DEFAULT_POSITION,
    type: 'Player metadata',
    lastUpdated: null,
    fetchedAt: generatedAt,
    requestedLimit: maxPlayers,
    playerCount: players.length,
    notes: 'Sleeper /players/nfl does not provide expert rankings or bye weeks; ranks are generated from search_rank, depth chart order, and player name. Bye values default to 0.',
  };

  return { players, meta };
}

async function buildFantasyProsPlayerPool(maxPlayers, generatedAt) {
  const apiKey = process.env.FANTASYPROS_API_KEY;
  if (!apiKey) {
    fail('Missing FANTASYPROS_API_KEY. Set PLAYER_POOL_SOURCE=sleeper or add the key as a GitHub Actions repository secret.');
  }

  const season = String(process.env.FANTASYPROS_SEASON || new Date().getUTCFullYear());
  const scoring = normalizeScoring(process.env.FANTASYPROS_SCORING || DEFAULT_SCORING);
  const position = normalizeFantasyProsPosition(process.env.FANTASYPROS_POSITION || DEFAULT_POSITION);
  const rankingType = cleanOptionalValue(process.env.FANTASYPROS_TYPE);
  const week = cleanOptionalValue(process.env.FANTASYPROS_WEEK);

  const params = new URLSearchParams({ position, scoring });
  if (rankingType) params.set('type', rankingType);
  if (week) params.set('week', week);

  const requestUrl = `${FANTASYPROS_API_BASE_URL}/${season}/consensus-rankings?${params.toString()}`;
  const payload = await fetchJson(requestUrl, {
    headers: {
      'x-api-key': apiKey,
    },
  });
  const players = normalizeFantasyProsPlayers(payload.players || [], maxPlayers);
  const meta = {
    source: 'FantasyPros',
    attribution: 'Rankings data from FantasyPros',
    sport: 'NFL',
    ranking: 'Consensus Rankings',
    season: String(payload.year || season),
    week: String(payload.week ?? week ?? '0'),
    scoring: String(payload.scoring || scoring),
    position: String(payload.position_id || position),
    type: String(payload.type || rankingType || 'Preseason'),
    lastUpdated: payload.last_updated || null,
    fetchedAt: generatedAt,
    requestedLimit: maxPlayers,
    playerCount: players.length,
  };

  return { players, meta };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      'user-agent': 'hood-league-player-pool-updater',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text();
    fail(`Request failed for ${url} with ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }

  return response.json();
}

function normalizeSleeperPlayers(playerMap, maxPlayers) {
  const normalized = Object.values(playerMap || {})
    .map(normalizeSleeperPlayer)
    .filter(Boolean)
    .sort(compareNormalizedPlayers);

  return dedupeAndRank(normalized, maxPlayers);
}

function normalizeSleeperPlayer(player) {
  const playerId = firstString(player.player_id, player.id);
  const name = firstString(player.full_name, [player.first_name, player.last_name].filter(Boolean).join(' '));
  const team = firstString(player.team, player.team_abbr) || 'FA';
  const position = normalizePlayerPosition(firstString(player.position, ...(player.fantasy_positions || [])));
  const sourceRank = parsePositiveInteger(player.search_rank, 9999999);
  const depthChartOrder = parsePositiveInteger(player.depth_chart_order, 9999999);

  if (!playerId || !name || !position || player.active === false) return null;

  return {
    id: `sleeper-${playerId}`,
    name,
    team: team.toUpperCase(),
    position,
    bye: 0,
    sourceRank,
    depthChartOrder,
  };
}

function normalizeFantasyProsPlayers(rawPlayers, maxPlayers) {
  const normalized = rawPlayers
    .map((player, index) => normalizeFantasyProsPlayer(player, index))
    .filter(Boolean)
    .sort(compareNormalizedPlayers);

  return dedupeAndRank(normalized, maxPlayers);
}

function normalizeFantasyProsPlayer(player, index) {
  const name = firstString(player.player_name, player.name, player.full_name);
  const team = firstString(player.player_team_id, player.team_id, player.team, player.player_team) || 'FA';
  const position = normalizePlayerPosition(firstString(player.player_position_id, player.position_id, player.position, player.player_positions));
  const fantasyProsId = firstString(player.player_id, player.fpid, player.id);
  const sourceRank = parsePositiveInteger(firstString(player.rank_ecr, player.rank, player.ecr, player.rank_ave), index + 1);
  const bye = parseNonNegativeInteger(firstString(player.player_bye_week, player.bye_week, player.bye), 0);

  if (!name || !position) return null;

  return {
    id: fantasyProsId ? `fp-${fantasyProsId}` : `fp-${slugify([name, team, position].join('-'))}`,
    name,
    team: team.toUpperCase(),
    position,
    bye,
    sourceRank,
    depthChartOrder: 9999999,
  };
}

function dedupeAndRank(players, maxPlayers) {
  const seenIds = new Set();
  const uniquePlayers = [];

  for (const player of players) {
    if (seenIds.has(player.id)) continue;
    seenIds.add(player.id);
    uniquePlayers.push(player);
    if (uniquePlayers.length >= maxPlayers) break;
  }

  return uniquePlayers.map((player, index) => ({
    ...player,
    rank: index + 1,
  }));
}

function compareNormalizedPlayers(a, b) {
  return a.sourceRank - b.sourceRank
    || a.depthChartOrder - b.depthChartOrder
    || positionSortValue(a.position) - positionSortValue(b.position)
    || a.name.localeCompare(b.name);
}

function positionSortValue(position) {
  return POSITION_SORT.has(position) ? POSITION_SORT.get(position) : 999;
}

function normalizeDataSource(value) {
  const normalized = String(value).trim().toLowerCase();
  if (!['sleeper', 'fantasypros'].includes(normalized)) {
    fail(`Unsupported PLAYER_POOL_SOURCE '${value}'. Use sleeper or fantasypros.`);
  }
  return normalized;
}

function normalizeScoring(value) {
  const scoringType = String(value).trim().toUpperCase();
  if (!['STD', 'PPR', 'HALF'].includes(scoringType)) {
    fail(`Unsupported FANTASYPROS_SCORING '${value}'. Use STD, PPR, or HALF.`);
  }
  return scoringType;
}

function normalizeFantasyProsPosition(value) {
  const positionValue = String(value).trim().toUpperCase();
  const allowed = ['ALL', ...APP_POSITIONS];
  if (!allowed.includes(positionValue)) {
    fail(`Unsupported FANTASYPROS_POSITION '${value}'. Use one of: ${allowed.join(', ')}.`);
  }
  return positionValue;
}

function normalizePlayerPosition(value) {
  const raw = String(value || '').split(',')[0].trim().toUpperCase();
  const normalized = raw === 'DEF' || raw === 'D/ST' ? 'DST' : raw;
  return APP_POSITIONS.includes(normalized) ? normalized : null;
}

function firstString(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const stringValue = String(value).trim();
    if (stringValue) return stringValue;
  }
  return null;
}

function cleanOptionalValue(value) {
  const cleaned = firstString(value);
  return cleaned && cleaned !== '0' ? cleaned : null;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

async function writeGeneratedFile(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

function renderCSharp(players, meta) {
  const rows = players
    .map((player) => `            new Player { Id = ${csString(player.id)}, Rank = ${player.rank}, Name = ${csString(player.name)}, Team = ${csString(player.team)}, Position = ${csString(player.position)}, Bye = ${player.bye}, IsDrafted = false },`)
    .join('\n');

  return `// <auto-generated by scripts/update-player-pool.mjs>\n// Source: ${meta.attribution}. Generated ${meta.fetchedAt}.\n\nusing System.Collections.Generic;\n\npublic static class PlayerData\n{\n    public static List<Player> GetInitialPlayerPool()\n    {\n        return new List<Player>\n        {\n${rows}\n        };\n    }\n}\n`;
}

function renderJavaScript(players, meta) {
  const rows = players
    .map((player) => `  { id: ${jsString(player.id)}, name: ${jsString(player.name)}, position: ${jsString(player.position)}, team: ${jsString(player.team)}, rank: ${player.rank}, bye: ${player.bye} },`)
    .join('\n');

  return `// <auto-generated by scripts/update-player-pool.mjs>\n// Source: ${meta.attribution}. Generated ${meta.fetchedAt}.\n\nexport const playerPoolMeta = ${JSON.stringify(meta, null, 2)};\n\nexport const initialPlayerList = [\n${rows}\n];\n`;
}

function csString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function jsString(value) {
  return JSON.stringify(String(value));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
