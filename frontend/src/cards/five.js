// 500: four players in two partnerships (across the table), a 45-card deck (4s up plus the joker), 10
// cards each and 5 in the kitty. Bidding goes around once, starting left of the dealer; the high bid wins.
// The winner picks up the kitty, throws 5 away and leads. In a Double Nola the bidder hands one of those 5
// to their partner, who throws one of their own on the pile (the joker, say). Everyone ends on 10 cards. Bids: 6♠ 40, ♣ 60, ♦ 80, ♥ 100, NT 120, +100 a trick; Nola 170, Double Nola 380. First side to 500 by
// making a bid wins; a side that sinks to -500 loses. Empty chairs get bots. Pure logic, no React.

import {
  botCutAt, clampCut, CUT_MS, cutDeck,
  ACTIVE_MS, autoSeat, botCard, BOT_MS, effSuit, emit, estimateTricks, isJoker, JOKER, ledSuitOf, legalCards, unseenCards,
  makeDeck, mulberry, seatOf, seatWaiting, setPhase, shuffle, sortHand, SUIT_NAME, SUIT_SYMBOL, SUITS, winningPlay,
  makeSeats,
} from './cards.js';

export const SEATS = 4;
const DECK = makeDeck({ low: 4, joker: true });
export const HAND = 10;
export const TARGET = 500;
export const DEAL_MS = 2800;
export const NOBID_MS = 2600;
export const TRICK_MS = 1700;
export const HAND_MS = 9000;
// Nola: the bidder plays alone (partner sits out) and must take no tricks. Double Nola: both partners
// play and neither may take a trick. At this table's values.
export const MISERE = 170;
export const OPEN_MISERE = 380;

const BID_SUITS = ['S', 'C', 'D', 'H', 'NT'];

/** What a bid is worth. '7H' -> 200, 'MIS' (Nola) -> 170, 'OPEN' (Double Nola) -> 380. */
export const bidValue = (bid) => {
  if (!bid) return 0;
  if (bid === 'MIS') return MISERE;
  if (bid === 'OPEN') return OPEN_MISERE;
  const m = /^(\d+)(S|C|D|H|NT)$/.exec(bid);
  if (!m) return 0;
  return 40 + (Number(m[1]) - 6) * 100 + BID_SUITS.indexOf(m[2]) * 20;
};
export const bidTricks = (bid) => (bid === 'MIS' || bid === 'OPEN' ? 0 : Number(/^\d+/.exec(bid)?.[0] || 0));
export const bidSuit = (bid) => (bid === 'MIS' || bid === 'OPEN' ? 'NT' : /(S|C|D|H|NT)$/.exec(bid)?.[1]);
export const isMisere = (bid) => bid === 'MIS' || bid === 'OPEN';
export const bidLabel = (bid) => {
  if (bid === 'MIS') return 'Nola';
  if (bid === 'OPEN') return 'Double Nola';
  if (bid === 'PASS') return 'Pass';
  const s = bidSuit(bid);
  return `${bidTricks(bid)} ${s === 'NT' ? 'No Trump' : SUIT_SYMBOL[s]}`;
};
/** Every suit bid, low to high. */
export const ALL_BIDS = [6, 7, 8, 9, 10].flatMap((n) => BID_SUITS.map((s) => `${n}${s}`));

export const teamOf = (seat) => seat % 2;
export const partnerOf = (seat) => (seat + 2) % SEATS;
const trumpOf = (bid) => { const s = bidSuit(bid); return s && s !== 'NT' ? s : null; };

/** Can this bid go on top of the current high bid? */
export const canBid = (s, bid) => {
  const high = s.high ? bidValue(s.high.bid) : 0;
  if (bid === 'MIS') return high < MISERE;
  if (bid === 'OPEN') return high < OPEN_MISERE;
  return ALL_BIDS.includes(bid) && bidValue(bid) > high;
};

const freshStats = () => ({ tricks: 0, made: 0, set: 0, bids: 0 });

