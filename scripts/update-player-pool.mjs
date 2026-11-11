#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const FANTASYPROS_API_BASE_URL = 'https://api.fantasypros.com/v2/json/nfl';
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const SLEEPER_STATE_URL = 'https://api.sleeper.app/v1/state/nfl';
const SLEEPER_TRENDING_BASE_URL = 'https://api.sleeper.app/v1/players/nfl/trending';
const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const NFLVERSE_PLAYER_STATS_RELEASE_URL = 'https://api.github.com/repos/nflverse/nflverse-data/releases/tags/player_stats';
const DEFAULT_LIMIT = 350;
const DEFAULT_SCORING = 'PPR';
const DEFAULT_POSITION = 'ALL';
const DEFAULT_TRENDING_LOOKBACK_HOURS = 24;
const DEFAULT_TRENDING_LIMIT = 25;
const SLEEPER_DST_SORT_RANK = 850;
const APP_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const POSITION_SORT = new Map(APP_POSITIONS.map((position, index) => [position, index]));
const NFL_TEAM_ABBREVIATIONS = new Set([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
]);
const TEAM_ALIASES = new Map([
  ['JAC', 'JAX'],
  ['WSH', 'WAS'],
]);
const OUTPUTS = {
  server: path.join('supabase', 'functions', '_shared', 'playerData.ts'),
  javascript: path.join('frontend', 'src', 'data', 'playerData.js'),
  insights: path.join('frontend', 'src', 'data', 'playerInsights.js'),
  // Daily rank snapshots, so movement compares against about a week ago even when the pool updates daily.
  rankHistory: path.join('scripts', 'data', 'rank-history.json'),
};
const MOVEMENT_WINDOW_DAYS = 7;
const RANK_HISTORY_DAYS = 10;

const source = normalizeDataSource(process.env.PLAYER_POOL_SOURCE || 'sleeper');
const limit = parsePositiveInteger(process.env.PLAYER_POOL_LIMIT || process.env.FANTASYPROS_LIMIT, DEFAULT_LIMIT);
const fetchedAt = new Date().toISOString();
const lastPool = await readPreviousPlayerRanks(OUTPUTS.javascript);
const rankHistory = await readRankHistory(OUTPUTS.rankHistory, lastPool);
const previousPool = movementBaseline(rankHistory, fetchedAt) || lastPool;

const { players: rawPlayers, meta } = source === 'fantasypros'
  ? await buildFantasyProsPlayerPool(limit, fetchedAt)
  : await buildSleeperPlayerPool(limit, fetchedAt);
const players = attachRankMovement(rawPlayers, previousPool.players);

if (players.length === 0) {
  fail(`${meta.source} returned no usable players. PlayerData files were not updated.`);
}

if (players.length < limit) {
  console.warn(`${meta.source} returned ${players.length} usable players, fewer than requested limit ${limit}.`);
}

const insights = await buildPlayerInsights(players, meta, previousPool);

await writeGeneratedFile(OUTPUTS.server, renderServerData(players, meta));
await writeGeneratedFile(OUTPUTS.javascript, renderJavaScript(players, meta));
await writeGeneratedFile(OUTPUTS.insights, renderInsightsJavaScript(insights));
await writeGeneratedFile(OUTPUTS.rankHistory, `${JSON.stringify(addRankSnapshot(rankHistory, players, fetchedAt), null, 1)}\n`);

console.log(`Updated ${OUTPUTS.server}, ${OUTPUTS.javascript}, and ${OUTPUTS.insights} with ${players.length} ${meta.source} players.`);
console.log(`${meta.source} last updated: ${meta.lastUpdated || 'not provided'}`);

