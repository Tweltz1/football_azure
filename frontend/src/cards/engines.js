// The two card games behind one interface for the host phone, plus the save summaries and the stats
// worked out from finished games. Pure logic, no React.

import * as five from './five.js';
import * as clubs from './clubs.js';
import { seatOf } from './cards.js';

export const GAMES = {
  five: {
    id: 'five',
    title: '500',
    emoji: '🃏',
    seats: '4 players in 2 teams',
    blurb: 'Bid tricks with your partner, race to 500.',
    create: five.createFive,
    tick: five.tick,
    act(g, cid, msg, now) {
      const seat = seatOf(g, cid);
      if (seat < 0) return;
      if (msg.type === 'cut') five.cut(g, seat, Number(msg.at), now);
      if (msg.type === 'bid') five.bid(g, seat, String(msg.bid || ''), now);
      if (msg.type === 'pass') five.passCard(g, seat, msg.card ? String(msg.card) : null, now);
      if (msg.type === 'discard') five.discard(g, seat, Array.isArray(msg.cards) ? msg.cards.map(String) : [], msg.give ? String(msg.give) : null, now);
      if (msg.type === 'play') five.play(g, seat, String(msg.card || ''), msg.named ? String(msg.named) : null, now);
    },
    over: five.isOver,
    view: five.phoneView,
    addPlayer: five.addPlayer,
    seen: five.seen,
    maxSeats: 4,
  },
  clubs: {
    id: 'clubs',
    title: 'Dirty Clubs',
    emoji: '♣️',
    seats: '4 to 6 players',
    blurb: 'Count down from 15. Clubs turned up means everyone plays.',
    create: clubs.createClubs,
    tick: clubs.tick,
    act(g, cid, msg, now) {
      const seat = seatOf(g, cid);
      if (seat < 0) return;
      if (msg.type === 'cut') clubs.cut(g, seat, Number(msg.at), now);
      if (msg.type === 'bid') clubs.bid(g, seat, Number(msg.bid) || 0, now);
      if (msg.type === 'trump') clubs.nameTrump(g, seat, String(msg.suit || ''), now);
      if (msg.type === 'stay') clubs.stay(g, seat, !!msg.in, now);
      if (msg.type === 'play') clubs.play(g, seat, String(msg.card || ''), now);
    },
    over: clubs.isOver,
    view: clubs.phoneView,
    addPlayer: clubs.addPlayer,
    seen: clubs.seen,
    maxSeats: 6,
  },
};