function deal(s, now) {
  seatWaiting(s);
  s.deck = shuffle(mulberry((s.seed + s.handNo * 7919 + 1) | 0), makeDeck({ low: 4, joker: true }));
  s.hands = s.seats.map(() => []);
  s.kitty = [];
  s.cutAt = null;
  s.handNo += 1;
  s.bids = [];
  s.passed = [false, false, false, false];
  s.high = null;
  s.contract = null;
  s.trump = null;
  s.out = null;
  s.tricks = [0, 0, 0, 0];
  s.trick = { plays: [], named: null };
  s.lastTrick = null;
  s.trickNo = 0;
  s.gone = [];
  s.discards = [];
  s.result = null;
  // The player to the dealer's left cuts, then the cards go out.
  s.turn = (s.dealer + 1) % SEATS;
  s.turnAt = now;
  setPhase(s, 'cut', now);
  emit(s, 'shuffle', { dealer: s.dealer });
}

/** The cutter splits the deck: `at` cards from the top go to the bottom. Then the hand is dealt. */
export function cut(s, seat, at, now) {
  if (s.phase !== 'cut' || seat !== s.turn) return false;
  s.cutAt = clampCut(at, s.deck.length);
  const deck = cutDeck(s.deck, s.cutAt);
  s.hands = s.seats.map((_, i) => deck.slice(i * HAND, i * HAND + HAND));
  s.kitty = deck.slice(SEATS * HAND);
  s.deck = [];
  setPhase(s, 'deal', now);
  emit(s, 'deal', { dealer: s.dealer, cutAt: s.cutAt });
  return true;
}