async function buildSleeperPlayerPool(maxPlayers, generatedAt) {
  const [playerMap, state] = await Promise.all([
    fetchJson(SLEEPER_PLAYERS_URL),
    fetchJson(SLEEPER_STATE_URL).catch((error) => {
      console.warn(`Could not fetch Sleeper state: ${error.message}`);
      return {};
    }),
  ]);

  const season = String(state.season || state.league_season || new Date().getUTCFullYear());
  const byeWeeks = await fetchEspnByeWeeks(season).catch((error) => {
    console.warn(`Could not fetch ESPN bye weeks: ${error.message}`);
    return new Map();
  });

  const players = normalizeSleeperPlayers(playerMap, maxPlayers, byeWeeks);
  const meta = {
    source: 'Sleeper',
    attribution: 'Player metadata from Sleeper; bye weeks from ESPN scoreboard data',
    sport: 'NFL',
    ranking: 'Sleeper player search_rank ordering',
    season,
    week: String(state.week ?? state.display_week ?? '0'),
    scoring: 'PPR-compatible player pool',
    position: DEFAULT_POSITION,
    type: 'Player metadata',
    lastUpdated: null,
    fetchedAt: generatedAt,
    requestedLimit: maxPlayers,
    playerCount: players.length,
    byeWeekSource: 'ESPN public scoreboard teamsOnBye',
    notes: 'Sleeper does not provide expert consensus ranks. The updater filters to current NFL teams, requires active non-DST players to appear on a depth chart, ranks by Sleeper search_rank/depth chart order/name, fills bye weeks from ESPN schedule data, and preserves status/injury fields when the source provides them.',
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
    notes: 'Preserves status/injury fields when the source provides them.',
  };

  return { players, meta };
}

async function fetchEspnByeWeeks(season) {
  const seasonYear = parsePositiveInteger(season, new Date().getUTCFullYear());
  const byeWeeks = new Map();

  for (let week = 1; week <= 18; week += 1) {
    const params = new URLSearchParams({
      dates: String(seasonYear),
      seasontype: '2',
      week: String(week),
      limit: '1000',
    });
    const payload = await fetchJson(`${ESPN_SCOREBOARD_URL}?${params.toString()}`);
    const teamsOnBye = payload.week?.teamsOnBye || [];

    for (const team of teamsOnBye) {
      const abbreviation = normalizeTeam(team.abbreviation);
      if (NFL_TEAM_ABBREVIATIONS.has(abbreviation)) {
        byeWeeks.set(abbreviation, week);
      }
    }
  }

  if (byeWeeks.size === 0) {
    console.warn(`ESPN returned no bye weeks for ${seasonYear}. Generated bye values will fall back to 0.`);
  }

  return byeWeeks;
}

async function buildPlayerInsights(players, poolMeta, previousPool) {
  const errors = [];
  const trendingLookbackHours = parsePositiveInteger(process.env.SLEEPER_TRENDING_LOOKBACK_HOURS, DEFAULT_TRENDING_LOOKBACK_HOURS);
  const trendingLimit = parsePositiveInteger(process.env.SLEEPER_TRENDING_LIMIT, DEFAULT_TRENDING_LIMIT);
  let sleeperTrending = { add: [], drop: [] };
  let statsResult = emptyStatsResult();

  try {
    sleeperTrending = await fetchSleeperTrending(players, trendingLookbackHours, trendingLimit);
  } catch (error) {
    errors.push(`Sleeper trending unavailable: ${error.message}`);
    console.warn(errors[errors.length - 1]);
  }

  try {
    statsResult = await buildPlayerStatsInsights(players, poolMeta);
  } catch (error) {
    errors.push(`Historical player stats unavailable: ${error.message}`);
    console.warn(errors[errors.length - 1]);
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      playerPoolFetchedAt: poolMeta.fetchedAt,
      previousPlayerPoolFetchedAt: previousPool.generatedAt,
      playerPoolSource: poolMeta.source,
      trendsSource: 'Sleeper trending add/drop endpoints',
      trendsLookbackHours: trendingLookbackHours,
      trendsLimit: trendingLimit,
      statsSource: 'nflverse-data player_stats release',
      requestedStatsSeason: statsResult.requestedSeason,
      statsSeason: statsResult.season,
      statsAsset: statsResult.assetName,
      statsFallbackUsed: statsResult.fallbackUsed,
      errors,
      notes: 'Rank movement compares the newly generated pool against the previously committed playerData.js file. Sleeper trends are also fetched live on the home page when the browser can reach Sleeper.',
    },
    sleeperTrending,
    playerRankMovements: buildRankMovementInsights(players),
    playerStatsById: statsResult.playerStatsById,
    positionAverages: statsResult.positionAverages,
  };
}

