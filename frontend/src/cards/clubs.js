// Dirty Clubs: 4 to 6 players, each on their own, 5 cards each from a full deck. Everyone starts at
// 15 and counts down: every trick you take is one off your score, and the first to 0 wins.
//  - The dealer turns up a card. If it's a club, clubs are trump ("dirty clubs!") and everyone has to play.
//  - Otherwise each player bids once, 2 to 5 tricks (dealer is stuck with 2 if nobody bids), and the
//    high bidder names trump. Everyone else chooses to play or fold; if clubs are named, nobody can fold.
//  - Take no tricks after staying in, or miss your bid, and you're "set": 5 goes back on your score.
// Euchre bowers: the jack of trump is highest, then the other jack of the same color. Pure logic, no React.

import {
  botCutAt, clampCut, CUT_MS, cutDeck,
  ACTIVE_MS, autoSeat, botCard, BOT_MS, effSuit, emit, isTrump, ledSuitOf, legalCards, makeDeck, makeSeats, mulberry, rankOf, unseenCards,
  seatOf, seatWaiting, setPhase, shuffle, sortHand, SUITS, winningPlay,
} from './cards.js';

const DECK = makeDeck();
export const MIN_SEATS = 4;
export const MAX_SEATS = 6;
export const HAND = 5;
export const START = 15;
export const SET = 5;
export const MIN_BID = 2;
export const DEAL_MS = 3000;
export const DIRTY_MS = 3600;
export const STAY_MS = 25000;
export const TRICK_MS = 1600;
export const HAND_MS = 8000;

const freshStats = () => ({ tricks: 0, made: 0, set: 0, folds: 0, bids: 0 });

function deal(s, now) {
  seatWaiting(s);
  const n = s.seats.length;
  s.deck = shuffle(mulberry((s.seed + s.handNo * 7919 + 1) | 0), makeDeck());
  s.hands = s.seats.map(() => []);
  s.upcard = null;
  s.cutAt = null;
  s.handNo += 1;
  s.dirty = false;
  s.trump = null;
  s.bids = [];
  s.high = null;
  s.bidder = null;
  s.inHand = s.seats.map(() => null); // true playing, false folded, null undecided
  s.tricks = s.seats.map(() => 0);
  s.trick = { plays: [] };
  s.lastTrick = null;
  s.trickNo = 0;
  s.gone = [];
  s.result = null;
  // The player to the dealer's left cuts, then the cards go out.
  s.turn = (s.dealer + 1) % n;
  s.turnAt = now;
  setPhase(s, 'cut', now);
  emit(s, 'shuffle', { dealer: s.dealer });
}

/** The cutter splits the deck: `at` cards from the top go to the bottom. Then the hand is dealt and a card turned up. */
export function cut(s, seat, at, now) {
  if (s.phase !== 'cut' || seat !== s.turn) return false;
  const n = s.seats.length;
  s.cutAt = clampCut(at, s.deck.length);
  const deck = cutDeck(s.deck, s.cutAt);
  s.hands = s.seats.map((_, i) => deck.slice(i * HAND, i * HAND + HAND));
  s.upcard = deck[n * HAND];
  s.deck = [];
  s.dirty = s.upcard.slice(-1) === 'C';
  s.trump = s.dirty ? 'C' : null;
  setPhase(s, 'deal', now);
  emit(s, 'deal', { dealer: s.dealer, dirty: s.dirty, cutAt: s.cutAt });
  return true;
}

/** A new game. players: [{ cid, name }]. Up to six sit down; bots fill the table up to four. */
export function createClubs(players, seed = Date.now(), now = 0) {
  const rand = mulberry(seed);
  const seats = makeSeats(players, MIN_SEATS, MAX_SEATS);
  const s = {
    seed: seed | 0,
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    seats,
    waiting: [],
    dealer: Math.floor(rand() * seats.length),
    handNo: 0,
    scores: seats.map(() => START),
    prevScores: seats.map(() => START),
    history: [],
    stats: seats.map(() => freshStats()),
    winners: [],
    phase: 'deal',
    phaseAt: now,
    lastSeen: {},
    events: [],
    eventId: 0,
  };
  s.players.forEach((p) => { s.lastSeen[p.cid] = now; });
  deal(s, now);
  return s;
}

const count = (s) => s.seats.length;
const setTurn = (s, seat, now) => { s.turn = seat; s.turnAt = now; };
const nextIn = (s, seat) => {
  let n = (seat + 1) % count(s);
  for (let k = 0; k < count(s) && s.inHand[n] === false; k += 1) n = (n + 1) % count(s);
  return n;
};
const players = (s) => s.inHand.filter((x) => x === true).length;

