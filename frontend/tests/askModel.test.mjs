// The Start/Sit chat bar: `node --test frontend/tests/askModel.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, askedPosition, findPlayers, questionType } from '../src/data/askModel.js';
import { buildLineup } from '../src/data/startSitUtils.js';

const player = (id, name, position, team, points, extra = {}) => ({
  id, name, position, team, opponent: 'KC', points, injury: null, recent: [], seasonAvg: null, gamesPlayed: 5, upcoming: [], ...extra,
});
const everyone = [
  player('nabers', 'Malik Nabers', 'WR', 'NYG', 16),
  player('olave', 'Chris Olave', 'WR', 'NO', 13),
  player('ajb', 'A.J. Brown', 'WR', 'PHI', 15),
  player('sbrown', 'Amon-Ra St. Brown', 'WR', 'DET', 18),
  player('mbrown', 'Marquise Brown', 'WR', 'KC', 8),
  player('bijan', 'Bijan Robinson', 'RB', 'ATL', 19),
  player('mixon', 'Joe Mixon', 'RB', 'HOU', 12, { injury: 'Questionable' }),
  player('chase', "Ja'Marr Chase", 'WR', 'CIN', 17),
  player('mhj', 'Marvin Harrison Jr.', 'WR', 'ARI', 11),
  player('kc', 'Kansas City Chiefs', 'DST', 'KC', 7),
  player('bye', 'Bye Guy', 'TE', 'SEA', 0, { onBye: true }),
];

test('finds players by full name, last name, first name and nickname, in order', () => {
  const ids = (text, opts) => findPlayers(text, everyone, opts).map((f) => f.player.id);
  assert.deepEqual(ids('Start Nabers or Olave?'), ['nabers', 'olave']);
  assert.deepEqual(ids('should i trade bijan for chase'), ['bijan', 'chase']);
  assert.deepEqual(ids("Is Amon-Ra St. Brown's matchup good?"), ['sbrown']);
  assert.deepEqual(ids('mhj or ajb'), ['mhj', 'ajb']);
  assert.deepEqual(ids('Marvin Harrison'), ['mhj']);
  assert.deepEqual(ids('chiefs defense'), ['kc']);
  // "Brown" alone: the one projected highest, unless one is on your team.
  const brown = findPlayers('start brown?', everyone);
  assert.equal(brown[0].player.id, 'sbrown');
  assert.ok(brown[0].alternatives.length >= 1);
  assert.deepEqual(ids('start brown?', { myIds: new Set(['mbrown']) }), ['mbrown']);
  assert.deepEqual(ids('who should i start this week'), []);
});

test('reads the kind of question and the position', () => {
  const type = (text) => questionType(text, findPlayers(text, everyone));
  assert.equal(type('Start Nabers or Olave?'), 'compare');
  assert.equal(type('Should I trade Bijan for Chase?'), 'trade');
  assert.equal(type('who should i pick up at rb'), 'pickup');
  assert.equal(type('who should I drop'), 'drop');
  assert.equal(type('is mixon hurt'), 'injury');
  assert.equal(type('is mixon a good matchup this week'), 'matchup');
  assert.equal(type('what is bijan worth rest of season'), 'value');
  assert.equal(type('where does olave rank'), 'rank');
  assert.equal(type('who should i start at flex'), 'lineup');
  assert.equal(type("who's on bye"), 'bye');
  assert.equal(type('how accurate are your picks'), 'accuracy');
  assert.equal(type('hello there'), 'unknown');
  assert.equal(askedPosition('who should i start at flex'), 'FLEX');
  assert.equal(askedPosition('best running back pickup'), 'RB');
});

const ctxFor = (rosterIds, extra = {}) => {
  const roster = everyone.filter((p) => rosterIds.includes(p.id));
  const lineup = buildLineup(roster, { qb: 0, rb: 1, wr: 2, te: 1, flex: 1, superFlex: 0, k: 0, def: 0 });
  return {
    allPlayers: everyone, roster, lineup, scoring: 'ppr', week: 7, defense: {},
    whyCtx: { defense: {}, allPlayers: everyone, scoring: 'ppr', waiverPool: [] },
    myIds: new Set(rosterIds), leagueIds: null,
    scored: (p) => roster.find((r) => r.id === p.id) || p,
    outlookOf: () => ({ perGame: 14.2, value: 12.9, remaining: 11, missed: 1, backWeek: null, notes: ['Questionable this week.'] }),
    valueOf: () => ({ label: null, tag: null }),
    seasonRankOf: () => 9,
    trades: null, waivers: null,
    ...extra,
  };
};