async function fetchSleeperTrending(players, lookbackHours, limitCount) {
  const playerBySleeperId = new Map(players
    .filter((player) => player.sleeperId)
    .map((player) => [String(player.sleeperId), player]));

  const [add, drop] = await Promise.all([
    fetchSleeperTrendingType('add', playerBySleeperId, lookbackHours, limitCount),
    fetchSleeperTrendingType('drop', playerBySleeperId, lookbackHours, limitCount),
  ]);

  return { add, drop };
}

async function fetchSleeperTrendingType(type, playerBySleeperId, lookbackHours, limitCount) {
  const params = new URLSearchParams({
    lookback_hours: String(lookbackHours),
    limit: String(limitCount),
  });
  const payload = await fetchJsonOptional(`${SLEEPER_TRENDING_BASE_URL}/${type}?${params.toString()}`);

  return (Array.isArray(payload) ? payload : [])
    .map((item) => {
      const sleeperId = firstString(item.player_id, item.id);
      const player = playerBySleeperId.get(String(sleeperId));
      if (!sleeperId && !player) return null;

      return {
        playerId: player?.id || `sleeper-${sleeperId}`,
        sleeperId: String(sleeperId),
        name: player?.name || String(sleeperId),
        team: player?.team || null,
        position: player?.position || null,
        rank: player?.rank || null,
        count: parseNonNegativeInteger(item.count, 0),
      };
    })
    .filter(Boolean);
}

async function buildPlayerStatsInsights(players, poolMeta) {
  const requestedSeason = String(process.env.PLAYER_STATS_SEASON || getDefaultStatsSeason(poolMeta));
  const assets = await fetchNflverseStatsAssets();
  const selectedAsset = chooseNflverseStatsAsset(assets, requestedSeason);

  if (!selectedAsset) {
    throw new Error('No player_stats_<year>.csv asset found in nflverse-data release.');
  }

  const csv = await fetchTextOptional(selectedAsset.browser_download_url);
  const rows = parseCsv(csv);
  const statsIndex = aggregatePlayerStatsRows(rows);
  const playerStatsById = {};
  const finalStatsCache = new WeakMap();

  for (const player of players) {
    const aggregate = findAggregateForPlayer(player, statsIndex);
    if (!aggregate) continue;
    playerStatsById[player.id] = getFinalStats(aggregate, finalStatsCache);
  }

  return {
    requestedSeason,
    season: String(extractSeasonFromAsset(selectedAsset.name) || requestedSeason),
    assetName: selectedAsset.name,
    fallbackUsed: !selectedAsset.name.includes(`_${requestedSeason}.csv`),
    playerStatsById,
    positionAverages: buildPositionAverages(players, playerStatsById),
  };
}

function emptyStatsResult() {
  return {
    requestedSeason: null,
    season: null,
    assetName: null,
    fallbackUsed: false,
    playerStatsById: {},
    positionAverages: {},
  };
}

async function fetchNflverseStatsAssets() {
  const release = await fetchJsonOptional(NFLVERSE_PLAYER_STATS_RELEASE_URL);
  if (!release.assets_url) return release.assets || [];

  const assets = [];
  for (let page = 1; page <= 10; page += 1) {
    const pageAssets = await fetchJsonOptional(`${release.assets_url}?per_page=100&page=${page}`);
    if (!Array.isArray(pageAssets) || pageAssets.length === 0) break;
    assets.push(...pageAssets);
    if (pageAssets.length < 100) break;
  }
  return assets;
}

function chooseNflverseStatsAsset(assets, requestedSeason) {
  const weeklyAssets = (assets || [])
    .filter((asset) => /^player_stats_\d{4}\.csv$/i.test(asset.name || ''))
    .sort((a, b) => extractSeasonFromAsset(b.name) - extractSeasonFromAsset(a.name));

  return weeklyAssets.find((asset) => asset.name === `player_stats_${requestedSeason}.csv`) || weeklyAssets[0] || null;
}

