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

const renderBar = () => {
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
        posRanks={positionRanks(players, 'ppr')} updatedLabel="updated just now"
      />,
      container,
    );
  });
};

const ask = (text) => {
  const input = container.querySelector('input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  const shown = container.querySelector('.ask-log > li').textContent;
  if (process.env.ASK_DUMP) process.stdout.write(`\n>> ${shown}\n`);
  return shown;
};

test('answers lineup, head-to-head, trade, pickup and drop questions without errors', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  renderBar();
  expect(ask('Start Nabers or Olave?')).toMatch(/Nabers/);
  expect(container.querySelector('.why-pop.ask-why')).not.toBeNull();
  expect(ask('who should I start at flex?')).toMatch(/at FLEX/);
  expect(ask('Should I trade Olave for Bijan?')).toMatch(/Team 0/);
  expect(ask('find me a trade for a RB')).toMatch(/Trades for a RB|couldn't find a trade/);
  expect(ask('who should I pick up?')).toMatch(/pickups|No free agent/);
  expect(ask('who should I drop')).toMatch(/drop in this order|worth holding/);
  expect(ask('what is Bijan worth rest of season')).toMatch(/pts a game/);
  const failures = console.error.mock.calls.filter(([msg]) => String(msg).includes('Ask bar failed'));
  expect(failures).toEqual([]);
  expect(container.querySelectorAll('.ask-log > li').length).toBe(5);
});
