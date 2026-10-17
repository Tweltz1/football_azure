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
  assert.equal(type('hello there'), 'smalltalk');
  assert.equal(type('what is the meaning of life'), 'unknown');
  // Questions about the team, lists and comparisons beyond this week.
  assert.equal(type('Top 10 WRs this week'), 'rankings');
  assert.equal(type("Who's hurt on my team?"), 'teaminjuries');
  assert.equal(type('who are good buy low targets'), 'buylow');
  assert.equal(type('What does my team need?'), 'needs');
  assert.equal(type('who does mixon play this week'), 'matchup');
  assert.equal(type('bijan or chase rest of season'), 'comparevalue');
  assert.equal(type('who has more upside, nabers or olave'), 'compareceiling');
  assert.equal(type('olave stats'), 'stats');
  assert.equal(type('is olave available'), 'availability');
  assert.equal(type('Olave for Chase, is that fair?'), 'trade');
  assert.equal(type('thanks'), 'smalltalk');
  assert.equal(askedPosition('who should be my wr2'), 'WR');
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

  assert.match(answerQuestion('who is on bye', ctx).text, /On bye this week \(week 7\): Bye Guy\./);
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
  const ideas = one.sections.find((sec) => sec.title.startsWith('Trades using')).items;
  assert.match(ideas[0].detail, /\+5\.1 pts a week\. Two-for-one/);
  assert.match(ideas[0].detail, /may say yes/);
  assert.deepEqual(one.items.map((i) => i.name), ['Questionable this week.']);

  assert.match(answerQuestion('should i trade bijan', ctx).text, /^Only trade Bijan Robinson for a clear upgrade\./);
  assert.match(answerQuestion('why should I trade AJ Brown', ctx).text, /isn't on your team/);

  // A teammate coming back and their share of the work are part of the reasons.
  const returning = ctxFor(['bijan', 'nabers', 'olave', 'chase', 'mixon'], {
    trades: { rate: () => ({}), find: () => [] },
    valueOf: () => ({ label: null, tag: null }),
    isSeasonStarter: () => true,
    outlookOf: (p) => (p.id === 'mixon'
      ? { perGame: 11, value: 10, remaining: 11, missed: 0, roleChange: -3.2, notes: ['Pierce (RB) is back after missing 3 games of Joe Mixon\'s last 5: about 3.2 fewer pts a game with less work to go around.', 'Sleeper projects 9 a game.'] }
      : { perGame: 14, value: 14, remaining: 11, missed: 0, roleChange: 0, notes: [] }),
  });
  const mixon = { ...everyone.find((p) => p.id === 'mixon'), usage: { carryShare: 0.6, recentCarryShare: 0.45, targetShare: 0.1, recentTargetShare: 0.1, snapShare: 0.7, recentSnapShare: 0.58, recentGames: 3 } };
  returning.roster = returning.roster.map((p) => (p.id === 'mixon' ? mixon : p));
  returning.scored = (p) => returning.roster.find((r) => r.id === p.id) || p;
  const why = answerQuestion('why should I trade mixon', returning);
  assert.match(why.text, /^Joe Mixon is worth shopping\./);
  assert.match(why.text, /teammate's return should cut into Joe's work, about 3\.2 fewer/);
  assert.match(why.text, /Plays 70% of HOU's offensive snaps \(58% over the last 3 games\)\. Gets 60% of HOU's carries this season, 45% over the last 3 games, and falling/);
  assert.equal(why.items.length, 1, "Sleeper's own number isn't listed as a reason");
  assert.match(answerQuestion('who should i trade away', returning).items[0].detail, /^Losing work: Pierce \(RB\) is back/);

  const list = answerQuestion('Who should I trade away?', ctx);
  assert.equal(list.text, 'Players worth shopping:');
  assert.equal(list.items[0].name, 'Chris Olave');
  assert.match(list.items[0].detail, /Sell high/);
});

test('questions it cannot place get examples, not a guess', () => {
  const answer = answerQuestion('what is the weather', ctxFor([]));
  assert.ok(answer.examples.length > 0);
});

test('upcoming games: how each defense plays the position and who scored on them', () => {
  const row = (rank, games, pts, recent = []) => ({ games, rank, teams: 32, points: { ppr: pts, half: pts, std: pts }, box: {}, recentGames: recent });
  const defense = {
    DAL: { RB: row(30, 6, 14, [{ id: 'x', name: 'Saquon Barkley', team: 'PHI', week: 5, points: { ppr: 8.4 } }]) },
    NYG: { RB: row(2, 6, 29) },
    SEA: { RB: row(16, 2, 21) },
    KC: { RB: row(16, 6, 21) },
  };
  const mixon = { ...everyone.find((p) => p.id === 'mixon'), upcoming: [
    { week: 8, opponent: 'DAL', points: {} }, { week: 9, opponent: null, points: {} }, { week: 10, opponent: 'NYG', points: {} }, { week: 11, opponent: 'SEA', points: {} },
  ] };
  const ctx = ctxFor(['mixon'], { defense });
  ctx.scored = () => mixon;
  ctx.allPlayers = everyone.map((p) => (p.id === 'mixon' ? mixon : p));
  const answer = answerQuestion("what's mixon's upcoming schedule", ctx);
  assert.equal(answer.text, "Joe Mixon's next 3 games: 1 easy, 0 average, 1 tough, 1 too early to tell.");
  const items = answer.sections[0].items;
  assert.deepEqual(items.map((i) => i.name), ['vs DAL: tough', 'vs NYG: easy', 'vs SEA: too early to tell']);
  assert.match(items[0].detail, /DAL has the 3rd fewest points allowed to RBs.*Top RBs against them lately: Saquon Barkley 8\.4\./);
  // The same list rides along with value and matchup answers.
  assert.ok(answerQuestion('what is mixon worth', ctx).sections.length === 1);
});
