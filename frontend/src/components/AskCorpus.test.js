// The chat bar against hundreds of questions a fantasy player might ask, in a 10-team league built from
// the real player list. Every question must get a real answer: no "I didn't find a question" and no errors.
// ASK_REPORT=/path/report.md writes every question and answer to a file for reading through.
import React from 'react';
import fs from 'fs';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import axios from 'axios';
import { AskBar } from './StartSit';
import { ASK_CORPUS } from './askCorpus';
import { buildLineup, withProjections } from '../data/startSitUtils';
import { positionRanks } from '../data/rankings';
import { initialPlayerList } from '../data/playerData';

jest.mock('../supabaseClient', () => ({
  SUPABASE_URL: 'https://x.supabase.co',
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) }, channel: () => ({}), removeChannel: () => {} },
}));

jest.setTimeout(600000);

// ---- A league built from the real player list ----------------------------------------------------
let seed = 11;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const pts = (n) => ({ ppr: Math.round(n * 10) / 10, half: Math.round((n - 1) * 10) / 10, std: Math.round((n - 2) * 10) / 10 });
const SCALE = { QB: [25, 11], RB: [21, 4], WR: [20, 4], TE: [16, 4], K: [10, 6], DST: [10, 4] };
const extras = [
  { id: 'sleeper-5859', name: 'A.J. Brown', position: 'WR', team: 'PHI', rank: 40, bye: 10 },
  { id: 'sleeper-11585', name: 'Tank Bigsby', position: 'RB', team: 'PHI', rank: 150, bye: 10 },
];
const pool = [...initialPlayerList, ...extras];
const nflTeams = [...new Set(pool.map((p) => p.team).filter(Boolean))].sort();
const opponentOf = new Map();
for (let i = 0; i < nflTeams.length; i += 2) {
  opponentOf.set(nflTeams[i], nflTeams[i + 1] || nflTeams[0]);
  opponentOf.set(nflTeams[i + 1] || nflTeams[0], nflTeams[i]);
}
const byPosCount = {};
const players = pool.map((p) => {
  byPosCount[p.position] = (byPosCount[p.position] || 0) + 1;
  const [top, bottom] = SCALE[p.position] || [8, 2];
  const base = Math.max(bottom, top - (byPosCount[p.position] - 1) * ((top - bottom) / 40));
  const out = p.injuryStatus === 'Out' || p.injuryStatus === 'IR';
  const games = [1, 2, 3, 4, 5, 6].map((week) => ({ week, opponent: nflTeams[(week * 3) % nflTeams.length], points: pts(Math.max(0, base + (rand() - 0.5) * base)), stats: {} }));
  const avg = games.reduce((s, g) => s + g.points.ppr, 0) / games.length;
  const skill = ['RB', 'WR', 'TE'].includes(p.position);
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    team: p.team,
    opponent: opponentOf.get(p.team) || null,
    injury: out ? 'Out' : p.injuryStatus === 'Questionable' ? 'Questionable' : null,
    points: pts(out ? 0 : base),
    stats: {},
    recent: games.slice(-4).reverse(),
    seasonAvg: pts(avg),
    seasonStats: null,
    gamesPlayed: 6,
    upcoming: [8, 9, 10, 11].map((week) => ({ week, opponent: nflTeams[(week * 5) % nflTeams.length], points: pts(out && week < 10 ? 0 : base) })),
    usage: skill ? {
      carryShare: p.position === 'RB' ? 0.3 + rand() * 0.4 : 0.02,
      recentCarryShare: p.position === 'RB' ? 0.3 + rand() * 0.4 : 0.02,
      targetShare: p.position === 'RB' ? 0.08 + rand() * 0.08 : 0.12 + rand() * 0.15,
      recentTargetShare: p.position === 'RB' ? 0.08 + rand() * 0.08 : 0.12 + rand() * 0.15,
      snapShare: 0.5 + rand() * 0.45,
      recentSnapShare: 0.5 + rand() * 0.45,
      recentGames: 3,
    } : null,
    spread: null,
  };
});
const defense = {};
nflTeams.forEach((team, i) => {
  defense[team] = {};
  ['QB', 'RB', 'WR', 'TE'].forEach((position, j) => {
    const rank = ((i * 7 + j * 5) % 32) + 1;
    defense[team][position] = {
      games: 6, rank, teams: 32, points: pts(SCALE[position][0] * (1.25 - rank / 64)), box: {},
      recentGames: [{ id: `x-${team}-${position}`, name: `Opposing ${position}`, team: 'XX', week: 6, points: pts(15) }],
    };
  });
});
const projections = { season: 2026, week: 7, currentWeek: 7, players, defense, fetchedAt: new Date().toISOString() };
const byId = new Map(players.map((p) => [p.id, p]));
const byName = (name) => players.find((p) => p.name === name);

