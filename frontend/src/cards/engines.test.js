import { claimSeat, computeStats, GAMES, summarize, wakeUp } from './engines';
import { bidValue, canBid } from './five';

const run = (id, players, seed, stopAt = Infinity) => {
  const d = GAMES[id];
  const g = d.create(players, seed, 0);
  let now = 0;
  while (!d.over(g) && now < stopAt) { now += 250; d.tick(g, now); }
  return { g, now };
};

test('500 uses the table values for every bid', () => {
  expect(bidValue('6S')).toBe(40);
  expect(bidValue('6C')).toBe(60);
  expect(bidValue('6D')).toBe(80);
  expect(bidValue('6H')).toBe(100);
  expect(bidValue('6NT')).toBe(120);
  expect(bidValue('7S')).toBe(140);
  expect(bidValue('MIS')).toBe(170);
  expect(bidValue('OPEN')).toBe(380);
  expect(canBid({ high: { bid: '7C' } }, 'MIS')).toBe(true);
  expect(canBid({ high: { bid: '7D' } }, 'MIS')).toBe(false);
});

test('bot-only games of both finish, and survive a save and resume', () => {
  ['five', 'clubs'].forEach((id) => {
    for (let seed = 1; seed < 40; seed += 1) {
      const first = run(id, [{ cid: 'a', name: 'Tyler' }], seed, 60000);
      // Save mid-game as JSON, then pick it up again.
      const g = wakeUp(JSON.parse(JSON.stringify(first.g)), 0);
      const d = GAMES[id];
      let now = 0;
      while (!d.over(g) && now < 3e7) { now += 250; d.tick(g, now); }
      expect(d.over(g)).toBe(true);
    }
  });
});

test('Double Nola: both partners play and a trick by either one sets them', () => {
  const g = GAMES.five.create([], 7, 0);
  g.phase = 'bid';
  g.turn = 0;
  g.high = null;
  g.passed = [false, false, false, false];
  const five = require('./five');
  five.bid(g, 0, 'OPEN', 0);
  five.bid(g, 1, 'PASS', 0);
  five.bid(g, 2, 'PASS', 0);
  five.bid(g, 3, 'PASS', 0);
  expect(g.contract.bid).toBe('OPEN');
  expect(g.out).toBe(null);
  let now = 0;
  while (g.phase !== 'hand' && now < 1e6) { now += 250; five.tick(g, now); }
  const teamTricks = g.tricks[0] + g.tricks[2];
  expect(g.result.made).toBe(teamTricks === 0);
});

test('a returning player takes their seat back', () => {
  const g = GAMES.five.create([{ cid: 'a', name: 'Tyler' }, { cid: 'b', name: 'Pat' }], 3, 0);
  expect(claimSeat(g, 1, 'b2', 'Pat', 0)).toBe(true);
  expect(g.seats[1].cid).toBe('b2');
  expect(g.seats[1].name).toBe('Pat');
});

test('stats count partners, matchups and totals from finished games', () => {
  const five = (teams, winner) => ({
    game: 'five',
    seats: [
      { name: teams[0][0], team: 0, bot: false }, { name: teams[1][0], team: 1, bot: false },
      { name: teams[0][1], team: 0, bot: false }, { name: teams[1][1], team: 1, bot: false },
    ],
    scores: winner === 0 ? [510, 200] : [100, 520],
    winner,
    stats: [{ bids: 2, made: 1, set: 1, tricks: 12 }, {}, {}, {}],
    history: [],
  });
  const s = computeStats(
    [five([['Tyler', 'Pat'], ['Ben', 'Logan']], 0), five([['Pat', 'Tyler'], ['Logan', 'Ben']], 1), five([['Tyler', 'Pat'], ['Ben', 'Logan']], 0)],
    [{ game: 'clubs', seats: [{ name: 'Tyler', score: 0 }, { name: 'Boo', bot: true, score: 4 }], winners: ['Tyler'], stats: [] }],
  );
  const pair = s.pairs.find((p) => p.name === 'Pat & Tyler');
  expect(pair).toMatchObject({ games: 3, wins: 2 });
  expect(s.matchups).toHaveLength(1);
  expect(s.matchups[0].aWins + s.matchups[0].bWins).toBe(3);
  const tyler = s.players.find((p) => p.name === 'Tyler');
  expect(tyler.five).toMatchObject({ games: 3, wins: 2 });
  expect(tyler.clubs).toMatchObject({ games: 1, wins: 1 });
  expect(s.players.find((p) => p.name === 'Boo')).toBeUndefined();
  expect(summarize('five', GAMES.five.create([], 1, 0)).teams).toHaveLength(2);
});

test('500: 5-card kitty, the bidder hands one discard over, the partner throws one: 10 cards each, 5 discarded', () => {
  const five = require('./five');
  for (let seed = 1; seed < 60; seed += 1) {
    const g = GAMES.five.create([], seed, 0);
    let now = 0;
    let checked = 0;
    const bad = [];
    while (!GAMES.five.over(g) && now < 3e6) {
      now += 250;
      GAMES.five.tick(g, now);
      if (g.phase === 'deal' && g.kitty.length !== 5) bad.push(`kitty ${g.kitty.length}`);
      if (g.phase === 'play' && g.trickNo === 0 && !g.trick.plays.length) {
        g.hands.forEach((h) => { if (h.length !== five.HAND) bad.push(`hand ${h.length}`); });
        if (g.discards.length !== 5) bad.push(`discards ${g.discards.length}`);
        checked += 1;
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  }
});