function aggregatePlayerStatsRows(rows) {
  const byId = new Map();
  const byNameTeamPosition = new Map();
  const byNamePosition = new Map();

  for (const row of rows) {
    const playerId = firstString(row.player_id, row.gsis_id, row.gsis);
    const name = firstString(row.player_display_name, row.player_name, row.name);
    const team = normalizeTeam(firstString(row.recent_team, row.team, row.posteam));
    const position = normalizePlayerPosition(firstString(row.position, row.player_position));
    const season = firstString(row.season);
    const week = parsePositiveInteger(row.week, 0);
    const weekStats = extractWeekStats(row);

    if (!playerId || !name || !position || !week || !weekStats.hasActivity) continue;

    const entry = byId.get(playerId) || createStatsAggregate({ playerId, name, team, position, season });
    byId.set(playerId, entry);
    addWeekStats(entry, week, weekStats);

    const nameTeamPositionKey = makeNameTeamPositionKey(name, team, position);
    const namePositionKey = makeNamePositionKey(name, position);
    if (nameTeamPositionKey) byNameTeamPosition.set(nameTeamPositionKey, entry);
    if (namePositionKey) byNamePosition.set(namePositionKey, entry);
  }

  return { byId, byNameTeamPosition, byNamePosition };
}

function createStatsAggregate({ playerId, name, team, position, season }) {
  return {
    playerId,
    name,
    team,
    position,
    season,
    games: 0,
    totals: {
      completions: 0,
      attempts: 0,
      passingYards: 0,
      passingTds: 0,
      interceptions: 0,
      carries: 0,
      rushingYards: 0,
      rushingTds: 0,
      receptions: 0,
      targets: 0,
      receivingYards: 0,
      receivingTds: 0,
      fantasyPoints: 0,
      fantasyPointsPpr: 0,
      totalYards: 0,
      totalTds: 0,
    },
    weekly: [],
  };
}

function extractWeekStats(row) {
  const completions = csvNumber(row, ['completions', 'passing_completions']);
  const attempts = csvNumber(row, ['attempts', 'passing_attempts']);
  const passingYards = csvNumber(row, ['passing_yards']);
  const passingTds = csvNumber(row, ['passing_tds', 'passing_touchdowns']);
  const interceptions = csvNumber(row, ['interceptions', 'passing_interceptions']);
  const carries = csvNumber(row, ['carries', 'rushing_attempts']);
  const rushingYards = csvNumber(row, ['rushing_yards']);
  const rushingTds = csvNumber(row, ['rushing_tds', 'rushing_touchdowns']);
  const receptions = csvNumber(row, ['receptions']);
  const targets = csvNumber(row, ['targets']);
  const receivingYards = csvNumber(row, ['receiving_yards']);
  const receivingTds = csvNumber(row, ['receiving_tds', 'receiving_touchdowns']);
  const fantasyPoints = csvNumber(row, ['fantasy_points']);
  const fantasyPointsPpr = csvNumber(row, ['fantasy_points_ppr', 'fantasy_points']);
  const totalYards = passingYards + rushingYards + receivingYards;
  const totalTds = passingTds + rushingTds + receivingTds;
  const hasActivity = [
    completions,
    attempts,
    passingYards,
    passingTds,
    interceptions,
    carries,
    rushingYards,
    rushingTds,
    receptions,
    targets,
    receivingYards,
    receivingTds,
    fantasyPoints,
    fantasyPointsPpr,
  ].some((value) => Number.isFinite(value) && Math.abs(value) > 0);

  return {
    completions,
    attempts,
    passingYards,
    passingTds,
    interceptions,
    carries,
    rushingYards,
    rushingTds,
    receptions,
    targets,
    receivingYards,
    receivingTds,
    fantasyPoints,
    fantasyPointsPpr,
    totalYards,
    totalTds,
    hasActivity,
  };
}

function addWeekStats(entry, week, weekStats) {
  entry.games += 1;
  for (const key of Object.keys(entry.totals)) {
    entry.totals[key] += weekStats[key] || 0;
  }
  entry.weekly.push({
    week,
    fantasyPointsPpr: weekStats.fantasyPointsPpr,
    totalYards: weekStats.totalYards,
    totalTds: weekStats.totalTds,
    receptions: weekStats.receptions,
    passingYards: weekStats.passingYards,
    rushingYards: weekStats.rushingYards,
    receivingYards: weekStats.receivingYards,
  });
}