function startPlay(s, now) {
  s.inHand = s.inHand.map((x) => x !== false);
  // Left of the dealer leads, or the first player still in after them.
  const lead = s.inHand[(s.dealer + 1) % count(s)] ? (s.dealer + 1) % count(s) : nextIn(s, (s.dealer + 1) % count(s));
  s.trick = { plays: [] };
  setTurn(s, lead, now);
  setPhase(s, 'play', now);
  emit(s, 'play-start');
}

/** A bid of 2 to 5, or 0 to pass, from the seat whose turn it is. Each player bids once; the dealer goes last. */
export function bid(s, seat, value, now) {
  if (s.phase !== 'bid' || seat !== s.turn) return false;
  const v = Number(value) || 0;
  const highV = s.high ? s.high.bid : 0;
  const isDealer = seat === s.dealer;
  if (v) {
    if (v < MIN_BID || v > HAND || v <= highV) return false;
    s.high = { seat, bid: v };
    emit(s, 'bid', { seat, bid: v });
  } else if (isDealer && !s.high) {
    // Everyone passed: the dealer is stuck with the minimum.
    s.high = { seat, bid: MIN_BID, stuck: true };
    emit(s, 'stuck', { seat });
  } else {
    emit(s, 'pass', { seat });
  }
  s.bids.push({ seat, bid: v || (isDealer && s.high?.stuck ? MIN_BID : 0), stuck: !!(isDealer && s.high?.stuck) });
  if (isDealer) {
    s.bidder = s.high.seat;
    s.stats[s.bidder].bids += 1;
    setTurn(s, s.bidder, now);
    setPhase(s, 'trump', now);
    emit(s, 'won-bid', { seat: s.bidder, bid: s.high.bid });
  } else {
    setTurn(s, (seat + 1) % count(s), now);
  }
  return true;
}

/** The high bidder names trump. Clubs means everyone has to play. */
export function nameTrump(s, seat, suit, now) {
  if (s.phase !== 'trump' || seat !== s.bidder || !SUITS.includes(suit)) return false;
  s.trump = suit;
  s.inHand = s.seats.map((_, i) => (i === s.bidder || suit === 'C' ? true : null));
  emit(s, 'trump', { suit });
  if (suit === 'C') startPlay(s, now);
  else setPhase(s, 'stay', now);
  return true;
}

/** Play or fold, everyone at once (not the bidder). */
export function stay(s, seat, inOrOut, now) {
  if (s.phase !== 'stay' || seat < 0 || s.inHand[seat] !== null) return false;
  s.inHand[seat] = !!inOrOut;
  if (!inOrOut) s.stats[seat].folds += 1;
  emit(s, inOrOut ? 'in' : 'fold', { seat });
  if (s.inHand.every((x) => x !== null)) finishStay(s, now);
  return true;
}

function finishStay(s, now) {
  if (players(s) <= 1) {
    // Everyone folded: the bidder takes every trick without a card played.
    s.tricks[s.bidder] = HAND;
    s.stats[s.bidder].tricks += HAND;
    emit(s, 'all-fold', { seat: s.bidder });
    score(s, now);
    return;
  }
  startPlay(s, now);
}

/** Play a card. */
export function play(s, seat, card, now) {
  if (s.phase !== 'play' || seat !== s.turn) return false;
  const hand = s.hands[seat];
  if (!hand.includes(card)) return false;
  if (!legalCards(hand, s.trump, ledSuitOf(s.trick, s.trump)).includes(card)) return false;
  s.hands[seat] = hand.filter((c) => c !== card);
  s.gone = (s.gone || []).concat([card]);
  s.trick.plays.push({ seat, card });
  emit(s, 'play', { seat, card });
  if (s.trick.plays.length >= players(s)) {
    const w = s.trick.plays[winningPlay(s.trick, s.trump)].seat;
    s.trick.winner = w;
    s.tricks[w] += 1;
    s.stats[w].tricks += 1;
    s.trickNo += 1;
    setPhase(s, 'trick', now);
    emit(s, 'trick', { seat: w });
  } else {
    setTurn(s, nextIn(s, seat), now);
  }
  return true;
}

function score(s, now) {
  s.prevScores = [...s.scores];
  const changes = s.seats.map((_, i) => {
    if (!s.inHand[i]) return { change: 0, why: 'Folded' };
    const took = s.tricks[i];
    if (i === s.bidder && took < s.high.bid) { s.stats[i].set += 1; return { change: SET, why: `Set! Bid ${s.high.bid}, took ${took}` }; }
    if (took === 0) { s.stats[i].set += 1; return { change: SET, why: 'Set! No tricks' }; }
    if (i === s.bidder) s.stats[i].made += 1;
    return { change: -took, why: `${took} trick${took === 1 ? '' : 's'}` };
  });
  changes.forEach((c, i) => { s.scores[i] += c.change; });
  s.result = { changes, bidder: s.bidder, bid: s.high ? s.high.bid : null, dirty: s.dirty, trump: s.trump };
  s.history.push({ hand: s.handNo, scores: [...s.scores] });
  const low = Math.min(...s.scores);
  s.winners = low <= 0 ? s.seats.map((_, i) => i).filter((i) => s.scores[i] === low) : [];
  setPhase(s, 'hand', now);
  emit(s, 'hand');
}