/** A new game. players: [{ cid, name }]. The first four sit down; bots fill any empty chairs. */
export function createFive(players, seed = Date.now(), now = 0) {
  const rand = mulberry(seed);
  const s = {
    seed: seed | 0,
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    seats: makeSeats(players, SEATS, SEATS),
    waiting: [],
    dealer: Math.floor(rand() * SEATS),
    handNo: 0,
    scores: [0, 0],
    history: [],
    stats: [freshStats(), freshStats(), freshStats(), freshStats()],
    winner: null,
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

const setTurn = (s, seat, now) => { s.turn = seat; s.turnAt = now; };
const playing = (s, seat) => seat !== s.out;
const nextPlayer = (s, seat) => {
  let n = (seat + 1) % SEATS;
  while (!playing(s, n)) n = (n + 1) % SEATS;
  return n;
};

function endBidding(s, now) {
  if (!s.high) {
    setPhase(s, 'nobid', now);
    emit(s, 'nobid');
    return;
  }
  s.contract = { ...s.high };
  s.trump = trumpOf(s.contract.bid);
  if (s.contract.bid === 'MIS') s.out = partnerOf(s.contract.seat);
  s.hands[s.contract.seat] = s.hands[s.contract.seat].concat(s.kitty);
  s.stats[s.contract.seat].bids += 1;
  s.passCard = null;
  s.partnerDiscard = null;
  emit(s, 'won-bid', { seat: s.contract.seat, bid: s.contract.bid });
  setTurn(s, s.contract.seat, now);
  setPhase(s, 'kitty', now);
}

/** A bid ('7H', '10NT', 'MIS', 'OPEN') or 'PASS' from the seat whose turn it is. Everyone bids once, the dealer last. */
export function bid(s, seat, value, now) {
  if (s.phase !== 'bid' || seat !== s.turn || s.passed[seat]) return false;
  if (value === 'PASS') {
    s.bids.push({ seat, bid: 'PASS' });
    emit(s, 'pass', { seat });
  } else {
    if (!canBid(s, value)) return false;
    s.high = { seat, bid: value };
    s.bids.push({ seat, bid: value });
    emit(s, 'bid', { seat, bid: value });
  }
  s.passed[seat] = true; // one bid each: once you've bid, you're done
  if (s.bids.length >= SEATS) {
    endBidding(s, now);
    return true;
  }
  setTurn(s, (seat + 1) % SEATS, now);
  return true;
}

/** After getting one of the bidder's throwaways, the partner throws one card of their own on the pile. */
export function passCard(s, seat, card, now) {
  if (s.phase !== 'pass' || seat !== s.turn) return false;
  const hand = s.hands[seat];
  if (!hand.includes(card)) return false;
  s.hands[seat] = hand.filter((c) => c !== card);
  s.partnerDiscard = card;
  s.discards = s.discards.concat([card]);
  emit(s, 'partner-discard', { seat });
  startPlay(s, now);
  return true;
}

function startPlay(s, now) {
  setTurn(s, s.contract.seat, now);
  s.trick = { plays: [], named: null };
  setPhase(s, 'play', now);
}

/**
 * The bidder, holding 15 after the kitty, throws 5 away. In a Double Nola, give: one of those 5, handed to
 * the partner, who then throws one card away. Every other bid just throws the 5 away.
 */
export function discard(s, seat, cards, give, now) {
  if (s.phase !== 'kitty' || seat !== s.contract.seat) return false;
  const hand = s.hands[seat];
  const pick = [...new Set(cards)];
  if (pick.length !== hand.length - HAND || pick.some((c) => !hand.includes(c))) return false;
  const passing = s.contract.bid === 'OPEN';
  if (passing && !pick.includes(give)) return false;
  s.hands[seat] = hand.filter((c) => !pick.includes(c));
  s.discards = pick.filter((c) => !passing || c !== give);
  emit(s, 'discard', { seat });
  if (!passing) {
    startPlay(s, now);
    return true;
  }
  const partner = partnerOf(seat);
  s.hands[partner] = s.hands[partner].concat([give]);
  s.passCard = give;
  setTurn(s, partner, now);
  setPhase(s, 'pass', now);
  return true;
}

/** Play a card. named: the suit asked for when leading the joker in no trump or Nola. */
export function play(s, seat, card, named, now) {
  if (s.phase !== 'play' || seat !== s.turn) return false;
  const hand = s.hands[seat];
  if (!hand.includes(card)) return false;
  const led = ledSuitOf(s.trick, s.trump);
  if (!legalCards(hand, s.trump, led).includes(card)) return false;
  if (!s.trick.plays.length && isJoker(card) && !s.trump) {
    // Leading the joker with no trump: it asks for a suit, which everyone must follow.
    s.trick.named = SUITS.includes(named) ? named : SUITS[0];
  }
  s.hands[seat] = hand.filter((c) => c !== card);
  s.gone = (s.gone || []).concat([card]);
  s.trick.plays.push({ seat, card });
  emit(s, 'play', { seat, card });
  const needed = s.out == null ? SEATS : SEATS - 1;
  if (s.trick.plays.length >= needed) {
    const w = s.trick.plays[winningPlay(s.trick, s.trump)].seat;
    s.trick.winner = w;
    s.tricks[w] += 1;
    s.stats[w].tricks += 1;
    s.trickNo += 1;
    setPhase(s, 'trick', now);
    emit(s, 'trick', { seat: w });
  } else {
    setTurn(s, nextPlayer(s, seat), now);
  }
  return true;
}

function score(s, now) {
  const { seat, bid: b } = s.contract;
  const team = teamOf(seat);
  const value = bidValue(b);
  const took = b === 'MIS' ? s.tricks[seat] : s.tricks[seat] + s.tricks[partnerOf(seat)];
  const oppTook = HAND - s.tricks[seat] - s.tricks[partnerOf(seat)];
  const made = isMisere(b) ? took === 0 : took >= bidTricks(b);
  const slam = !isMisere(b) && took === HAND && value < 250;
  const points = made ? (slam ? 250 : value) : -value;
  let oppPoints = isMisere(b) ? 0 : oppTook * 10;
  // The defenders can't win the game on someone else's bid: they stop at 490.
  if (s.scores[1 - team] + oppPoints >= TARGET) oppPoints = Math.max(0, TARGET - 10 - s.scores[1 - team]);
  s.scores[team] += points;
  s.scores[1 - team] += oppPoints;
  s.stats[seat][made ? 'made' : 'set'] += 1;
  s.result = { seat, bid: b, team, took, made, slam, points, oppPoints, oppTook: isMisere(b) ? null : oppTook };
  s.history.push({ hand: s.handNo, ...s.result });
  if (made && s.scores[team] >= TARGET) s.winner = team;
  else if (s.scores[team] <= -TARGET) s.winner = 1 - team;
  else if (s.scores[1 - team] <= -TARGET) s.winner = team;
  setPhase(s, 'hand', now);
  emit(s, 'hand', { made });
}

// ---------- Bots ----------

// About how many tricks a partner and the kitty add to a bidder's own hand.
const HELP = 3.6;

function botBid(s, seat) {
  const hand = s.hands[seat];
  const high = s.high ? bidValue(s.high.bid) : 0;
  const partner = partnerOf(seat);
  const partnerBid = [...s.bids].reverse().find((x) => x.seat === partner && x.bid !== 'PASS' && !isMisere(x.bid));
  const own = (suit) => estimateTricks(hand, suit === 'NT' ? null : suit, { jokerNt: true }) - (suit === 'NT' ? 0.7 : 0);
  // The cheapest bid in this suit that beats the table, if our side can take that many.
  const cheapest = (suit, tricks) => {
    for (let k = 6; k <= Math.min(10, Math.floor(tricks)); k += 1) {
      if (bidValue(`${k}${suit}`) > high) return `${k}${suit}`;
    }
    return null;
  };
  if (partnerBid) {
    // Partner has spoken. Don't bid over them; if the other side has, back up partner's suit when we can help.
    if (s.high && s.high.seat === partner) return 'PASS';
    const suit = partnerBid.bid.replace(/^\d+/, '');
    const support = own(suit) + bidTricks(partnerBid.bid) - HELP + 0.6;
    const raise = cheapest(suit, support);
    if (raise) return raise;
    // Only switch suits with a hand far stronger than we'd normally need.
    let best = null;
    BID_SUITS.forEach((x) => {
      const b = cheapest(x, own(x) + HELP - 1.5);
      if (b && (!best || own(x) > best.est)) best = { bid: b, est: own(x) };
    });
    return best ? best.bid : 'PASS';
  }
  // Our own hand, plus what partner and the kitty usually add.
  let best = null;
  BID_SUITS.forEach((suit) => {
    const est = own(suit) + HELP;
    const b = cheapest(suit, est);
    if (b && (!best || est > best.est)) best = { bid: b, est };
  });
  return best ? best.bid : 'PASS';
}

const rankNum = (c) => (isJoker(c) ? 99 : Number(c.slice(0, -1)));

/** The bot bidder's throwaways, and which of them goes back to the partner (the least harmful one). */
function botDiscard(s, seat) {
  const trump = s.trump;
  const hand = s.hands[seat];
  const n = hand.length - HAND;
  if (isMisere(s.contract.bid)) {
    // Nola: throw away the highest cards, and hand the partner the lowest of them.
    const out = [...hand].sort((a, b) => rankNum(b) - rankNum(a)).slice(0, n);
    return { out, give: out[out.length - 1] };
  }
  const counts = {};
  hand.forEach((c) => { const x = effSuit(c, trump); counts[x] = (counts[x] || 0) + 1; });
  const keep = (c) => isJoker(c) || (trump && effSuit(c, trump) === trump) || rankNum(c) === 14;
  const out = [...hand].filter((c) => !keep(c))
    .sort((a, b) => (counts[effSuit(a, trump)] - counts[effSuit(b, trump)]) || (rankNum(a) - rankNum(b)))
    .concat(hand.filter(keep).sort((a, b) => rankNum(a) - rankNum(b)))
    .slice(0, n);
  // Give the partner the best of the throwaways: it might win them a trick.
  const give = [...out].sort((a, b) => rankNum(b) - rankNum(a))[0];
  return { out, give };
}

/** The partner's throwaway: in a Nola-type hand the highest card (the joker first), otherwise the weakest. */
function botPass(s, seat) {
  const hand = s.hands[seat];
  if (isMisere(s.contract.bid)) return [...hand].sort((a, b) => rankNum(b) - rankNum(a))[0];
  const trump = s.trump;
  const counts = {};
  hand.forEach((c) => { const x = effSuit(c, trump); counts[x] = (counts[x] || 0) + 1; });
  const weak = (c) => (isJoker(c) || (trump && effSuit(c, trump) === trump) ? 100 : 0) + rankNum(c) + counts[effSuit(c, trump)] * 0.1;
  return [...hand].sort((a, b) => weak(a) - weak(b))[0];
}

function botPlay(s, seat, now) {
  const bid = s.contract ? s.contract.bid : null;
  const bidder = s.contract ? s.contract.seat : null;
  const bidders = bid === 'OPEN' ? [bidder, partnerOf(bidder)] : [bidder];
  const bidSide = teamOf(seat) === teamOf(bidder);
  let mode = 'normal';
  if (isMisere(bid)) mode = bidders.includes(seat) ? 'avoid' : bidSide ? 'normal' : 'defend';
  const needed = s.out == null ? SEATS : SEATS - 1;
  // What this bot can know: its own hand, what's been played, and its own discards if it took the kitty.
  const known = seat === bidder ? s.discards : [];
  const card = botCard({
    hand: s.hands[seat],
    trick: s.trick,
    trump: s.trump,
    partner: s.out == null && mode === 'normal' ? partnerOf(seat) : null,
    playersLeft: needed - s.trick.plays.length - 1,
    unseen: unseenCards(DECK, s.hands[seat], s.gone || [], known),
    mode,
    bidders,
    leadTrump: bidSide && !!s.trump,
    partnerBid: bidSide && seat !== bidder && !!s.trump,
  });
  let named = null;
  if (isJoker(card) && !s.trick.plays.length && !s.trump) {
    const counts = {};
    s.hands[seat].forEach((c) => { if (!isJoker(c)) counts[c.slice(-1)] = (counts[c.slice(-1)] || 0) + 1; });
    named = SUITS.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0];
  }
  play(s, seat, card, named, now);
}

/** Advances the game to `now` (ms): deals, trick pauses, and moves for bots and away phones. */
export function tick(s, now) {
  const elapsed = now - s.phaseAt;
  switch (s.phase) {
    case 'cut':
      if ((autoSeat(s, s.turn, now) && elapsed >= BOT_MS * 1.5) || elapsed >= CUT_MS) cut(s, s.turn, botCutAt(s), now);
      break;
    case 'deal':
      if (elapsed >= DEAL_MS) { setPhase(s, 'bid', now); setTurn(s, (s.dealer + 1) % SEATS, now); emit(s, 'bidding'); }
      break;
    case 'nobid':
      if (elapsed >= NOBID_MS) { s.dealer = (s.dealer + 1) % SEATS; deal(s, now); }
      break;
    case 'bid':
      if (autoSeat(s, s.turn, now) && now - s.turnAt >= BOT_MS) bid(s, s.turn, botBid(s, s.turn), now);
      break;
    case 'kitty':
      if (autoSeat(s, s.turn, now) && now - s.turnAt >= BOT_MS * 1.5) {
        const { out, give } = botDiscard(s, s.turn);
        discard(s, s.turn, out, give, now);
      }
      break;
    case 'pass':
      if (autoSeat(s, s.turn, now) && now - s.turnAt >= BOT_MS) passCard(s, s.turn, botPass(s, s.turn), now);
      break;
    case 'play':
      if (autoSeat(s, s.turn, now) && now - s.turnAt >= BOT_MS) botPlay(s, s.turn, now);
      break;
    case 'trick':
      if (elapsed >= TRICK_MS) {
        const w = s.trick.winner;
        s.lastTrick = s.trick;
        s.trick = { plays: [], named: null };
        const misSet = s.contract && isMisere(s.contract.bid) && (s.contract.bid === 'MIS' ? w === s.contract.seat : teamOf(w) === teamOf(s.contract.seat));
        if (s.trickNo >= HAND || misSet) score(s, now);
        else { setPhase(s, 'play', now); setTurn(s, w, now); }
      }
      break;
    case 'hand':
      if (elapsed >= HAND_MS) {
        if (s.winner != null) { setPhase(s, 'final', now); emit(s, 'final'); }
        else { s.dealer = (s.dealer + 1) % SEATS; deal(s, now); }
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
export const teamName = (s, team) => `${s.seats[team].name} & ${s.seats[team + 2].name}`;

/** What one phone needs to show. */
export function phoneView(s, cid, now) {
  const seat = seatOf(s, cid);
  const view = {
    phase: s.phase,
    seat,
    hand: s.handNo,
    dealer: s.dealer,
    turn: s.turn,
    myTurn: seat >= 0 && s.turn === seat && ['cut', 'bid', 'pass', 'kitty', 'play'].includes(s.phase),
    deckSize: s.phase === 'cut' ? s.deck.length : 45,
    cutAt: s.cutAt,
    cutLeft: s.phase === 'cut' ? Math.max(0, Math.ceil((CUT_MS - (now - s.phaseAt)) / 1000)) : 0,
    seats: s.seats.map((x, i) => ({
      name: x.name, bot: x.bot, away: !x.bot && now - (s.lastSeen[x.cid] ?? -1e9) > ACTIVE_MS, team: teamOf(i),
      cards: s.hands[i].length, tricks: s.tricks[i], out: s.out === i,
    })),
    teams: [teamName(s, 0), teamName(s, 1)],
    scores: s.scores,
    myTeam: seat >= 0 ? teamOf(seat) : null,
    trump: s.trump,
    contract: s.contract ? { seat: s.contract.seat, bid: s.contract.bid, label: bidLabel(s.contract.bid), need: bidTricks(s.contract.bid) } : null,
    high: s.high ? { seat: s.high.seat, bid: s.high.bid, value: bidValue(s.high.bid) } : null,
    bids: s.bids.map((x) => ({ seat: x.seat, bid: x.bid })),
    passedSeats: [0, 1, 2, 3].map((i) => s.bids.some((x) => x.seat === i && x.bid === 'PASS')),
    trick: s.trick.plays,
    named: s.trick.named,
    winner: s.phase === 'trick' ? s.trick.winner : null,
    waiting: s.waiting.includes(cid),
  };
  if (seat >= 0) {
    view.cards = sortHand(s.hands[seat], s.trump);
    view.passed = s.bids.some((x) => x.seat === seat && x.bid === 'PASS');
    if (s.phase === 'kitty' && seat === s.contract.seat) {
      view.kitty = s.kitty;
      view.toDiscard = s.hands[seat].length - HAND;
      view.handsOne = s.contract.bid === 'OPEN';
    }
    if (s.phase === 'pass' && seat === s.turn) view.passCard = s.passCard;
    if (s.phase === 'play' && s.turn === seat) {
      view.legal = legalCards(s.hands[seat], s.trump, ledSuitOf(s.trick, s.trump));
      view.nameSuit = !s.trick.plays.length && !s.trump;
    }
    if (s.phase === 'bid' && s.turn === seat) view.canBid = ALL_BIDS.concat(['MIS', 'OPEN']).filter((b) => canBid(s, b));
  }
  if (s.result) view.result = { ...s.result, label: bidLabel(s.result.bid), bidder: s.seats[s.result.seat].name };
  if (s.phase === 'final') view.final = { winner: s.winner, won: seat >= 0 && teamOf(seat) === s.winner };
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
  add((st) => st.made, 'Made It', (v) => `Made ${v} bid${v === 1 ? '' : 's'}`);
  add((st) => st.set, 'Bold Bidder', (v) => `Got set ${v} time${v === 1 ? '' : 's'}`);
  return list;
}

export const describeTrump = (trump) => (trump ? `${SUIT_SYMBOL[trump]} ${SUIT_NAME[trump]}` : 'No Trump');
export { JOKER, seatOf };