function findAggregateForPlayer(player, statsIndex) {
  const candidateIds = [player.gsisId, player.statsId, player.espnId, player.sleeperId, player.id]
    .filter(Boolean)
    .map((value) => String(value).replace(/^sleeper-/, ''));

  for (const candidateId of candidateIds) {
    const aggregate = statsIndex.byId.get(candidateId);
    if (aggregate) return aggregate;
  }

  return statsIndex.byNameTeamPosition.get(makeNameTeamPositionKey(player.name, player.team, player.position))
    || statsIndex.byNamePosition.get(makeNamePositionKey(player.name, player.position))
    || null;
}

function getFinalStats(aggregate, cache) {
  if (cache.has(aggregate)) return cache.get(aggregate);

  const games = Math.max(aggregate.games, 1);
  const totals = {
    completions: roundInteger(aggregate.totals.completions),
    attempts: roundInteger(aggregate.totals.attempts),
    passingYards: roundInteger(aggregate.totals.passingYards),
    passingTds: roundInteger(aggregate.totals.passingTds),
    interceptions: roundInteger(aggregate.totals.interceptions),
    carries: roundInteger(aggregate.totals.carries),
    rushingYards: roundInteger(aggregate.totals.rushingYards),
    rushingTds: roundInteger(aggregate.totals.rushingTds),
    receptions: roundInteger(aggregate.totals.receptions),
    targets: roundInteger(aggregate.totals.targets),
    receivingYards: roundInteger(aggregate.totals.receivingYards),
    receivingTds: roundInteger(aggregate.totals.receivingTds),
    fantasyPoints: roundNumber(aggregate.totals.fantasyPoints, 1),
    fantasyPointsPpr: roundNumber(aggregate.totals.fantasyPointsPpr, 1),
    totalYards: roundInteger(aggregate.totals.totalYards),
    totalTds: roundInteger(aggregate.totals.totalTds),
  };
  const bestWeek = [...aggregate.weekly].sort((a, b) => b.fantasyPointsPpr - a.fantasyPointsPpr || b.totalYards - a.totalYards)[0] || null;
  const stats = {
    season: aggregate.season,
    games: aggregate.games,
    team: aggregate.team,
    position: aggregate.position,
    totals,
    perGame: {
      fantasyPoints: roundNumber(totals.fantasyPoints / games, 1),
      fantasyPointsPpr: roundNumber(totals.fantasyPointsPpr / games, 1),
      totalYards: roundNumber(totals.totalYards / games, 1),
      totalTds: roundNumber(totals.totalTds / games, 2),
      receptions: roundNumber(totals.receptions / games, 1),
      targets: roundNumber(totals.targets / games, 1),
      passingYards: roundNumber(totals.passingYards / games, 1),
      rushingYards: roundNumber(totals.rushingYards / games, 1),
      receivingYards: roundNumber(totals.receivingYards / games, 1),
    },
    bestWeek: bestWeek ? {
      week: bestWeek.week,
      fantasyPointsPpr: roundNumber(bestWeek.fantasyPointsPpr, 1),
      totalYards: roundInteger(bestWeek.totalYards),
      totalTds: roundInteger(bestWeek.totalTds),
      receptions: roundInteger(bestWeek.receptions),
      passingYards: roundInteger(bestWeek.passingYards),
      rushingYards: roundInteger(bestWeek.rushingYards),
      receivingYards: roundInteger(bestWeek.receivingYards),
    } : null,
  };

  cache.set(aggregate, stats);
  return stats;
}

