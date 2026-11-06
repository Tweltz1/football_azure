// Card designs. Each design is a color set (one per achievement track) with one of ten patterns (one per tier).
// Everyone gets Classic. Signing in opens the other nine Starter designs; the rest unlock by playing:
// winning games, making bids in each suit, Nola, Double Nola, big bids, slams and 500 to 0 shutouts.

const COMMON = [1, 3, 5, 10, 15, 20, 30, 40, 50, 75];
const WINS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50];
const BIDS = [1, 2, 3, 5, 7, 10, 13, 16, 20, 25];
const RARE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15];

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Achievement tracks: a color set, an emblem, and what each tier takes. */
export const TRACKS = [
  { id: 'starter', title: 'Starter', blurb: 'Sign in to use these', a: '#7b2fd6', b: '#5a1fa3', face: '#fffaf0', edge: '#1d1236', emblem: '🎴' },
  { id: 'games', title: 'Regular', a: '#1f3b73', b: '#13254a', face: '#f2f6ff', edge: '#13254a', emblem: '🎲', need: COMMON, goal: (n) => `Play ${plural(n, 'game')}` },
  { id: 'fiveWins', title: 'Royal', a: '#c9971c', b: '#8a6410', face: '#fff8e6', edge: '#5c430a', emblem: '🏆', need: WINS, goal: (n) => `Win ${plural(n, 'game')} of 500` },
  { id: 'clubsWins', title: 'Clover', a: '#1f8a4c', b: '#135c32', face: '#f0fff5', edge: '#0d3d21', emblem: '🍀', need: WINS, goal: (n) => `Win ${plural(n, 'game')} of Dirty Clubs` },
  { id: 'S', title: 'Onyx', a: '#2b2b2b', b: '#0e0e0e', face: '#f7f7f7', edge: '#000000', emblem: '♠', need: BIDS, goal: (n) => `Make ${plural(n, '♠ bid')} in 500` },
  { id: 'C', title: 'Forest', a: '#3d6b2f', b: '#24421b', face: '#f6fbef', edge: '#1b3214', emblem: '♣', need: BIDS, goal: (n) => `Make ${plural(n, '♣ bid')} in 500` },
  { id: 'D', title: 'Ruby', a: '#c2185b', b: '#880e4f', face: '#fff0f5', edge: '#5e0a36', emblem: '♦', need: BIDS, goal: (n) => `Make ${plural(n, '♦ bid')} in 500` },
  { id: 'H', title: 'Rose', a: '#e8475f', b: '#a8243a', face: '#fff2f3', edge: '#6e1424', emblem: '♥', need: BIDS, goal: (n) => `Make ${plural(n, '♥ bid')} in 500` },
  { id: 'NT', title: 'Starlight', a: '#3949ab', b: '#1a237e', face: '#f3f4ff', edge: '#0f155a', emblem: '⭐', need: RARE, goal: (n) => `Make ${plural(n, 'No Trump bid')}` },
  { id: 'nola', title: 'Moonlight', a: '#546e7a', b: '#263238', face: '#f4f7f9', edge: '#1b2429', emblem: '🌙', need: RARE, goal: (n) => `Make ${plural(n, 'Nola')}` },
  { id: 'dnola', title: 'Eclipse', a: '#4a148c', b: '#12002b', face: '#f6f0ff', edge: '#12002b', emblem: '🌑', need: RARE, goal: (n) => `Make ${plural(n, 'Double Nola')}` },
  { id: 'big', title: 'Rocket', a: '#ef6c00', b: '#b23c00', face: '#fff5ec', edge: '#6b2400', emblem: '🚀', need: RARE, goal: (n) => `Make ${plural(n, 'bid')} of 8 or more` },
  { id: 'slam', title: 'Thunder', a: '#00a3c4', b: '#006a80', face: '#effcff', edge: '#003f4d', emblem: '⚡', need: RARE, goal: (n) => `Take all 10 tricks ${n === 1 ? 'once' : `${n} times`}` },
  { id: 'shutout', title: 'Brick Wall', a: '#8d3b2b', b: '#5a2117', face: '#fbf1ee', edge: '#3a140d', emblem: '🧱', need: RARE, goal: (n) => `Win 500 with the other team at 0 or less ${n === 1 ? 'once' : `${n} times`}` },
];

const alpha = (hex, a) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