test('answers with the model: head to head, lineup spot, a player not on your team', () => {
  const ctx = ctxFor(['nabers', 'olave', 'chase', 'bijan', 'mixon', 'bye']);
  const pair = answerQuestion('Start Nabers or Olave?', ctx);
  assert.match(pair.text, /Nabers/);
  assert.equal(pair.why.names[0], 'Malik Nabers');

  const flex = answerQuestion('who should I start at flex?', ctx);
  assert.match(flex.text, /^Start .+ at FLEX\.$/);
  assert.ok(flex.why);

  const lineup = answerQuestion('set my lineup', ctx);
  assert.match(lineup.text, /Your best lineup projects/);
  assert.equal(lineup.items.length, ctx.lineup.starters.length);

  const other = answerQuestion('should I start AJ Brown', ctx);
  assert.match(other.text, /Not on your team/);
  assert.ok(other.why);

  assert.match(answerQuestion('who is on bye', ctx).text, /On bye in week 7/);
  assert.match(answerQuestion('is mixon hurt?', ctx).text, /Questionable/);
  assert.match(answerQuestion('what is bijan worth', ctx).text, /14\.2 pts a game/);
  assert.match(answerQuestion('where does olave rank', ctx).text, /WR9 in the season rankings/);
});

test('trades and pickups go to the league model, and need a league', () => {
  assert.match(answerQuestion('trade bijan for chase?', ctxFor(['bijan'])).text, /need a league/);
  const calls = [];
  const ctx = ctxFor(['bijan', 'nabers'], {
    trades: {
      rate: (give, get) => { calls.push([give.map((p) => p.id), get.map((p) => p.id)]); return { text: 'Fair: trade.', why: null }; },
      find: () => [],
    },
    waivers: () => ({ moves: [], drops: [], holds: [] }),
  });
  assert.equal(answerQuestion('Should I trade Bijan for Chase?', ctx).text, 'Fair: trade.');
  // Sides named the other way round still land on the right side.
  answerQuestion('trade for chase, give bijan', ctx);
  assert.deepEqual(calls, [[['bijan'], ['chase']], [['bijan'], ['chase']]]);
  assert.match(answerQuestion('find me a trade for a WR', ctx).text, /couldn't find a trade for a WR/);
  assert.match(answerQuestion('who should I pick up', ctx).text, /No free agent/);
  assert.match(answerQuestion('should i drop nabers', ctx).text, /Keep Malik Nabers/);
});

test('"why should I trade X" and "who should I trade away" give reasons, not just a list', () => {
  const sellTag = { key: 'sell', label: 'Sell high' };
  const ctx = ctxFor(['bijan', 'nabers', 'olave', 'chase', 'mixon'], {
    trades: {
      rate: () => ({ text: 'x' }),
      find: ({ give }) => (give.length ? [{ partnerName: 'Team Log', give: [give[0], everyone[0]], get: [everyone[5]], myChange: 5.1, theirChange: 0.4 }] : []),
    },
    valueOf: (p) => ({ label: null, tag: p.id === 'olave' ? sellTag : null }),
    isSeasonStarter: (p) => ['bijan', 'nabers', 'chase', 'mixon'].includes(p.id),
  });
  const one = answerQuestion('Why should I trade Chris Olave?', ctx);
  assert.match(one.text, /^Chris Olave is worth shopping\./);
  assert.match(one.text, /bench player/);
  assert.match(one.text, /good time to sell/);
  assert.match(one.items[0].detail, /\+5\.1 pts a week\. Two-for-one/);
  assert.match(one.items[0].detail, /may say yes/);

  assert.match(answerQuestion('should i trade bijan', ctx).text, /^Only trade Bijan Robinson for a clear upgrade\./);
  assert.match(answerQuestion('why should I trade AJ Brown', ctx).text, /isn't on your team/);

  const list = answerQuestion('Who should I trade away?', ctx);
  assert.equal(list.text, 'Players worth shopping:');
  assert.equal(list.items[0].name, 'Chris Olave');
  assert.match(list.items[0].detail, /Sell high/);
});

test('questions it cannot place get examples, not a guess', () => {
  const answer = answerQuestion('what is the weather', ctxFor([]));
  assert.ok(answer.examples.length > 0);
});
