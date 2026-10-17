// The Start/Sit chat bar end to end: real model code, a small made-up league.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import axios from 'axios';
import { AskBar } from './StartSit';
import { buildLineup, withProjections } from '../data/startSitUtils';
import { positionRanks } from '../data/rankings';

jest.mock('../supabaseClient', () => ({
  SUPABASE_URL: 'https://x.supabase.co',
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) }, channel: () => ({}), removeChannel: () => {} },
}));

const pts = (n) => ({ ppr: n, half: n - 1, std: n - 2 });
const raw = (id, name, position, team, n) => ({
  id, name, position, team, opponent: 'KC', injury: null, points: pts(n), stats: {},
  recent: [1, 2, 3, 4].map((week) => ({ week, opponent: 'X', points: pts(n), stats: {} })),
  seasonAvg: pts(n), seasonStats: null, gamesPlayed: 6, upcoming: [8, 9, 10, 11].map((week) => ({ week, opponent: 'X', points: pts(n) })),
  usage: null, spread: null,
});
const positions = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'K', 'DST'];
const players = [];
positions.forEach((position, slot) => {
  for (let t = 0; t < 12; t += 1) players.push(raw(`${position}${slot}-${t}`, `${position}${slot} Player${t}`, position, `T${t}`, 25 - t - slot));
});
players.push(raw('nabers', 'Malik Nabers', 'WR', 'NYG', 17), raw('olave', 'Chris Olave', 'WR', 'NO', 14), raw('bijan', 'Bijan Robinson', 'RB', 'ATL', 20));
const projections = { season: 2026, week: 7, players, defense: {}, fetchedAt: new Date().toISOString() };
const byId = new Map(players.map((p) => [p.id, p]));
const teamOf = (t) => players.filter((p) => p.team === `T${t}`);

let container;
beforeEach(() => {
  axios.defaults.adapter = (config) => Promise.reject(Object.assign(new Error('Network Error'), { config }));
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});

// A 6-team Sleeper league: you are roster 1, Team 0/1/2/4/5 are rosters 2-6. Week 6 is the last one played.
const leagueSeason = () => {
  const teams = [[1, 'My Squad', [...teamOf(3), byId.get('nabers'), byId.get('olave')]], ...[0, 1, 2, 4, 5].map((t, i) => [i + 2, `Team ${t}`, t === 0 ? [...teamOf(0), byId.get('bijan')] : teamOf(t)])]
    .map(([rosterId, name, list]) => ({ rosterId, name, players: list.map((p) => p.id) }));
  const ids = [1, 2, 3, 4, 5, 6];
  const weeks = Array.from({ length: 14 }, (_, w) => {
    const rotated = [ids[0], ...ids.slice(1).map((_, i) => ids[1 + ((i + w) % 5)])];
    const games = [0, 1, 2].map((i) => ({ a: rotated[i], b: rotated[5 - i], aPoints: w < 6 ? 100 + rotated[i] * 3 : 0, bPoints: w < 6 ? 100 + rotated[5 - i] * 3 : 0 }));
    return { week: w + 1, games };
  });
  return { leagueId: 'L1', leagueName: 'Hood Sleeper', season: 2026, fetchedAt: new Date().toISOString(), playoffWeekStart: 15, playoffTeams: 4, medianGame: false, lastScoredWeek: 6, teams, weeks };
};

const renderBar = (leagueId = null) => {
  const mine = [...teamOf(3), byId.get('nabers'), byId.get('olave')];
  const roster = withProjections(mine, byId, 'ppr', 7);
  const partners = [0, 1, 2, 4, 5].map((t) => ({ key: `p${t}`, name: `Team ${t}`, players: t === 0 ? [...teamOf(0), byId.get('bijan')] : teamOf(t) }));
  const rostered = new Set([...mine, ...partners.flatMap((p) => p.players)].map((p) => p.id));
  const waiverPool = withProjections(players.filter((p) => !rostered.has(p.id)), byId, 'ppr', 7);
  const lineup = buildLineup(roster, { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, superFlex: 0, k: 1, def: 1 });
  act(() => {
    ReactDOM.render(
      <AskBar
        projections={projections} projectionsById={byId} roster={roster} lineup={lineup}
        whyCtx={{ defense: {}, allPlayers: players, scoring: 'ppr', waiverPool, waiverNote: null }}
        scoring="ppr" week={7} partners={partners} rosterSettings={{ qb: 1, rb: 2, wr: 3, te: 1, flex: 1, superFlex: 0, k: 1, def: 1 }}
        dynasty={false} ppr={1} rosteredIds={rostered} waiverPool={waiverPool} waiverNote={null}
        posRanks={positionRanks(players, 'ppr')} updatedLabel="updated just now" leagueId={leagueId}
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
  const shown = container.querySelector('.ask-log > li').textContent;
  if (process.env.ASK_DUMP) process.stdout.write(`\n>> ${shown}\n`);
  return shown;
};

test('answers lineup, head-to-head, trade, pickup and drop questions without errors', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  renderBar();
  expect(await ask('Start Nabers or Olave?')).toMatch(/Nabers/);
  expect(container.querySelector('.why-pop.ask-why')).not.toBeNull();
  expect(await ask('who should I start at flex?')).toMatch(/at FLEX/);
  expect(await ask('Should I trade Olave for Bijan?')).toMatch(/Team 0/);
  expect(await ask('find me a trade for a RB')).toMatch(/Trades for a RB|couldn't find a trade/);
  expect(await ask('who should I pick up?')).toMatch(/pickups|No free agent/);
  expect(await ask('who should I drop')).toMatch(/drop in this order|worth holding/);
  expect(await ask('what is Bijan worth rest of season')).toMatch(/pts a game/);
  expect(await ask('why should I trade Olave?')).toMatch(/Chris Olave/);
  expect(await ask('who should I trade away?')).toMatch(/worth shopping|Nobody stands out/);
  const failures = console.error.mock.calls.filter(([msg]) => String(msg).includes('Ask bar failed'));
  expect(failures).toEqual([]);
  expect(container.querySelectorAll('.ask-log > li').length).toBe(5);
});

test('answers team questions from the Sleeper league: power rankings and odds', async () => {
  const season = leagueSeason();
  axios.defaults.adapter = (config) => (config.url.includes('startsit/league?leagueId=L1')
    ? Promise.resolve({ data: season, status: 200, statusText: 'OK', headers: {}, config })
    : Promise.reject(Object.assign(new Error('Network Error'), { config })));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  renderBar('L1');
  expect(await ask('Who has the best team?')).toMatch(/has the best team right now/);
  expect(container.querySelectorAll('.ask-log > li:first-child .ask-items li').length).toBe(6);
  expect(await ask('What are my playoff odds?')).toMatch(/You are \d+-\d+, \d+(st|nd|rd|th) of 6\. .*to make the playoffs \(top 4\)/);
  expect(await ask('who wins the championship')).toMatch(/title favorite/);
  expect(await ask('toilet bowl odds')).toMatch(/Toilet bowl watch/);
  expect(await ask('How is Team 4 doing?')).toMatch(/Team 4 is \d+-\d+/);
  expect(await ask('Start Nabers or Olave?')).toMatch(/Nabers/);
  const failures = console.error.mock.calls.filter(([msg]) => String(msg).includes('Ask bar failed'));
  expect(failures).toEqual([]);
});

test('team questions without a Sleeper league say what they need', async () => {
  renderBar(null);
  expect(await ask('what are my playoff chances')).toMatch(/need a Sleeper league/);
});
