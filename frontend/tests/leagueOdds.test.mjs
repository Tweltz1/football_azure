// League odds for team questions: `node --test frontend/tests/leagueOdds.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bracketOrder, findMyTeam, leagueOutlook, recordsSoFar, weeklyExpected } from '../src/data/leagueOdds.js';

const settings = { qb: 1, rb: 1, wr: 1, te: 0, flex: 0, superFlex: 0, k: 0, def: 0 };
const rated = (id, position, perGame, extra = {}) => ({ id, name: id, position, points: perGame, outlook: { perGame, missed: 0 }, ...extra });

// 4 teams, 6 regular season weeks (round robin twice), 2-team playoff from week 7.
const pairings = [[[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1, 4], [2, 3]]];
const makeSeason = (lastScoredWeek, scores = {}) => ({
  leagueId: 'L', leagueName: 'Test League', season: 2026, playoffWeekStart: 7, playoffTeams: 2, medianGame: false, lastScoredWeek,
  teams: [1, 2, 3, 4].map((id) => ({ rosterId: id, name: `Team ${id}`, players: [`p${id}`] })),
  weeks: [1, 2, 3, 4, 5, 6].map((week) => ({
    week,
    games: pairings[(week - 1) % 3].map(([a, b]) => ({ a, b, aPoints: scores[week]?.[a] ?? 0, bPoints: scores[week]?.[b] ?? 0 })),
  })),
});
const rosters = { 1: 140, 2: 110, 3: 100, 4: 80 };
const ratedRoster = (team) => [
  rated(`qb${team.rosterId}`, 'QB', rosters[team.rosterId] / 3),
  rated(`rb${team.rosterId}`, 'RB', rosters[team.rosterId] / 3),
  rated(`wr${team.rosterId}`, 'WR', rosters[team.rosterId] / 3),
];

test('bracket order gives byes to the top seeds', () => {
  assert.deepEqual(bracketOrder(2), [1, 2]);
  assert.deepEqual(bracketOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test('weekly expected points skip byes and games a player will miss', () => {
  const players = [rated('q', 'QB', 20, { bye: 8 }), rated('r', 'RB', 15, { outlook: { perGame: 15, missed: 2 } }), rated('w', 'WR', 10)];
  const weeks = weeklyExpected(players, settings, 7, 10);
  assert.equal(weeks.get(7), 30, 'RB out this week and next');
  assert.equal(weeks.get(8), 10, 'QB on bye too');
  assert.equal(weeks.get(9), 45);
});

test('records so far count wins, points and median games', () => {
  const season = { ...makeSeason(2, { 1: { 1: 120, 2: 100, 3: 90, 4: 80 }, 2: { 1: 100, 3: 110, 2: 70, 4: 75 } }), medianGame: true };
  const records = recordsSoFar(season);
  assert.deepEqual([records.get(1).wins, records.get(1).losses], [3, 1], 'won week 1 and both median games, lost week 2');
  assert.equal(records.get(1).pointsFor, 220);
  assert.deepEqual([records.get(4).wins, records.get(4).losses], [1, 3]);
});

test('the strongest team has the best odds, the weakest is most likely to finish last', () => {
  const scores = { 1: { 1: 150, 2: 100, 3: 105, 4: 70 }, 2: { 1: 135, 3: 95, 2: 115, 4: 85 } };
  const result = leagueOutlook(makeSeason(2, scores), { ratedRoster, rosterSettings: settings, myRosterId: 2, sims: 3000 });
  const [one, two, three, four] = [1, 2, 3, 4].map((id) => result.byId.get(id));
  assert.deepEqual(result.powerOrder.map((t) => t.rosterId), [1, 2, 3, 4]);
  assert.ok(one.playoffs > 0.9, `team 1 playoffs ${one.playoffs}`);
  assert.ok(one.title > two.title && two.title > four.title);
  assert.ok(four.last > 0.6, `team 4 last ${four.last}`);
  const total = (key) => [one, two, three, four].reduce((s, t) => s + t[key], 0);
  assert.ok(Math.abs(total('playoffs') - 2) < 1e-9, 'two playoff spots every season');
  assert.ok(Math.abs(total('title') - 1) < 1e-9);
  assert.ok(Math.abs(total('last') - 1) < 1e-9);
  assert.equal(two.mine, true);
  assert.equal(two.nextWeek, 3);
  assert.ok(two.playoffsIfWin > two.playoffsIfLoss, 'winning next week helps');
  assert.ok(two.winNext > 0.5, 'team 2 is favored over team 3 in week 3');
  assert.equal(result.remainingWeeks, 4);
  assert.ok(one.wins > 5 && one.wins <= 6);
  assert.deepEqual(result.standings.map((t) => t.rosterId).slice(0, 2), [1, 2]);
  assert.ok(Number.isFinite(two.scheduleStrength));
});

test('same question, same answer', () => {
  const a = leagueOutlook(makeSeason(0), { ratedRoster, rosterSettings: settings, sims: 500 });
  const b = leagueOutlook(makeSeason(0), { ratedRoster, rosterSettings: settings, sims: 500 });
  assert.deepEqual(a.teams.map((t) => t.playoffs), b.teams.map((t) => t.playoffs));
});

test('finds the user team by roster overlap', () => {
  assert.equal(findMyTeam(makeSeason(0), new Set(['p3', 'x'])), 3);
  assert.equal(findMyTeam(makeSeason(0), new Set(['x'])), null);
});