export const newGameId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`;

/** A saved game picks up with fresh clocks: nobody counts as away until the game starts again. */
export function wakeUp(g, now) {
  g.phaseAt = now;
  g.turnAt = now;
  Object.keys(g.lastSeen).forEach((cid) => { g.lastSeen[cid] = now; });
  g.events = [];
  return g;
}

/** Someone sits in a seat (rejoining a saved game, or taking a bot's place). */
export function claimSeat(g, seat, cid, name, now) {
  const s = g.seats[seat];
  if (!s) return false;
  const old = seatOf(g, cid);
  if (old >= 0 && old !== seat) return false;
  if (!g.players.some((p) => p.cid === cid)) g.players.push({ cid, name });
  g.seats[seat] = { ...s, cid, bot: false, name: s.bot ? name : s.name };
  g.lastSeen[cid] = now;
  g.waiting = (g.waiting || []).filter((x) => x !== cid);
  return true;
}

const human = (seat) => !seat.bot;

/** What gets stored with each save: enough to list it, resume it and count it in the stats. */
export function summarize(gameId, g) {
  if (gameId === 'five') {
    return {
      game: 'five',
      seats: g.seats.map((s, i) => ({ name: s.name, bot: !!s.bot, team: i % 2 })),
      teams: [[g.seats[0].name, g.seats[2].name], [g.seats[1].name, g.seats[3].name]],
      scores: [...g.scores],
      hands: g.handNo,
      winner: g.phase === 'final' ? g.winner : null,
      stats: g.stats,
      history: g.history.map((h) => ({ hand: h.hand, seat: h.seat, bid: h.bid, made: h.made, points: h.points, oppPoints: h.oppPoints })),
    };
  }
  const order = g.seats.map((s, i) => ({ name: s.name, bot: !!s.bot, score: g.scores[i], i }));
  return {
    game: 'clubs',
    seats: order.map(({ name, bot, score }) => ({ name, bot, score })),
    hands: g.handNo,
    winners: g.phase === 'final' ? g.winners.map((i) => g.seats[i].name) : [],
    stats: g.stats,
  };
}

const key = (name) => String(name || '').trim().toLowerCase();
const pct = (w, n) => (n ? Math.round((w / n) * 100) : 0);

/**
 * Stats from finished games. five: summaries of finished 500 games; clubs: summaries of finished Dirty Clubs games.
 * Bots are left out of player records; a partnership or matchup with a bot in it is left out too.
 */
export function computeStats(fiveGames, clubsGames) {
  const players = new Map();
  const player = (name) => {
    const k = key(name);
    if (!players.has(k)) {
      players.set(k, {
        name, five: { games: 0, wins: 0, bids: 0, made: 0, set: 0, tricks: 0, nola: 0 }, clubs: { games: 0, wins: 0, tricks: 0, set: 0, folds: 0 },
      });
    }
    return players.get(k);
  };
  const pairs = new Map();
  const matchups = new Map();
  const pairKey = (a, b) => [key(a), key(b)].sort().join(' & ');
  const pairName = (a, b) => [a, b].sort((x, y) => key(x).localeCompare(key(y))).join(' & ');

  fiveGames.forEach((s) => {
    if (!s || !Array.isArray(s.seats) || s.winner == null) return;
    s.seats.forEach((seat, i) => {
      if (!human(seat)) return;
      const p = player(seat.name);
      p.five.games += 1;
      if (seat.team === s.winner) p.five.wins += 1;
      const st = (s.stats || [])[i] || {};
      p.five.bids += st.bids || 0;
      p.five.made += st.made || 0;
      p.five.set += st.set || 0;
      p.five.tricks += st.tricks || 0;
    });
    (s.history || []).forEach((h) => {
      if ((h.bid === 'MIS' || h.bid === 'OPEN') && s.seats[h.seat] && human(s.seats[h.seat])) player(s.seats[h.seat].name).five.nola += 1;
    });
    const teams = [0, 1].map((t) => s.seats.filter((x) => x.team === t));
    const allHuman = teams.map((list) => list.every(human));
    teams.forEach((list, t) => {
      if (!allHuman[t]) return;
      const k = pairKey(list[0].name, list[1].name);
      if (!pairs.has(k)) pairs.set(k, { name: pairName(list[0].name, list[1].name), games: 0, wins: 0, points: 0 });
      const r = pairs.get(k);
      r.games += 1;
      r.points += (s.scores || [])[t] || 0;
      if (t === s.winner) r.wins += 1;
    });
    if (allHuman[0] && allHuman[1]) {
      const a = pairKey(teams[0][0].name, teams[0][1].name);
      const b = pairKey(teams[1][0].name, teams[1][1].name);
      const [first, second] = a < b ? [0, 1] : [1, 0];
      const k = `${[a, b].sort().join(' vs ')}`;
      if (!matchups.has(k)) {
        matchups.set(k, {
          a: pairName(teams[first][0].name, teams[first][1].name), b: pairName(teams[second][0].name, teams[second][1].name), aWins: 0, bWins: 0,
        });
      }
      const m = matchups.get(k);
      if (s.winner === first) m.aWins += 1; else m.bWins += 1;
    }
  });

  clubsGames.forEach((s) => {
    if (!s || !Array.isArray(s.seats) || !(s.winners || []).length) return;
    const winners = new Set(s.winners.map(key));
    s.seats.forEach((seat, i) => {
      if (!human(seat)) return;
      const p = player(seat.name);
      p.clubs.games += 1;
      if (winners.has(key(seat.name))) p.clubs.wins += 1;
      const st = (s.stats || [])[i] || {};
      p.clubs.tricks += st.tricks || 0;
      p.clubs.set += st.set || 0;
      p.clubs.folds += st.folds || 0;
    });
  });

  const list = [...players.values()].map((p) => ({
    ...p,
    games: p.five.games + p.clubs.games,
    wins: p.five.wins + p.clubs.wins,
    winPct: pct(p.five.wins + p.clubs.wins, p.five.games + p.clubs.games),
    fivePct: pct(p.five.wins, p.five.games),
    clubsPct: pct(p.clubs.wins, p.clubs.games),
    madePct: pct(p.five.made, p.five.bids),
  })).sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || a.name.localeCompare(b.name));
  return {
    players: list,
    pairs: [...pairs.values()].map((p) => ({ ...p, winPct: pct(p.wins, p.games) })).sort((a, b) => b.wins - a.wins || b.winPct - a.winPct),
    matchups: [...matchups.values()].sort((x, y) => (y.aWins + y.bWins) - (x.aWins + x.bWins)),
    totals: { five: fiveGames.filter((s) => s && s.winner != null).length, clubs: clubsGames.filter((s) => s && (s.winners || []).length).length },
  };
}