// ---------- Bots ----------

// The tricks a hand can count on with this trump, Dirty Clubs style: the bowers and the ace of trump are
// near-sure, other trumps are worth more the more of them you hold, and an outside ace is a likely trick.
// A void suit makes a low trump much better, since you can trump in.
function clubsTricks(hand, trump) {
  const trumps = hand.filter((c) => isTrump(c, trump));
  const suits = new Set(hand.filter((c) => !isTrump(c, trump)).map((c) => effSuit(c, trump)));
  let est = 0;
  trumps.forEach((c) => {
    const r = rankOf(c);
    const right = r === 11 && c.endsWith(trump);
    const left = r === 11 && !right;
    if (right) est += 1;
    else if (left) est += 0.85;
    else if (r === 14) est += 0.75;
    else if (r === 13) est += 0.55;
    else est += trumps.length >= 3 ? 0.5 : 0.3;
  });
  hand.forEach((c) => { if (!isTrump(c, trump) && rankOf(c) === 14) est += 0.6; });
  const voids = 3 - suits.size;
  if (trumps.length && voids > 0) est += Math.min(trumps.length, voids) * 0.25;
  return est;
}
const bestSuit = (hand) => SUITS.map((suit) => ({ suit, est: clubsTricks(hand, suit) })).sort((a, b) => b.est - a.est)[0];

function botBid(s, seat) {
  const { est } = bestSuit(s.hands[seat]);
  const n = Math.min(HAND, Math.floor(est + 0.6));
  const highV = s.high ? s.high.bid : 0;
  return n >= MIN_BID && n > highV ? n : 0;
}

// Stay in when you can name the trick you expect to win; fold a lone low trump with no ace and no void.
const botStay = (s, seat) => {
  const hand = s.hands[seat];
  const trumps = hand.filter((c) => isTrump(c, s.trump));
  const aces = hand.filter((c) => !isTrump(c, s.trump) && rankOf(c) === 14).length;
  const suits = new Set(hand.filter((c) => !isTrump(c, s.trump)).map((c) => effSuit(c, s.trump)));
  if (trumps.some((c) => rankOf(c) === 11 || rankOf(c) >= 13)) return true;
  if (trumps.length >= 2) return true;
  if (trumps.length === 1 && (aces || suits.size < 3)) return true;
  // No trump: only a pair of aces is worth the risk.
  return trumps.length === 0 && aces >= 2;
};

function botPlay(s, seat, now) {
  const card = botCard({
    hand: s.hands[seat],
    trick: s.trick,
    trump: s.trump,
    playersLeft: players(s) - s.trick.plays.length - 1,
    unseen: unseenCards(DECK, s.hands[seat], s.gone || [], s.upcard ? [s.upcard] : []),
    leadTrump: seat === s.bidder,
  });
  play(s, seat, card, now);
}

/** Advances the game to `now` (ms): deals, trick pauses, and moves for bots and away phones. */
export function tick(s, now) {
  const elapsed = now - s.phaseAt;
  switch (s.phase) {
    case 'cut':
      if ((autoSeat(s, s.turn, now) && elapsed >= BOT_MS * 1.5) || elapsed >= CUT_MS) cut(s, s.turn, botCutAt(s), now);
      break;
    case 'deal':
      if (elapsed >= (s.dirty ? DIRTY_MS : DEAL_MS)) {
        if (s.dirty) {
          s.inHand = s.seats.map(() => true);
          startPlay(s, now);
        } else {
          setPhase(s, 'bid', now);
          setTurn(s, (s.dealer + 1) % count(s), now);
          emit(s, 'bidding');
        }
      }
      break;
    case 'bid':
      if (autoSeat(s, s.turn, now) && now - s.turnAt >= BOT_MS) bid(s, s.turn, botBid(s, s.turn), now);
      break;
    case 'trump':
      if (autoSeat(s, s.turn, now) && now - s.turnAt >= BOT_MS) nameTrump(s, s.turn, bestSuit(s.hands[s.turn]).suit, now);
      break;
    case 'stay':
      s.seats.forEach((_, i) => {
        if (s.inHand[i] !== null || s.phase !== 'stay') return;
        const auto = autoSeat(s, i, now) && elapsed >= BOT_MS * (1 + (i % 3) * 0.5);
        if (auto || elapsed >= STAY_MS) stay(s, i, botStay(s, i), now);
      });
      break;
    case 'play':
      if (autoSeat(s, s.turn, now) && now - s.turnAt >= BOT_MS) botPlay(s, s.turn, now);
      break;
    case 'trick':
      if (elapsed >= TRICK_MS) {
        const w = s.trick.winner;
        s.lastTrick = s.trick;
        s.trick = { plays: [] };
        if (s.trickNo >= HAND) score(s, now);
        else { setPhase(s, 'play', now); setTurn(s, w, now); }
      }
      break;
    case 'hand':
      if (elapsed >= HAND_MS) {
        if (s.winners.length) { setPhase(s, 'final', now); emit(s, 'final'); }
        else { s.dealer = (s.dealer + 1) % count(s); deal(s, now); }
      }
      break;
    default:
      break;
  }
  return s;
}