// Ten teams drafted in snake order, with the players from Tyler's screenshots placed where they were.
const TEAM_NAMES = ['Im gunna ka’imi', 'Racing with Ruggs', 'CumBoys', 'The Mongolian Graycocks', 'The Dicker Lickers',
  'jeevacation', 'The Faguars', 'The Detarders', 'TEAM LOG', 'Malik Ma Balls'];
const placed = {
  'The Faguars': ['Jaylen Warren', 'Kyren Williams', 'Mike Evans', 'Tee Higgins', 'Joe Burrow', 'Jared Goff'],
  'The Detarders': ['A.J. Brown', 'Brock Purdy'],
  'TEAM LOG': ['Brock Bowers'],
  'Racing with Ruggs': ['Puka Nacua', 'Jaxon Smith-Njigba'],
  CumBoys: ['Amon-Ra St. Brown'],
};
const rosters = new Map(TEAM_NAMES.map((n) => [n, (placed[n] || []).map(byName)]));
const taken = new Set([...rosters.values()].flat().map((p) => p.id));
const needs = { QB: 2, RB: 5, WR: 5, TE: 2, K: 1, DST: 1 };
const ranked = pool.map((p) => byId.get(p.id)).filter((p) => !taken.has(p.id) && p.name !== 'Tank Bigsby' && p.name !== 'Rhamondre Stevenson');
for (let round = 0; round < 16; round += 1) {
  const order = round % 2 ? [...TEAM_NAMES].reverse() : TEAM_NAMES;
  order.forEach((team) => {
    const roster = rosters.get(team);
    if (roster.length >= 16) return;
    const count = (pos) => roster.filter((p) => p.position === pos).length;
    const pick = ranked.find((p) => !taken.has(p.id) && count(p.position) < needs[p.position]);
    if (pick) { roster.push(pick); taken.add(pick.id); }
  });
}
const MY_TEAM = 'The Faguars';
const settings = { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, superFlex: 0, k: 1, def: 1 };

const leagueSeason = () => {
  const teams = TEAM_NAMES.map((name, i) => ({ rosterId: i + 1, name, players: rosters.get(name).map((p) => p.id) }));
  const ids = teams.map((t) => t.rosterId);
  const weeks = Array.from({ length: 14 }, (_, w) => {
    const rot = [ids[0], ...ids.slice(1).map((_, i) => ids[1 + ((i + w) % 9)])];
    return {
      week: w + 1,
      games: [0, 1, 2, 3, 4].map((i) => ({
        a: rot[i], b: rot[9 - i],
        aPoints: w < 6 ? 95 + ((rot[i] * 7 + w * 13) % 45) : 0,
        bPoints: w < 6 ? 95 + ((rot[9 - i] * 11 + w * 5) % 45) : 0,
      })),
    };
  });
  return { leagueId: 'L1', leagueName: 'Hood Sleeper', season: 2026, fetchedAt: new Date().toISOString(), playoffWeekStart: 15, playoffTeams: 6, medianGame: false, lastScoredWeek: 6, teams, weeks };
};

// ---- Questions made from templates, over a spread of players ---------------------------------------
const NAMES = ['Jaylen Warren', 'Kyren Williams', 'Tee Higgins', 'Mike Evans', 'Joe Burrow', 'Bijan Robinson', 'Puka Nacua',
  "Ja'Marr Chase", 'Brock Bowers', 'Jared Goff', 'Malik Nabers', 'Trey McBride', 'Josh Jacobs', 'Derrick Henry', 'CeeDee Lamb'];
