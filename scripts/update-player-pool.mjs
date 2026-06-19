#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const API_BASE_URL = 'https://api.fantasypros.com/v2/json/nfl';
const DEFAULT_LIMIT = 350;
const DEFAULT_SCORING = 'PPR';
const DEFAULT_POSITION = 'ALL';
const OUTPUTS = {
  csharp: path.join('api', 'Shared', 'PlayerData.cs'),
  javascript: path.join('frontend', 'src', 'data', 'playerData.js'),
};

const apiKey = process.env.FANTASYPROS_API_KEY;
if (!apiKey) {
  fail('Missing FANTASYPROS_API_KEY. Add it as a GitHub Actions repository secret before running this updater.');
}

const season = String(process.env.FANTASYPROS_SEASON || new Date().getUTCFullYear());
const scoring = normalizeScoring(process.env.FANTASYPROS_SCORING || DEFAULT_SCORING);
const position = normalizePosition(process.env.FANTASYPROS_POSITION || DEFAULT_POSITION);
const limit = parsePositiveInteger(process.env.FANTASYPROS_LIMIT, DEFAULT_LIMIT);
const rankingType = cleanOptionalValue(process.env.FANTASYPROS_TYPE);
const week = cleanOptionalValue(process.env.FANTASYPROS_WEEK);

const params = new URLSearchParams({ position, scoring });
if (rankingType) params.set('type', rankingType);
if (week) params.set('week', week);

const requestUrl = `${API_BASE_URL}/${season}/consensus-rankings?${params.toString()}`;
const payload = await fetchConsensusRankings(requestUrl, apiKey);
const players = normalizePlayers(payload.players || [], limit);

if (players.length === 0) {
  fail('FantasyPros returned no usable players. PlayerData files were not updated.');
}

if (players.length < limit) {
  console.warn(`FantasyPros returned ${players.length} usable players, fewer than requested limit ${limit}.`);
}

const fetchedAt = new Date().toISOString();
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
  fetchedAt,
  requestedLimit: limit,
  playerCount: players.length,
};

await writeGeneratedFile(OUTPUTS.csharp, renderCSharp(players, meta));
await writeGeneratedFile(OUTPUTS.javascript, renderJavaScript(players, meta));

console.log(`Updated ${OUTPUTS.csharp} and ${OUTPUTS.javascript} with ${players.length} FantasyPros players.`);
console.log(`FantasyPros last_updated: ${meta.lastUpdated || 'not provided'}`);

async function fetchConsensusRankings(url, key) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-api-key': key,
      'user-agent': 'hood-league-player-pool-updater',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text();
    fail(`FantasyPros request failed with ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }

  return response.json();
}

function normalizePlayers(rawPlayers, maxPlayers) {
  const normalized = rawPlayers
    .map((player, index) => normalizePlayer(player, index))
    .filter(Boolean)
    .sort((a, b) => a.sourceRank - b.sourceRank || a.name.localeCompare(b.name));

  const seenIds = new Set();
  const uniquePlayers = [];

  for (const player of normalized) {
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

function normalizePlayer(player, index) {
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
  };
}

function normalizeScoring(value) {
  const scoringType = String(value).trim().toUpperCase();
  if (!['STD', 'PPR', 'HALF'].includes(scoringType)) {
    fail(`Unsupported FANTASYPROS_SCORING '${value}'. Use STD, PPR, or HALF.`);
  }
  return scoringType;
}

function normalizePosition(value) {
  const positionValue = String(value).trim().toUpperCase();
  const allowed = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST', 'FLX', 'IDP', 'DL', 'LB', 'DB'];
  if (!allowed.includes(positionValue)) {
    fail(`Unsupported FANTASYPROS_POSITION '${value}'. Use one of: ${allowed.join(', ')}.`);
  }
  return positionValue;
}

function normalizePlayerPosition(value) {
  const raw = String(value || '').split(',')[0].trim().toUpperCase();
  if (raw === 'DEF' || raw === 'D/ST') return 'DST';
  if (['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(raw)) return raw;
  return raw || null;
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
