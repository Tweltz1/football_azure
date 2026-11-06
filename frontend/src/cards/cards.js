// Shared pieces for the trick-taking card games (500 and Dirty Clubs): cards, bowers, following suit,
// who wins a trick, seats with bots for empty chairs, and a simple bot that plays a sensible card.
// Pure logic, no React. A card is a string: rank then suit ('14H' is the ace of hearts), or 'JK' for the joker.

export const SUITS = ['S', 'C', 'D', 'H'];
export const SUIT_SYMBOL = { S: '♠', C: '♣', D: '♦', H: '♥', NT: 'NT' };
export const SUIT_NAME = { S: 'Spades', C: 'Clubs', D: 'Diamonds', H: 'Hearts', NT: 'No Trump' };
export const JOKER = 'JK';
export const ACTIVE_MS = 30000; // a phone quiet this long has a bot play for it
export const BOT_MS = 1100;

const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export const isJoker = (card) => card === JOKER;
export const suitOf = (card) => (isJoker(card) ? null : card.slice(-1));
export const rankOf = (card) => (isJoker(card) ? 99 : Number(card.slice(0, -1)));
export const rankLabel = (card) => (isJoker(card) ? '🃏' : RANK_LABEL[rankOf(card)] || String(rankOf(card)));
export const isRed = (suit) => suit === 'H' || suit === 'D';
export const sameColor = (suit) => ({ S: 'C', C: 'S', D: 'H', H: 'D' }[suit]);
export const cardLabel = (card) => (isJoker(card) ? 'Joker' : `${rankLabel(card)}${SUIT_SYMBOL[suitOf(card)]}`);

