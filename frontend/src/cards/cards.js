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

/**
 * A sensible card for a bot. partnerOf: seat -> partner seat (or null). avoid: try not to win tricks
 * (misère). leadTrump: draw trumps first when leading (the bidding side with the top trumps).
 */
export function botCard({ hand, trick, trump, seat, partner = null, playersLeft, avoid = false, leadTrump = false }) {
  const led = ledSuitOf(trick, trump);
  const legal = legalCards(hand, trump, led);
  const byLow = [...legal].sort((a, b) => lowValue(a, trump) - lowValue(b, trump));
  if (!trick.plays.length) {
    if (avoid) return byLow[0];
    const trumps = legal.filter((c) => isTrump(c, trump)).sort((a, b) => power(b, trump, trump) - power(a, trump, trump));
    if (leadTrump && trumps.length && power(trumps[0], trump, trump) >= 890) return trumps[0];
    const aces = legal.filter((c) => !isTrump(c, trump) && rankOf(c) === 14);
    if (aces.length) return aces[0];
    return byLow.find((c) => !isTrump(c, trump)) || byLow[0];
  }
  const bestI = winningPlay(trick, trump);
  const best = trick.plays[bestI];
  const bestPower = power(best.card, trump, led);
  const beats = legal.filter((c) => power(c, trump, led) > bestPower)
    .sort((a, b) => power(a, trump, led) - power(b, trump, led));
  if (avoid) {
    const under = legal.filter((c) => power(c, trump, led) < bestPower)
      .sort((a, b) => power(b, trump, led) - power(a, trump, led) || rankOf(b) - rankOf(a));
    return under[0] || byLow[0];
  }
  const partnerWinning = partner != null && best.seat === partner;
  if (partnerWinning && (playersLeft <= 1 || bestPower >= 113 || isTrump(best.card, trump))) return byLow[0];
  if (beats.length) {
    // Last to play, or a card nobody can top: win it as cheaply as possible.
    return beats[0];
  }
  return byLow[0];
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
