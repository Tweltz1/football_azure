import { claimSeat, computeStats, GAMES, setLook, summarize, wakeUp } from './engines';
import { DESIGNS, isUnlocked, progressFor } from './designs';
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
  require('./five').cut(g, g.turn, 20, 0);
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

test('the player left of the dealer cuts the deck before the deal', () => {
  const five = require('./five');
  const clubs = require('./clubs');
  const players = [{ cid: 'a', name: 'Ann' }, { cid: 'b', name: 'Ben' }, { cid: 'c', name: 'Cal' }, { cid: 'd', name: 'Dee' }];
  const g = GAMES.five.create(players, 11, 0);
  expect(g.phase).toBe('cut');
  expect(g.turn).toBe((g.dealer + 1) % 4);
  const deck = [...g.deck];
  const cutter = g.seats[g.turn].cid;
  const other = g.seats[(g.turn + 1) % 4].cid;
  GAMES.five.act(g, other, { type: 'cut', at: 10 }, 0);
  expect(g.phase).toBe('cut');
  expect(GAMES.five.view(g, cutter, 0).myTurn).toBe(true);
  GAMES.five.act(g, cutter, { type: 'cut', at: 10 }, 0);
  expect(g.phase).toBe('deal');
  expect(g.cutAt).toBe(10);
  const cutDeck = deck.slice(10).concat(deck.slice(0, 10));
  expect(g.hands[0]).toEqual(cutDeck.slice(0, 10));
  expect(g.kitty).toEqual(cutDeck.slice(40));
  expect(g.hands.flat().length + g.kitty.length).toBe(45);
  const { isThinCut, clampCut } = require('./cards');
  expect(isThinCut(2, 45)).toBe(true);
  expect(isThinCut(42, 45)).toBe(true);
  expect(isThinCut(10, 45)).toBe(false);
  expect(clampCut(0, 45)).toBe(1);

  // Nobody cuts: the deck is cut for them when the clock runs out.
  const c = GAMES.clubs.create(players, 5, 0);
  expect(c.phase).toBe('cut');
  clubs.tick(c, 1000);
  expect(c.phase).toBe('cut');
  clubs.tick(c, 30000);
  expect(c.phase).toBe('deal');
  expect(c.hands.every((h) => h.length === 5)).toBe(true);
  expect(c.upcard).toBeTruthy();
  expect(five.cut(c, 0, 5, 0)).toBe(false);
});

test('500: bidding goes around once, and only a Double Nola hands a card to the partner', () => {
  const five = require('./five');
  const players = [{ cid: 'a', name: 'Ann' }, { cid: 'b', name: 'Ben' }, { cid: 'c', name: 'Cal' }, { cid: 'd', name: 'Dee' }];
  const start = (bids) => {
    const g = GAMES.five.create(players, 3, 0);
    five.cut(g, g.turn, 20, 0);
    five.tick(g, 10000);
    expect(g.phase).toBe('bid');
    const first = (g.dealer + 1) % 4;
    expect(g.turn).toBe(first);
    bids.forEach((b, k) => expect(five.bid(g, (first + k) % 4, b, 0)).toBe(true));
    return g;
  };
  // Four bids and it's over, even though someone was outbid.
  const g = start(['6C', '6D', '7C', 'PASS']);
  expect(g.phase).toBe('kitty');
  expect(g.contract.bid).toBe('7C');
  const seat = g.contract.seat;
  const out = g.hands[seat].slice(0, 5);
  expect(five.discard(g, seat, out, null, 0)).toBe(true);
  expect(g.phase).toBe('play');
  expect(g.hands.every((h) => h.length === 10)).toBe(true);
  expect(g.discards).toEqual(out);

  // Double Nola: one of the five goes to the partner, who throws one back.
  const d = start(['OPEN', 'PASS', 'PASS', 'PASS']);
  const ds = d.contract.seat;
  const dOut = d.hands[ds].slice(0, 5);
  expect(five.discard(d, ds, dOut, null, 0)).toBe(false);
  expect(five.discard(d, ds, dOut, dOut[0], 0)).toBe(true);
  expect(d.phase).toBe('pass');
  expect(d.turn).toBe((ds + 2) % 4);
});