export const mulberry = (seed) => {
  let r = seed | 0;
  return () => {
    r = (r + 0x6D2B79F5) | 0;
    let t = r;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
export const shuffle = (rand, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** A deck: every suit from `low` up to the ace, with per-suit lows if given, plus the joker if asked. */
export const makeDeck = ({ low = 2, lows = {}, joker = false } = {}) => {
  const deck = [];
  SUITS.forEach((s) => {
    for (let r = lows[s] || low; r <= 14; r += 1) deck.push(`${r}${s}`);
  });
  if (joker) deck.push(JOKER);
  return deck;
};

const isRight = (card, trump) => !!trump && rankOf(card) === 11 && suitOf(card) === trump;
const isLeft = (card, trump) => !!trump && rankOf(card) === 11 && suitOf(card) === sameColor(trump);

/** The suit a card counts as: the left bower is trump, and the joker is trump (or its own thing in no trump). */
export const effSuit = (card, trump) => {
  if (isJoker(card)) return trump || JOKER;
  if (isLeft(card, trump)) return trump;
  return suitOf(card);
};
export const isTrump = (card, trump) => isJoker(card) || (!!trump && effSuit(card, trump) === trump);

/** How strong a card is in this trick. Higher wins. Cards that neither follow nor trump are 0. */
export const power = (card, trump, led) => {
  if (isJoker(card)) return 1000;
  if (isRight(card, trump)) return 900;
  if (isLeft(card, trump)) return 890;
  const s = effSuit(card, trump);
  if (trump && s === trump) return 500 + rankOf(card);
  if (s === led) return 100 + rankOf(card);
  return 0;
};

/** The suit everyone must follow: the first card's suit, or the suit named when the joker leads in no trump. */
export const ledSuitOf = (trick, trump) => {
  if (!trick.plays.length) return null;
  const first = trick.plays[0].card;
  if (isJoker(first) && !trump) return trick.named || null;
  return effSuit(first, trump);
};

/** Cards this hand may play. Follow the led suit if you can. In no trump the joker only goes when you can't follow. */
export const legalCards = (hand, trump, led) => {
  if (!led) return [...hand];
  const follow = hand.filter((c) => effSuit(c, trump) === led);
  return follow.length ? follow : [...hand];
};

/** Index into trick.plays of the card winning so far. */
export const winningPlay = (trick, trump) => {
  const led = ledSuitOf(trick, trump);
  let best = 0;
  trick.plays.forEach((p, i) => { if (power(p.card, trump, led) > power(trick.plays[best].card, trump, led)) best = i; });
  return best;
};

const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 }; // alternating colors in your hand
/** A hand sorted for showing: by suit (trump last, bowers with trump), high to low. */
export const sortHand = (hand, trump) => [...hand].sort((a, b) => {
  const sa = effSuit(a, trump);
  const sb = effSuit(b, trump);
  const ka = sa === trump || sa === JOKER ? 9 : SUIT_ORDER[sa];
  const kb = sb === trump || sb === JOKER ? 9 : SUIT_ORDER[sb];
  if (ka !== kb) return ka - kb;
  return power(b, trump, sb) - power(a, trump, sa);
});

/** "Sort by suit": the Joker, then trump, then the other suits in alternating colors, each one high to low. */
export const suitSort = (hand, trump) => [...hand].sort((a, b) => {
  const sa = effSuit(a, trump);
  const sb = effSuit(b, trump);
  const k = (s) => (s === JOKER ? -2 : s === trump ? -1 : SUIT_ORDER[s]);
  if (k(sa) !== k(sb)) return k(sa) - k(sb);
  return power(b, trump, sb) - power(a, trump, sa);
});

/** A rough count of the tricks a hand should take with this trump (null for no trump). */
export const estimateTricks = (hand, trump, { jokerNt = false } = {}) => {
  let est = 0;
  const counts = {};
  hand.forEach((c) => { const s = effSuit(c, trump); counts[s] = (counts[s] || 0) + 1; });
  hand.forEach((c) => {
    const r = rankOf(c);
    if (isJoker(c)) { est += jokerNt || trump ? 1 : 0.8; return; }
    if (trump && isTrump(c, trump)) {
      if (isRight(c, trump)) est += 1;
      else if (isLeft(c, trump)) est += 0.9;
      else est += r === 14 ? 0.8 : r === 13 ? 0.6 : r === 12 ? 0.45 : 0.3;
      return;
    }
    const n = counts[effSuit(c, trump)] || 0;
    if (r === 14) est += trump ? 0.75 : 0.95;
    else if (r === 13 && n >= 2) est += trump ? 0.3 : 0.5;
    else if (!trump && r === 12 && n >= 3) est += 0.25;
  });
  if (trump) est += Math.max(0, (counts[trump] || 0) - 3) * 0.35;
  return est;
};

// ---------- Seats ----------

const BOT_NAMES = ['Boo', 'Spooks', 'Mort', 'Fang', 'Wisp', 'Ghoul'];

/** Seats for the humans (first come, first seated) topped up with bots to `min`. Extra people watch. */
export const makeSeats = (players, min, max) => {
  const seats = players.slice(0, max).map((p) => ({ cid: p.cid, name: p.name, bot: false }));
  const taken = new Set(players.map((p) => p.name.toLowerCase()));
  let b = 0;
  while (seats.length < min) {
    const name = BOT_NAMES.find((n) => !taken.has(n.toLowerCase())) || `Bot ${b + 1}`;
    taken.add(name.toLowerCase());
    b += 1;
    seats.push({ cid: `bot${b}`, name, bot: true });
  }
  return seats;
};

export const seatOf = (s, cid) => s.seats.findIndex((seat) => seat.cid === cid);
export const isAwaySeat = (s, i, now) => !s.seats[i].bot && now - (s.lastSeen[s.seats[i].cid] ?? -1e9) > ACTIVE_MS;
/** Bots, and humans whose phone went quiet, are played by the computer. */
export const autoSeat = (s, i, now) => s.seats[i].bot || isAwaySeat(s, i, now);

/** Between hands, someone who joined late takes over a bot's chair. */
export const seatWaiting = (s) => {
  while (s.waiting.length) {
    const i = s.seats.findIndex((seat) => seat.bot);
    if (i < 0) return;
    const cid = s.waiting.shift();
    const p = s.players.find((x) => x.cid === cid);
    if (p && seatOf(s, cid) < 0) s.seats[i] = { cid, name: p.name, bot: false, took: s.seats[i].name };
  }
};

export const emit = (s, type, data = {}) => {
  s.eventId += 1;
  s.events.push({ id: s.eventId, type, ...data });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
};
export const setPhase = (s, phase, now) => {
  s.phase = phase;
  s.phaseAt = now;
};

// ---------- The bot's card play ----------

const lowValue = (card, trump) => (isTrump(card, trump) ? 1000 : 0) + (isJoker(card) ? 2000 : power(card, trump, effSuit(card, trump)));
const strength = (card, trump) => power(card, trump, effSuit(card, trump));

/** Cards nobody has seen played yet: the deck, minus this hand, the cards gone and any the bot knows about. */
export const unseenCards = (deck, hand, gone = [], known = []) => {
  const out = new Set([...hand, ...gone, ...known]);
  return deck.filter((c) => !out.has(c));
};

/** A "boss" card: nothing still out in its suit can beat it (the joker, then the bowers, count as trump). */
export const isBoss = (card, trump, unseen) => {
  const s = effSuit(card, trump);
  const mine = strength(card, trump);
  return !unseen.some((u) => effSuit(u, trump) === s && strength(u, trump) > mine);
};

/**
 * A sensible card for a bot. It only ever looks at its own hand, the cards on the table and the cards
 * already played (unseen: everything else).
 * mode 'normal': win tricks for yourself or your side. partner: your partner's seat (or null).
 * mode 'avoid': Nola, so take no tricks: lead low, duck under, dump high cards when void.
 * mode 'defend': against Nola, make the Nola player (bidders) take one: lead low, play under them when
 * they're winning, and once they can't win this trick, throw your highest cards.
 * leadTrump: the bidding side, so pull trumps with a boss trump. partnerBid: lead trump into a partner who bid.
 */
export function botCard({
  hand, trick, trump, partner = null, playersLeft, unseen = [], mode = 'normal', bidders = [], leadTrump = false, partnerBid = false,
}) {
  const led = ledSuitOf(trick, trump);
  const legal = legalCards(hand, trump, led);
  if (legal.length === 1) return legal[0];
  const byLow = [...legal].sort((a, b) => lowValue(a, trump) - lowValue(b, trump));
  const byHigh = [...byLow].reverse();
  const boss = (c) => isBoss(c, trump, unseen);
  // Low cards for leading in a no-tricks hand: the ones with the most cards still out above them.
  const under = (c) => unseen.filter((u) => effSuit(u, trump) === effSuit(c, trump) && strength(u, trump) > strength(c, trump)).length;
  const lowest = (cards) => [...cards].filter((c) => !isJoker(c)).sort((a, b) => (strength(a, trump) - strength(b, trump)) || (under(b) - under(a)))[0] || cards[0];

  if (!trick.plays.length) {
    if (mode === 'avoid' || mode === 'defend') {
      const plain = legal.filter((c) => !isTrump(c, trump));
      return lowest(plain.length ? plain : legal);
    }
    const trumps = legal.filter((c) => isTrump(c, trump)).sort((a, b) => strength(b, trump) - strength(a, trump));
    const trumpsOut = unseen.some((u) => isTrump(u, trump));
    // Pull the other side's trumps with a boss trump so the outside winners stand up.
    if (leadTrump && trump && trumps.length && trumpsOut && boss(trumps[0])) return trumps[0];
    // Lead trump into a partner who won the bid.
    if (partnerBid && trump && trumps.length && trumpsOut) return trumps[trumps.length - 1];
    const sure = legal.filter((c) => !isTrump(c, trump) && boss(c)).sort((a, b) => strength(b, trump) - strength(a, trump));
    if (sure.length) return sure[0];
    const plain = byLow.filter((c) => !isTrump(c, trump));
    return plain[0] || byLow[0];
  }

  const bestI = winningPlay(trick, trump);
  const best = trick.plays[bestI];
  const bestPower = power(best.card, trump, led);
  const beats = legal.filter((c) => power(c, trump, led) > bestPower).sort((a, b) => power(a, trump, led) - power(b, trump, led));
  const ducks = legal.filter((c) => power(c, trump, led) < bestPower)
    .sort((a, b) => power(b, trump, led) - power(a, trump, led) || strength(b, trump) - strength(a, trump));
  const following = led && legal.some((c) => effSuit(c, trump) === led);

  if (mode === 'avoid') {
    // Highest card that still loses; if you can't follow, that throws your most dangerous card.
    if (ducks.length) return following ? ducks[0] : byHigh.find((c) => ducks.includes(c)) || ducks[0];
    // Forced to win: win with the highest, so it's gone.
    return byHigh[0];
  }

  if (mode === 'defend') {
    const bidderIn = trick.plays.filter((p) => bidders.includes(p.seat));
    const bidderWinning = bidders.includes(best.seat);
    const biddersToPlay = bidders.length - bidderIn.length > 0 && playersLeft > 0;
    const dumpHigh = byHigh.find((c) => !isJoker(c)) || byHigh[0];
    if (!biddersToPlay && !bidderWinning) return dumpHigh; // they can't take this one: dump your highest
    if (!biddersToPlay && bidderWinning) return ducks[0] || byLow[0]; // leave it with them, throwing high
    if (!following) return ducks.find((c) => !isJoker(c)) || dumpHigh; // void: get rid of high cards
    return byLow[0]; // they still have to play: go low so they must take it or duck under
  }

  const partnerWinning = partner != null && best.seat === partner;
  const keep = (c) => boss(c) || isTrump(c, trump);
  const throwaway = () => byLow.find((c) => !keep(c)) || byLow[0];
  if (partnerWinning) {
    const safe = playersLeft <= 0 || boss(best.card);
    if (safe) return throwaway();
    const sureBeat = beats.find((c) => boss(c) && !isTrump(c, trump));
    return sureBeat || throwaway();
  }
  if (beats.length) {
    if (playersLeft <= 0) return beats[0];
    // Win it for sure if you can; otherwise take it as cheaply as you can.
    return beats.find((c) => boss(c)) || beats[0];
  }
  return throwaway();
}

// ---------- Cutting the deck ----------

export const CUT_MS = 25000;
/** Where a cut may go: at least 3 cards in each half. */
export const clampCut = (at, size) => {
  const n = Number(at);
  return Math.max(1, Math.min(size - 1, Math.round(Number.isFinite(n) ? n : size / 2)));
};
/** A cut of only a few cards off either end: thin to win. */
export const THIN_CUT = 4;
export const isThinCut = (at, size) => at != null && (at <= THIN_CUT || size - at <= THIN_CUT);
/** Cut the deck: the top `at` cards go to the bottom. */
export const cutDeck = (deck, at) => deck.slice(at).concat(deck.slice(0, at));
/** Somewhere near the middle, the way most people cut. */
export const botCutAt = (s) => clampCut(s.deck.length / 2 + ((s.handNo * 7) % 11) - 5, s.deck.length);