export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

/** A late joiner watches, then takes a bot's chair at the next deal. */
export function addPlayer(s, cid, name, now) {
  if (!s.players.some((p) => p.cid === cid)) s.players.push({ cid, name });
  s.lastSeen[cid] = now;
  if (seatOf(s, cid) < 0 && !s.waiting.includes(cid) && s.seats.some((x) => x.bot)) s.waiting.push(cid);
}

export const isOver = (s) => s.phase === 'final';

/** Lowest score first (lower is better). */
export function ranking(s) {
  const list = s.seats.map((x, i) => ({ seat: i, cid: x.cid, name: x.name, score: s.scores[i], bot: x.bot }))
    .sort((a, b) => a.score - b.score || a.seat - b.seat);
  let rank = 0;
  return list.map((p, i) => {
    if (i === 0 || p.score !== list[i - 1].score) rank = i + 1;
    return { ...p, rank };
  });
}

/** What one phone needs to show. */
export function phoneView(s, cid, now) {
  const seat = seatOf(s, cid);
  const view = {
    phase: s.phase,
    seat,
    hand: s.handNo,
    dealer: s.dealer,
    turn: s.turn,
    myTurn: seat >= 0 && s.turn === seat && ['cut', 'bid', 'trump', 'play'].includes(s.phase),
    deckSize: s.phase === 'cut' ? s.deck.length : 52,
    cutAt: s.cutAt,
    cutLeft: s.phase === 'cut' ? Math.max(0, Math.ceil((CUT_MS - (now - s.phaseAt)) / 1000)) : 0,
    seats: s.seats.map((x, i) => ({
      name: x.name, bot: x.bot, away: !x.bot && now - (s.lastSeen[x.cid] ?? -1e9) > ACTIVE_MS,
      cards: s.hands[i].length, tricks: s.tricks[i], score: s.scores[i], in: s.inHand[i],
    })),
    upcard: s.upcard,
    dirty: s.dirty,
    trump: s.trump,
    high: s.high,
    bidder: s.bidder,
    bids: s.bids,
    trick: s.trick.plays,
    winner: s.phase === 'trick' ? s.trick.winner : null,
    waiting: s.waiting.includes(cid),
  };
  if (seat >= 0) {
    view.cards = sortHand(s.hands[seat], s.trump);
    view.myIn = s.inHand[seat];
    view.score = s.scores[seat];
    if (s.phase === 'play' && s.turn === seat) view.legal = legalCards(s.hands[seat], s.trump, ledSuitOf(s.trick, s.trump));
    if (s.phase === 'stay') view.left = Math.max(0, STAY_MS - (now - s.phaseAt));
  }
  if (s.result) view.result = s.result;
  if (s.phase === 'final') {
    const me = ranking(s).find((r) => r.cid === cid);
    view.final = { winners: s.winners.map((i) => s.seats[i].name), rank: me ? me.rank : null };
  }
  return view;
}

/** End-of-game awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const best = (pick) => {
    let top = null;
    s.seats.forEach((x, i) => {
      if (x.bot) return;
      const v = pick(s.stats[i]);
      if (v > 0 && (!top || v > top.value)) top = { cid: x.cid, value: v };
    });
    return top;
  };
  const add = (pick, title, blurb) => { const b = best(pick); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add((st) => st.tricks, 'Trick Taker', (v) => `Took ${v} trick${v === 1 ? '' : 's'}`);
  add((st) => st.made, 'Bid Boss', (v) => `Made ${v} bid${v === 1 ? '' : 's'}`);
  add((st) => st.folds, 'Knows When to Fold', (v) => `Folded ${v} time${v === 1 ? '' : 's'}`);
  add((st) => st.set, 'Living Dangerously', (v) => `Got set ${v} time${v === 1 ? '' : 's'}`);
  return list;
}
export { seatOf };