test('bots play Nola right: duck when bidding it, lead low and dump high when defending it', () => {
  const { botCard } = require('./cards');
  const unseen = ['5D', '6D', '9D', '13D', '12H', '4C'];
  // Defending, leading: the lowest card, never the ace.
  expect(botCard({ hand: ['14D', '4D', '10H'], trick: { plays: [] }, trump: null, playersLeft: 2, unseen, mode: 'defend', bidders: [1] })).toBe('4D');
  // Defending: the Nola player already ducked under the 5D, so throw the highest diamond.
  const ducked = { plays: [{ seat: 0, card: '5D' }, { seat: 1, card: '4D' }] };
  expect(botCard({ hand: ['14D', '7D', '10H'], trick: ducked, trump: null, playersLeft: 0, unseen, mode: 'defend', bidders: [1] })).toBe('14D');
  // Defending, void in the suit led: throw a high off-suit card.
  expect(botCard({ hand: ['13S', '4S', '6H'], trick: ducked, trump: null, playersLeft: 0, unseen, mode: 'defend', bidders: [1] })).toBe('13S');
  // Defending, the Nola player still to play: go low.
  const led = { plays: [{ seat: 0, card: '9D' }] };
  expect(botCard({ hand: ['14D', '7D', '10H'], trick: led, trump: null, playersLeft: 2, unseen, mode: 'defend', bidders: [2] })).toBe('7D');
  // Bidding Nola: the highest card that still loses.
  expect(botCard({ hand: ['14D', '8D', '6D', '4D'], trick: led, trump: null, playersLeft: 2, unseen, mode: 'avoid', bidders: [1] })).toBe('8D');
});

test('bots lay off when their partner is winning, and take a trick they can', () => {
  const { botCard } = require('./cards');
  const trick = { plays: [{ seat: 1, card: '7H' }, { seat: 2, card: '12H' }, { seat: 3, card: '9H' }] };
  // Last to play, partner (seat 2) winning, void in hearts: throw a low card, don't trump.
  expect(botCard({ hand: ['11C', '14C', '4S'], trick, trump: 'C', partner: 2, playersLeft: 0, unseen: [] })).toBe('4S');
  // Same spot but the opponent is winning: trump it as cheaply as possible.
  expect(botCard({ hand: ['11C', '14C', '4S'], trick, trump: 'C', partner: 1, playersLeft: 0, unseen: [] })).toBe('14C');
});

test('a bot with a strong hand takes the lead from its partner', () => {
  const { botCard } = require('./cards');
  const trick = { plays: [{ seat: 1, card: '7H' }, { seat: 2, card: '12H' }] };
  // Bidding side, boss trump (the Joker) with trumps still out, plus two boss aces: win it to pull trump.
  const unseen = ['11C', '9C', '13S', '13D', '14H'];
  expect(botCard({ hand: ['JK', '14S', '14D', '6C'], trick, trump: 'C', partner: 2, playersLeft: 1, unseen, leadTrump: true })).toBe('JK');
  // Without the boss cards, lay off.
  expect(botCard({ hand: ['14S', '6C', '4D'], trick, trump: 'C', partner: 2, playersLeft: 1, unseen, leadTrump: true })).toBe('4D');
});