function buildPositionAverages(players, playerStatsById) {
  const groups = {};

  for (const player of players) {
    const stats = playerStatsById[player.id];
    if (!stats || !stats.games) continue;
    const group = groups[player.position] || {
      sampleSize: 0,
      perGame: {
        fantasyPointsPpr: 0,
        totalYards: 0,
        totalTds: 0,
        receptions: 0,
        targets: 0,
        passingYards: 0,
        rushingYards: 0,
        receivingYards: 0,
      },
    };

    group.sampleSize += 1;
    for (const key of Object.keys(group.perGame)) {
      group.perGame[key] += stats.perGame?.[key] || 0;
    }
    groups[player.position] = group;
  }

  for (const group of Object.values(groups)) {
    for (const key of Object.keys(group.perGame)) {
      group.perGame[key] = roundNumber(group.perGame[key] / group.sampleSize, key === 'totalTds' ? 2 : 1);
    }
  }

  return groups;
}

function buildRankMovementInsights(players) {
  const movingPlayers = players
    .filter((player) => Number.isFinite(player.rankMovement) && player.rankMovement !== 0)
    .map((player) => ({
      playerId: player.id,
      name: player.name,
      team: player.team,
      position: player.position,
      rank: player.rank,
      previousRank: player.previousRank,
      rankMovement: player.rankMovement,
    }));

  return {
    risers: movingPlayers
      .filter((player) => player.rankMovement > 0)
      .sort((a, b) => b.rankMovement - a.rankMovement || a.rank - b.rank)
      .slice(0, 8),
    fallers: movingPlayers
      .filter((player) => player.rankMovement < 0)
      .sort((a, b) => a.rankMovement - b.rankMovement || a.rank - b.rank)
      .slice(0, 8),
  };
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

async function fetchJsonOptional(url, options = {}) {
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
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }

  return response.json();
}

async function fetchTextOptional(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'text/csv,text/plain,*/*',
      'user-agent': 'hood-league-player-pool-updater',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }

  return response.text();
}

function normalizeSleeperPlayers(playerMap, maxPlayers, byeWeeks) {
  const normalized = Object.values(playerMap || {})
    .map((player) => normalizeSleeperPlayer(player, byeWeeks))
    .filter(Boolean)
    .sort(compareNormalizedPlayers);

  return dedupeAndRank(normalized, maxPlayers);
}