/** Ten card back patterns, plainest first. */
export const PATTERNS = [
  { name: 'Stripes', back: (a, b) => `repeating-linear-gradient(45deg, ${a} 0 4px, ${b} 4px 8px)` },
  { name: 'Checks', back: (a, b) => `conic-gradient(${a} 25%, ${b} 0 50%, ${a} 0 75%, ${b} 0) 0 0 / 10px 10px` },
  { name: 'Dots', back: (a, b) => `radial-gradient(${b} 30%, transparent 33%) 0 0 / 8px 8px, ${a}` },
  { name: 'Rings', back: (a, b) => `repeating-radial-gradient(circle at 50% 50%, ${a} 0 3px, ${b} 3px 6px)` },
  { name: 'Plaid', back: (a, b) => `repeating-linear-gradient(0deg, transparent 0 6px, ${alpha(b, 0.6)} 6px 9px), repeating-linear-gradient(90deg, transparent 0 6px, ${alpha(b, 0.6)} 6px 9px), ${a}` },
  { name: 'Diamonds', back: (a, b) => `linear-gradient(135deg, ${b} 25%, transparent 25%) -5px 0 / 10px 10px, linear-gradient(225deg, ${b} 25%, transparent 25%) -5px 0 / 10px 10px, linear-gradient(315deg, ${b} 25%, transparent 25%) 0 0 / 10px 10px, linear-gradient(45deg, ${b} 25%, ${a} 25%) 0 0 / 10px 10px` },
  { name: 'Grid', back: (a, b) => `linear-gradient(${b} 2px, transparent 2px) 0 0 / 8px 8px, linear-gradient(90deg, ${b} 2px, ${a} 2px) 0 0 / 8px 8px` },
  { name: 'Sunburst', back: (a, b) => `repeating-conic-gradient(from 0deg at 50% 50%, ${a} 0 10deg, ${b} 10deg 20deg)` },
  { name: 'Weave', back: (a, b) => `repeating-linear-gradient(45deg, ${alpha(b, 0.85)} 0 3px, transparent 3px 9px), repeating-linear-gradient(-45deg, ${alpha(b, 0.85)} 0 3px, transparent 3px 9px), ${a}` },
  { name: 'Shine', back: (a, b) => `linear-gradient(135deg, ${a} 0%, ${b} 45%, #ffe066 50%, ${b} 55%, ${a} 100%)`, gold: true },
];

/** All designs: { id, track, tier, name, emblem, back, face, edge, gold, need, goal }. */
export const DESIGNS = TRACKS.flatMap((t) => PATTERNS.map((p, tier) => ({
  id: tier === 0 && t.id === 'starter' ? 'classic' : `${t.id}-${tier}`,
  track: t.id,
  tier,
  name: tier === 0 && t.id === 'starter' ? 'Classic' : `${t.title} ${p.name}`,
  emblem: t.emblem,
  back: p.back(t.a, t.b),
  face: t.face,
  edge: p.gold ? '#c9971c' : t.edge,
  gold: !!p.gold,
  need: t.need ? t.need[tier] : null,
  goal: t.goal ? t.goal(t.need[tier]) : (tier === 0 ? 'Everyone has this one' : 'Sign in to use it'),
})));

const BY_ID = new Map(DESIGNS.map((d) => [d.id, d]));
export const designOf = (id) => BY_ID.get(id) || BY_ID.get('classic');

/** Inline style for a card face or back in this design. Classic keeps the stylesheet's look. */
export const faceStyle = (id) => {
  const d = designOf(id);
  if (d.id === 'classic') return undefined;
  return { background: d.face, borderColor: d.edge, boxShadow: `0 3px 0 ${d.edge}` };
};
export const backStyle = (id) => {
  const d = designOf(id);
  if (d.id === 'classic') return undefined;
  return { background: d.back, borderColor: d.gold ? '#ffe066' : '#fff6e3' };
};

const nameKey = (name) => String(name || '').trim().toLowerCase();

/**
 * One player's counts from saved game summaries. A seat is theirs when it carries their account id, or,
 * for games saved before accounts were recorded, when it has their name.
 */
export function progressFor(fiveGames, clubsGames, { uid, name }) {
  const c = { games: 0, fiveWins: 0, clubsWins: 0, S: 0, C: 0, D: 0, H: 0, NT: 0, nola: 0, dnola: 0, big: 0, slam: 0, shutout: 0 };
  const mine = (seat) => seat && !seat.bot && (seat.uid ? !!uid && seat.uid === uid : !!name && nameKey(seat.name) === nameKey(name));
  fiveGames.forEach((s) => {
    if (!s || !Array.isArray(s.seats) || s.winner == null) return;
    const seats = s.seats.map((x, i) => (mine(x) ? i : -1)).filter((i) => i >= 0);
    if (!seats.length) return;
    const me = seats[0];
    const team = s.seats[me].team ?? me % 2;
    c.games += 1;
    if (team === s.winner) {
      c.fiveWins += 1;
      if (((s.scores || [])[1 - team] ?? 1) <= 0) c.shutout += 1;
    }
    (s.history || []).forEach((h) => {
      if (!h || !h.made) return;
      const bidder = h.seat === me;
      const partner = h.seat === (me + 2) % 4;
      if (h.bid === 'OPEN') { if (bidder || partner) c.dnola += 1; return; }
      if (!bidder) return;
      if (h.bid === 'MIS') { c.nola += 1; return; }
      const m = /^(\d+)(S|C|D|H|NT)$/.exec(String(h.bid));
      if (!m) return;
      c[m[2]] += 1;
      if (Number(m[1]) >= 8) c.big += 1;
      if (h.slam) c.slam += 1;
    });
  });
  clubsGames.forEach((s) => {
    if (!s || !Array.isArray(s.seats) || !(s.winners || []).length) return;
    const seat = s.seats.find(mine);
    if (!seat) return;
    c.games += 1;
    if (s.winners.map(nameKey).includes(nameKey(seat.name))) c.clubsWins += 1;
  });
  return c;
}

/** Is this design open to a player with these counts? signedIn opens the Starter set. */
export const isUnlocked = (d, counts, signedIn) => {
  if (d.id === 'classic') return true;
  if (!signedIn) return false;
  if (d.track === 'starter') return true;
  return (counts?.[d.track] || 0) >= d.need;
};
