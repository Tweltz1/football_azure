#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const OUTPUTS = {
  csharp: path.join('api', 'Shared', 'PlayerData.cs'),
  javascript: path.join('frontend', 'src', 'data', 'playerData.js'),
};
const NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
];
const NFL_BYE_WEEKS = new Map(Object.entries({
  ARI: 14,
  ATL: 11,
  BAL: 13,
  BUF: 7,
  CAR: 5,
  CHI: 10,
  CIN: 6,
  CLE: 11,
  DAL: 14,
  DEN: 10,
  DET: 6,
  GB: 11,
  HOU: 8,
  IND: 13,
  JAX: 7,
  KC: 5,
  LAC: 7,
  LAR: 11,
  LV: 13,
  MIA: 6,
  MIN: 6,
  NE: 11,
  NO: 8,
  NYG: 8,
  NYJ: 13,
  PHI: 10,
  PIT: 9,
  SEA: 11,
  SF: 8,
  TB: 10,
  TEN: 9,
  WAS: 7,
}));
const TEAM_ALIASES = new Map([
  ['JAC', 'JAX'],
  ['WSH', 'WAS'],
]);

const originalJavaScript = await readFile(OUTPUTS.javascript, 'utf8');
const parsed = parseJavaScriptPool(originalJavaScript);
const sleeperCandidates = await fetchSleeperSpecialTeams();
const added = [];

appendMissingTeams(parsed.players, sleeperCandidates, 'K', added);
appendMissingTeams(parsed.players, sleeperCandidates, 'DST', added);
renumberRanks(parsed.players);

if (added.length === 0) {
  console.log('Generated player pool already has complete K and DST team coverage.');
  process.exit(0);
}

const meta = {
  ...parsed.meta,
  playerCount: parsed.players.length,
  requiredCoverage: {
    K: countCoveredTeams(parsed.players, 'K'),
    DST: countCoveredTeams(parsed.players, 'DST'),
  },
  notes: appendNote(parsed.meta.notes, 'Ensures every NFL team has one kicker and one DST entry by appending missing K/DST teams from Sleeper after the requested ranked pool is built.'),
};

await writeFile(OUTPUTS.javascript, renderJavaScript(parsed.players, meta), 'utf8');
await writeFile(OUTPUTS.csharp, renderCSharp(parsed.players, meta), 'utf8');

console.log(`Added ${added.length} special teams entries: ${added.map((player) => `${player.team} ${player.position}`).join(', ')}`);
console.log(`K coverage: ${meta.requiredCoverage.K}/32. DST coverage: ${meta.requiredCoverage.DST}/32.`);

async function fetchSleeperSpecialTeams() {
  const payload = await fetchJson(SLEEPER_PLAYERS_URL);
  return Object.values(payload || {})
    .map(normalizeSleeperCandidate)
    .filter(Boolean)
    .sort((a, b) => a.sourceRank - b.sourceRank
      || a.depthChartOrder - b.depthChartOrder
      || a.name.localeCompare(b.name));
}

function normalizeSleeperCandidate(player) {
  const position = normalizePosition(firstString(player.position, ...(player.fantasy_positions || [])));
  if (position !== 'K' && position !== 'DST') return null;

  const team = normalizeTeam(firstString(player.team, player.team_abbr));
  if (!NFL_TEAMS.includes(team)) return null;

  if (position === 'K' && (player.active === false || player.status !== 'Active')) return null;

  const playerId = firstString(player.player_id, player.id, position === 'DST' ? team : null);
  const name = firstString(
    player.full_name,
    [player.first_name, player.last_name].filter(Boolean).join(' '),
    position === 'DST' ? `${team} DST` : null,
  );
  if (!playerId || !name) return null;

  return {
    id: `sleeper-${playerId}`,
    name,
    position,
    team,
    rank: 0,
    bye: NFL_BYE_WEEKS.get(team) || 0,
    status: cleanOptionalValue(player.status),
    injuryStatus: cleanOptionalValue(player.injury_status),
    practiceStatus: cleanOptionalValue(player.practice_status),
    sourceRank: parsePositiveInteger(player.search_rank, position === 'DST' ? 850 : 9999999),
    depthChartOrder: parsePositiveInteger(player.depth_chart_order, position === 'DST' ? 1 : 9999999),
  };
}