function normalizeSleeperPlayer(player, byeWeeks) {
  const position = normalizePlayerPosition(firstString(player.position, ...(player.fantasy_positions || [])));
  const team = normalizeTeam(firstString(player.team, player.team_abbr));
  const playerId = firstString(player.player_id, player.id, position === 'DST' ? team : null);
  const fallbackName = position === 'DST' && team ? `${team} DST` : null;
  const name = firstString(player.full_name, [player.first_name, player.last_name].filter(Boolean).join(' '), fallbackName);
  const sourceRank = parsePositiveInteger(player.search_rank, position === 'DST' ? SLEEPER_DST_SORT_RANK : 9999999);
  const depthChartOrder = parsePositiveInteger(player.depth_chart_order, position === 'DST' ? 1 : 9999999);
  const status = cleanOptionalValue(player.status);
  const injuryStatus = cleanOptionalValue(player.injury_status);
  const practiceStatus = cleanOptionalValue(player.practice_status);

  if (!playerId || !name || !position || player.active === false || !NFL_TEAM_ABBREVIATIONS.has(team)) return null;
  if (position !== 'DST' && player.status !== 'Active') return null;
  if (position !== 'DST' && !hasPositiveInteger(player.depth_chart_order)) return null;

  return {
    id: `sleeper-${playerId}`,
    sleeperId: String(playerId),
    statsId: cleanOptionalValue(player.stats_id),
    gsisId: cleanOptionalValue(player.gsis_id),
    espnId: cleanOptionalValue(player.espn_id),
    name,
    team,
    position,
    bye: byeWeeks.get(team) || 0,
    status,
    injuryStatus,
    practiceStatus,
    sourceRank: position === 'DST' ? Math.min(sourceRank, SLEEPER_DST_SORT_RANK) : sourceRank,
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
  const team = normalizeTeam(firstString(player.player_team_id, player.team_id, player.team, player.player_team) || 'FA');
  const position = normalizePlayerPosition(firstString(player.player_position_id, player.position_id, player.position, player.player_positions));
  const fantasyProsId = firstString(player.player_id, player.fpid, player.id);
  const sourceRank = parsePositiveInteger(firstString(player.rank_ecr, player.rank, player.ecr, player.rank_ave), index + 1);
  const bye = parseNonNegativeInteger(firstString(player.player_bye_week, player.bye_week, player.bye), 0);
  const status = cleanOptionalValue(firstString(player.player_status, player.status, player.game_status));
  const injuryStatus = cleanOptionalValue(firstString(player.player_injury_status, player.injury_status, player.injury_status_full));
  const practiceStatus = cleanOptionalValue(firstString(player.player_practice_status, player.practice_status));
  const gsisId = cleanOptionalValue(firstString(player.player_gsis_id, player.gsis_id));
  const espnId = cleanOptionalValue(firstString(player.player_espn_id, player.espn_id));

  if (!name || !position) return null;

  return {
    id: fantasyProsId ? `fp-${fantasyProsId}` : `fp-${slugify([name, team, position].join('-'))}`,
    statsId: gsisId || fantasyProsId || null,
    gsisId,
    espnId,
    name,
    team,
    position,
    bye,
    status,
    injuryStatus,
    practiceStatus,
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

function attachRankMovement(players, previousRanks) {
  return players.map((player) => {
    const previous = previousRanks.get(player.id);
    if (!previous) return player;
    return {
      ...player,
      previousRank: previous.rank,
      rankMovement: previous.rank - player.rank,
    };
  });
}

async function readPreviousPlayerRanks(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    const players = new Map();
    const generatedAtMatch = content.match(/"fetchedAt":\s*"([^"]+)"/);

    for (const line of content.split('\n')) {
      if (!line.includes('{ id:')) continue;
      const id = matchJsStringField(line, 'id');
      const name = matchJsStringField(line, 'name');
      const rankMatch = line.match(/rank:\s*(\d+)/);
      if (id && rankMatch) {
        players.set(id, {
          name,
          rank: Number.parseInt(rankMatch[1], 10),
        });
      }
    }

    return {
      generatedAt: generatedAtMatch?.[1] || null,
      players,
    };
  } catch {
    return { generatedAt: null, players: new Map() };
  }
}

function dayOf(iso) { return String(iso || '').slice(0, 10); }

/** Daily snapshots [{ date, ranks: { id: rank } }], oldest first. Starts from the current pool when missing. */
async function readRankHistory(filePath, currentPool) {
  try {
    const history = JSON.parse(await readFile(filePath, 'utf8'));
    if (Array.isArray(history)) return history.filter((entry) => entry?.date && entry?.ranks);
  } catch {
    // No history yet.
  }
  if (!currentPool.generatedAt || currentPool.players.size === 0) return [];
  return [{
    date: dayOf(currentPool.generatedAt),
    ranks: Object.fromEntries([...currentPool.players].map(([id, player]) => [id, player.rank])),
  }];
}

/** The latest snapshot at least a week old, else the oldest one there is (but never today's). */
function movementBaseline(history, nowIso) {
  const today = dayOf(nowIso);
  const cutoff = dayOf(new Date(Date.parse(nowIso) - MOVEMENT_WINDOW_DAYS * 86400000).toISOString());
  const earlier = history.filter((entry) => entry.date < today);
  if (earlier.length === 0) return null;
  const weekOld = earlier.filter((entry) => entry.date <= cutoff);
  const pick = weekOld.length ? weekOld[weekOld.length - 1] : earlier[0];
  return {
    generatedAt: `${pick.date}T00:00:00.000Z`,
    players: new Map(Object.entries(pick.ranks).map(([id, rank]) => [id, { name: null, rank }])),
  };
}

function addRankSnapshot(history, players, nowIso) {
  const date = dayOf(nowIso);
  const ranks = Object.fromEntries(players.map((player) => [player.id, player.rank]));
  return [...history.filter((entry) => entry.date !== date), { date, ranks }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-RANK_HISTORY_DAYS);
}

function matchJsStringField(line, field) {
  const match = line.match(new RegExp(`${field}:\\s*"([^"]*)"`));
  return match?.[1] || null;
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

function normalizeTeam(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return TEAM_ALIASES.get(normalized) || normalized;
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

function hasPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0;
}

function csvNumber(row, keys) {
  for (const key of keys) {
    if (row[key] === undefined || row[key] === null || row[key] === '') continue;
    const parsed = Number.parseFloat(row[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseCsv(text) {
  const rawRows = [];
  let row = [];
  let field = '';
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ',' && !insideQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') continue;
      row.push(field);
      if (row.some((value) => value !== '')) rawRows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value !== '')) rawRows.push(row);
  if (rawRows.length === 0) return [];

  const headers = rawRows.shift().map((header) => header.trim());
  return rawRows.map((values) => headers.reduce((record, header, index) => {
    record[header] = values[index] ?? '';
    return record;
  }, {}));
}

function getDefaultStatsSeason(meta) {
  const poolSeason = Number.parseInt(meta.season, 10);
  const defaultSeason = Number.isFinite(poolSeason) ? poolSeason - 1 : new Date().getUTCFullYear() - 1;
  return Math.max(2020, defaultSeason);
}

function extractSeasonFromAsset(assetName) {
  const match = String(assetName || '').match(/_(\d{4})\.csv$/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function makeNameTeamPositionKey(name, team, position) {
  if (!name || !team || !position) return null;
  return `${normalizeName(name)}|${normalizeTeam(team)}|${position}`;
}

function makeNamePositionKey(name, position) {
  if (!name || !position) return null;
  return `${normalizeName(name)}|${position}`;
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function roundInteger(value) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function roundNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
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

function renderServerData(players, meta) {
  const rows = players
    .map((player) => `  { id: ${jsString(player.id)}, rank: ${player.rank}, name: ${jsString(player.name)}, team: ${jsString(player.team)}, position: ${jsString(player.position)}, bye: ${player.bye}, isDrafted: false, price: 0 },`)
    .join('\n');

  return `// <auto-generated by scripts/update-player-pool.mjs>\n// Source: ${meta.attribution}. Generated ${meta.fetchedAt}.\n\nimport type { Player } from './models.ts';\n\nconst players: Player[] = [\n${rows}\n];\n\nexport const getInitialPlayerPool = (): Player[] => players.map((player) => ({ ...player }));\n`;
}

function renderJavaScript(players, meta) {
  const rows = players
    .map((player) => `  { id: ${jsString(player.id)}, name: ${jsString(player.name)}, position: ${jsString(player.position)}, team: ${jsString(player.team)}, rank: ${player.rank}, bye: ${player.bye}${renderOptionalJavaScriptFields(player)} },`)
    .join('\n');

  return `// <auto-generated by scripts/update-player-pool.mjs>\n// Source: ${meta.attribution}. Generated ${meta.fetchedAt}.\n\nexport const playerPoolMeta = ${JSON.stringify(meta, null, 2)};\n\nexport const initialPlayerList = [\n${rows}\n];\n`;
}

function renderInsightsJavaScript(insights) {
  return `// <auto-generated by scripts/update-player-pool.mjs>\n// Generated ${insights.meta.generatedAt}.\n\nexport const playerInsightsMeta = ${JSON.stringify(insights.meta, null, 2)};\n\nexport const sleeperTrending = ${JSON.stringify(insights.sleeperTrending, null, 2)};\n\nexport const playerRankMovements = ${JSON.stringify(insights.playerRankMovements, null, 2)};\n\nexport const playerStatsById = ${JSON.stringify(insights.playerStatsById, null, 2)};\n\nexport const positionAverages = ${JSON.stringify(insights.positionAverages, null, 2)};\n`;
}

function renderOptionalJavaScriptFields(player) {
  const fields = [];
  if (player.status) fields.push(`status: ${jsString(player.status)}`);
  if (player.injuryStatus) fields.push(`injuryStatus: ${jsString(player.injuryStatus)}`);
  if (player.practiceStatus) fields.push(`practiceStatus: ${jsString(player.practiceStatus)}`);
  if (Number.isFinite(player.previousRank)) fields.push(`previousRank: ${player.previousRank}`);
  if (Number.isFinite(player.rankMovement) && player.rankMovement !== 0) fields.push(`rankMovement: ${player.rankMovement}`);
  return fields.length ? `, ${fields.join(', ')}` : '';
}


function jsString(value) {
  return JSON.stringify(String(value));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