const short = (name) => name.split(' ').slice(-1)[0];
const TEMPLATES = [
  (a) => `Should I start ${a}?`,
  (a, b) => `${short(a)} or ${short(b)}?`,
  (a) => `how is ${a.toLowerCase()} doing`,
  (a) => `Is ${short(a)} injured`,
  (a) => `What's ${a}'s outlook?`,
  (a, b) => `Trade ${a} for ${b}?`,
  (a) => `Is ${short(a)} a good matchup this week`,
  (a) => `Where does ${a} rank`,
  (a) => `${a} rest of season value`,
  (a) => `Who does ${short(a)} play next?`,
  (a) => `${a} stats last 3 weeks`,
  (a) => `Should I drop ${short(a)}?`,
  (a) => `${short(a)} projection`,
  (a, b) => `Who's better ${a} or ${b} rest of season`,
];
const generated = NAMES.flatMap((a, i) => TEMPLATES.map((template) => ({ tag: 'template', turns: [template(a, NAMES[(i + 3) % NAMES.length])] })));

// ---- Running a conversation ---------------------------------------------------------------------
let container;
beforeAll(() => {
  const season = leagueSeason();
  axios.defaults.adapter = (config) => (String(config.url).includes('startsit/league?leagueId=L1')
    ? Promise.resolve({ data: season, status: 200, statusText: 'OK', headers: {}, config })
    : Promise.reject(Object.assign(new Error('Network Error'), { config })));
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterAll(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});

const renderBar = () => {
  ReactDOM.unmountComponentAtNode(container);
  const mine = rosters.get(MY_TEAM);
  const posRanks = positionRanks(players, 'ppr');
  const roster = withProjections(mine, byId, 'ppr', 7).map((p) => ({ ...p, posRank: posRanks.get(p.id) || null }));
  const partners = TEAM_NAMES.filter((n) => n !== MY_TEAM).map((name, i) => ({ key: `p${i}`, name, players: rosters.get(name) }));
  const rostered = new Set([...rosters.values()].flat().map((p) => p.id));
  const waiverPool = withProjections(players.filter((p) => !rostered.has(p.id)), byId, 'ppr', 7);
  act(() => {
    ReactDOM.render(
      <AskBar
        projections={projections} projectionsById={byId} roster={roster} lineup={buildLineup(roster, settings)}
        whyCtx={{ defense, allPlayers: players, scoring: 'ppr', waiverPool, waiverNote: null }}
        scoring="ppr" week={7} partners={partners} rosterSettings={settings}
        dynasty={false} ppr={1} rosteredIds={rostered} waiverPool={waiverPool} waiverNote={null}
        posRanks={posRanks} updatedLabel="updated just now" leagueId="L1"
      />,
      container,
    );
  });
};

const ask = async (text) => {
  const input = container.querySelector('input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  const answer = container.querySelector('.ask-log > li .ask-answer');
  return { lead: answer.querySelector('p').textContent, all: answer.textContent };
};

const FALLBACK = /I didn't find a player or a question|Something went wrong/;

test('every question in the corpus gets a real answer', async () => {
  const errors = [];
  jest.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.map((a) => (a?.stack ? a.stack : String(a))).join(' ')));
  const conversations = [...ASK_CORPUS, ...generated];
  const report = [];
  const gaps = [];
  for (const conversation of conversations) {
    renderBar();
    for (const q of conversation.turns) {
      // eslint-disable-next-line no-await-in-loop
      const { lead, all } = await ask(q);
      report.push(`### [${conversation.tag}] ${q}\n${all.slice(0, 600)}\n`);
      if (FALLBACK.test(all)) gaps.push(`[${conversation.tag}] ${q} -> ${lead}`);
    }
  }
  if (process.env.ASK_REPORT) fs.writeFileSync(process.env.ASK_REPORT, `${report.length} questions\n\nGAPS (${gaps.length}):\n${gaps.join('\n')}\n\n${report.join('\n')}`);
  expect(errors.filter((e) => e.includes('Ask bar failed'))).toEqual([]);
  expect(gaps).toEqual([]);
});