function appendMissingTeams(players, candidates, position, added) {
  const existingIds = new Set(players.map((player) => player.id));
  const coveredTeams = new Set(players
    .filter((player) => normalizePosition(player.position) === position)
    .map((player) => normalizeTeam(player.team)));

  for (const team of NFL_TEAMS) {
    if (coveredTeams.has(team)) continue;
    const candidate = candidates.find((item) => item.position === position && item.team === team && !existingIds.has(item.id));
    if (!candidate) {
      console.warn(`No usable ${position} candidate found for ${team}.`);
      continue;
    }

    const player = { ...candidate };
    delete player.sourceRank;
    delete player.depthChartOrder;
    players.push(player);
    added.push(player);
    coveredTeams.add(team);
    existingIds.add(player.id);
  }
}

function parseJavaScriptPool(content) {
  const metaMatch = content.match(/export const playerPoolMeta = (\{[\s\S]*?\n\});/);
  if (!metaMatch) fail(`Could not find playerPoolMeta in ${OUTPUTS.javascript}.`);

  const listMatch = content.match(/export const initialPlayerList = \[([\s\S]*?)\];/);
  if (!listMatch) fail(`Could not find initialPlayerList in ${OUTPUTS.javascript}.`);

  const players = listMatch[1]
    .split('\n')
    .filter((line) => line.includes('{ id:'))
    .map(parsePlayerLine)
    .filter(Boolean);

  return {
    meta: JSON.parse(metaMatch[1]),
    players,
  };
}

function parsePlayerLine(line) {
  return {
    id: matchStringField(line, 'id'),
    name: matchStringField(line, 'name'),
    position: normalizePosition(matchStringField(line, 'position')),
    team: normalizeTeam(matchStringField(line, 'team')),
    rank: matchNumberField(line, 'rank', 0),
    bye: matchNumberField(line, 'bye', 0),
    status: matchStringField(line, 'status'),
    injuryStatus: matchStringField(line, 'injuryStatus'),
    practiceStatus: matchStringField(line, 'practiceStatus'),
    previousRank: matchNumberField(line, 'previousRank', null),
    rankMovement: matchNumberField(line, 'rankMovement', null),
  };
}

function matchStringField(line, field) {
  const match = line.match(new RegExp(`${field}:\\s*("(?:\\\\.|[^"])*")`));
  if (!match) return null;
  return JSON.parse(match[1]);
}

function matchNumberField(line, field, fallback) {
  const match = line.match(new RegExp(`${field}:\\s*(-?\\d+)`));
  return match ? Number.parseInt(match[1], 10) : fallback;
}

function renumberRanks(players) {
  players.forEach((player, index) => {
    player.rank = index + 1;
  });
}

function countCoveredTeams(players, position) {
  return new Set(players
    .filter((player) => normalizePosition(player.position) === position)
    .map((player) => normalizeTeam(player.team))
    .filter((team) => NFL_TEAMS.includes(team))).size;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'hood-league-player-pool-coverage',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text();
    fail(`Request failed for ${url} with ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }

  return response.json();
}

function renderJavaScript(players, meta) {
  const rows = players
    .map((player) => `  { id: ${jsString(player.id)}, name: ${jsString(player.name)}, position: ${jsString(player.position)}, team: ${jsString(player.team)}, rank: ${player.rank}, bye: ${player.bye}${renderOptionalJavaScriptFields(player)} },`)
    .join('\n');

  return `// <auto-generated by scripts/update-player-pool.mjs>\n// Source: ${meta.attribution}. Generated ${meta.fetchedAt}.\n\nexport const playerPoolMeta = ${JSON.stringify(meta, null, 2)};\n\nexport const initialPlayerList = [\n${rows}\n];\n`;
}

function renderCSharp(players, meta) {
  const rows = players
    .map((player) => `            new Player { Id = ${csString(player.id)}, Rank = ${player.rank}, Name = ${csString(player.name)}, Team = ${csString(player.team)}, Position = ${csString(player.position)}, Bye = ${player.bye}, IsDrafted = false },`)
    .join('\n');

  return `// <auto-generated by scripts/update-player-pool.mjs>\n// Source: ${meta.attribution}. Generated ${meta.fetchedAt}.\n\nusing System.Collections.Generic;\n\npublic static class PlayerData\n{\n    public static List<Player> GetInitialPlayerPool()\n    {\n        return new List<Player>\n        {\n${rows}\n        };\n    }\n}\n`;
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

function appendNote(notes, addition) {
  const base = String(notes || '').trim();
  return base ? `${base} ${addition}` : addition;
}

function normalizePosition(value) {
  const position = String(value || '').trim().toUpperCase();
  if (position === 'DEF' || position === 'D/ST') return 'DST';
  return position;
}

function normalizeTeam(value) {
  const team = String(value || '').trim().toUpperCase();
  return TEAM_ALIASES.get(team) || team;
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