test('a bot only bids over its partner with a much stronger hand', () => {
  const five = require('./five');
  const g = GAMES.five.create([], 3, 0);
  five.cut(g, g.turn, 20, 0);
  five.tick(g, 10000);
  const me = (g.turn + 2) % 4;
  // Partner (first to bid) says 6 clubs; the opponent between passes.
  five.bid(g, g.turn, '6C', 0);
  five.bid(g, (g.turn), 'PASS', 0);
  g.hands[me] = ['JK', '11H', '11D', '14H', '13H', '12H', '14S', '14D', '5C', '4C'];
  expect(five.botBidFor(g, me)).toMatch(/H$/);
  g.hands[me] = ['9H', '5H', '7D', '13S', '6S', '5S', '8D', '4D', '5C', '4C'];
  expect(five.botBidFor(g, me)).toBe('PASS');
});

test('the score sheet shows every hand and adds up to the score', () => {
  ['five', 'clubs'].forEach((id) => {
    const d = GAMES[id];
    const { g } = run(id, [{ cid: 'a', name: 'Tyler' }], 7, 60000);
    let now = 60000;
    while (!d.over(g) && now < 3e7) { now += 250; d.tick(g, now); }
    const v = d.view(g, 'a', now);
    expect(v.history.length).toBeGreaterThan(0);
    const last = v.history[v.history.length - 1];
    const totals = id === 'five' ? v.scores : v.seats.map((x) => x.score);
    expect(last.scores).toEqual(totals);
    expect(v.history.every((h) => (id === 'five' ? !!h.bidder && !!h.label : h.changes.length === v.seats.length))).toBe(true);
  });
});

test('card designs: 140 of them, Classic for all, Starter when signed in, the rest earned by playing', () => {
  expect(DESIGNS.length).toBe(140);
  expect(new Set(DESIGNS.map((d) => d.id)).size).toBe(140);
  const counts = progressFor([
    {
      seats: [{ name: 'Tyler', uid: 'u1', team: 0 }, { name: 'Bo', bot: true, team: 1 }, { name: 'Pat', team: 0 }, { name: 'Mo', bot: true, team: 1 }],
      scores: [520, -40],
      winner: 0,
      history: [
        { seat: 0, bid: '8S', made: true, slam: true }, { seat: 0, bid: 'MIS', made: true }, { seat: 2, bid: 'OPEN', made: true },
        { seat: 0, bid: '7H', made: false }, { seat: 2, bid: '6D', made: true },
      ],
    },
    { seats: [{ name: 'tyler', team: 0 }, { name: 'X', team: 1 }, { name: 'Y', team: 0 }, { name: 'Z', team: 1 }], scores: [100, 500], winner: 1, history: [] },
    { seats: [{ name: 'Tyler', uid: 'someone-else', team: 0 }], scores: [500, 0], winner: 0, history: [] },
  ], [{ seats: [{ name: 'Tyler', uid: 'u1' }, { name: 'Q' }], winners: ['Tyler'] }], { uid: 'u1', name: 'Tyler' });
  expect(counts).toMatchObject({ games: 3, fiveWins: 1, clubsWins: 1, S: 1, H: 0, D: 0, big: 1, slam: 1, nola: 1, dnola: 1, shutout: 1 });
  const byId = (id) => DESIGNS.find((d) => d.id === id);
  expect(isUnlocked(byId('classic'), null, false)).toBe(true);
  expect(isUnlocked(byId('starter-5'), null, false)).toBe(false);
  expect(isUnlocked(byId('starter-5'), null, true)).toBe(true);
  expect(isUnlocked(byId('S-0'), counts, true)).toBe(true);
  expect(isUnlocked(byId('S-1'), counts, true)).toBe(false);
  expect(isUnlocked(byId('S-0'), counts, false)).toBe(false);
});

test('a saved game remembers who played it by account', () => {
  const { g } = run('five', [{ cid: 'a', name: 'Tyler' }], 3, 1000);
  setLook(g, 'a', { uid: 'u1', design: 'S-3' });
  const sum = summarize('five', g);
  expect(sum.seats.find((x) => x.name === 'Tyler').uid).toBe('u1');
  expect(GAMES.five.view(g, 'a', 1000).seats.find((x) => x.name === 'Tyler').design).toBe('S-3');
});
