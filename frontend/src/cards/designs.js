// Card designs. Each design is one achievement track's colors and emblem drawn in one of ten styles (one per tier).
// Everyone gets Classic. Signing in opens the other nine Starter designs; the rest unlock by playing:
// winning games, making bids in each suit, Nola, Double Nola, big bids, slams and 500 to 0 shutouts.

const COMMON = [1, 3, 5, 10, 15, 20, 30, 40, 50, 75];
const WINS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50];
const BIDS = [1, 2, 3, 5, 7, 10, 13, 16, 20, 25];
const RARE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15];
// How far down your team was (500 points below zero) before you came back and won.
const DEPTH = [10, 100, 150, 200, 250, 300, 350, 400, 450, 490];

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Achievement tracks: a color set, an emblem, and what each tier takes. */
export const TRACKS = [
  { id: 'starter', title: 'Starter', blurb: 'Sign in to use these', a: '#8a3ffc', b: '#1e0848', c: '#ff9cf0', face: '#fbf7ff', emblem: '🎴', art: 'fan' },
  { id: 'games', title: 'Regular', a: '#1e88e5', b: '#071a38', c: '#7fd3ff', face: '#f2f8ff', emblem: '🎲', art: 'dice', need: COMMON, goal: (n) => `Play ${plural(n, 'game')}` },
  { id: 'fiveWins', title: 'Royal', a: '#d4a017', b: '#3a2200', c: '#fff1a8', face: '#fffaeb', emblem: '👑', art: 'crown', need: WINS, goal: (n) => `Win ${plural(n, 'game')} of 500` },
  { id: 'clubsWins', title: 'Lucky', a: '#22a35a', b: '#03301a', c: '#b0ffd0', face: '#f1fff6', emblem: '🍀', art: 'clover', need: WINS, goal: (n) => `Win ${plural(n, 'game')} of Dirty Clubs` },
  { id: 'S', title: 'Obsidian', a: '#4a4a5c', b: '#07070c', c: '#d6dcf0', face: '#f6f6fa', emblem: '♠', art: 'spade', need: BIDS, goal: (n) => `Make ${plural(n, '♠ bid')} in 500` },
  { id: 'C', title: 'Jungle', a: '#5b8f2e', b: '#122608', c: '#dcf5a0', face: '#f7fcef', emblem: '♣', art: 'club', need: BIDS, goal: (n) => `Make ${plural(n, '♣ bid')} in 500` },
  { id: 'D', title: 'Ruby', a: '#e0115f', b: '#38000f', c: '#ffb3d0', face: '#fff3f8', emblem: '♦', art: 'diamond', need: BIDS, goal: (n) => `Make ${plural(n, '♦ bid')} in 500` },
  { id: 'H', title: 'Inferno', a: '#ff3b3b', b: '#420008', c: '#ffd36e', face: '#fff4f2', emblem: '♥', art: 'heart', need: BIDS, goal: (n) => `Make ${plural(n, '♥ bid')} in 500` },
  { id: 'NT', title: 'Cosmic', a: '#4757ff', b: '#060a33', c: '#fff6a0', face: '#f4f5ff', emblem: '⭐', art: 'star', need: RARE, goal: (n) => `Make ${plural(n, 'No Trump bid')}` },
  { id: 'nola', title: 'Midnight', a: '#4f7aa3', b: '#050d18', c: '#e6f3ff', face: '#f3f7fb', emblem: '🌙', art: 'moon', need: RARE, goal: (n) => `Make ${plural(n, 'Nola')}` },
  { id: 'dnola', title: 'Eclipse', a: '#7a1fd1', b: '#030007', c: '#ff8a3d', face: '#f7f0ff', emblem: '🌑', art: 'eclipse', need: RARE, goal: (n) => `Make ${plural(n, 'Double Nola')}` },
  { id: 'big', title: 'Rocket', a: '#ff6d00', b: '#2e0a00', c: '#ffe082', face: '#fff6ee', emblem: '🚀', art: 'rocket', need: RARE, goal: (n) => `Make ${plural(n, 'bid')} of 8 or more` },
  { id: 'slam', title: 'Thunder', a: '#00b8d9', b: '#001d24', c: '#fffb8f', face: '#effcff', emblem: '⚡', art: 'bolt', need: RARE, goal: (n) => `Take all 10 tricks ${n === 1 ? 'once' : `${n} times`}` },
  { id: 'comeback', title: 'Phoenix', a: '#ff4d00', b: '#2b0500', c: '#ffd23f', face: '#fff5eb', emblem: '🔥', art: 'phoenix', need: DEPTH, best: true, goal: (n) => (n <= 10 ? 'Win 500 after your team was below 0' : `Win 500 after your team was down to -${n}`) },
  { id: 'shutout', title: 'Fortress', a: '#c4502f', b: '#260803', c: '#ffcf9e', face: '#fdf3ef', emblem: '🏰', art: 'castle', need: RARE, goal: (n) => `Win 500 with the other team at 0 or less ${n === 1 ? 'once' : `${n} times`}` },
];

// ---------- Artwork ----------
// Every design is drawn as an SVG: a background style (one per tier), a frame, and the track's emblem in a
// medallion. Higher tiers get busier backgrounds, corner emblems, gold frames, and the top tier a moving foil.

// Emblems, drawn in a box from -10 to 10.
const ART = {
  spade: '<path d="M0-9C5-4 10 0 6 4 4 6 1 5 1 3L2.5 9h-5L-1 3C-1 5-4 6-6 4-10 0-5-4 0-9z"/>',
  heart: '<path d="M0 8.5C-6 3.5-10-.5-9-5-8-9.5-2.5-9.5 0-5 2.5-9.5 8-9.5 9-5 10-.5 6 3.5 0 8.5z"/>',
  diamond: '<path d="M0-9.5L7 0 0 9.5-7 0z"/><path d="M0-9.5L2 0 0 9.5-2 0z" opacity=".35" fill="#fff"/>',
  club: '<circle cx="0" cy="-4.5" r="3.9"/><circle cx="-4.6" cy="1.6" r="3.9"/><circle cx="4.6" cy="1.6" r="3.9"/><path d="M-1 1L-2.8 9h5.6L1 1z"/>',
  star: '<path d="M0-10L2.9-3.1 10.4-3.1 4.4 1.4 6.6 9 0 4.6-6.6 9-4.4 1.4-10.4-3.1-2.9-3.1z"/>',
  moon: '<path d="M2-9.5A9.5 9.5 0 1 0 9 5 7.5 7.5 0 1 1 2-9.5z"/><circle cx="6" cy="-6" r="1" /><circle cx="8" cy="-1" r=".7"/>',
  eclipse: '<circle r="9.5" fill="CORONA" opacity=".9"/><circle r="7.6" fill="#05000a"/><circle cx="-2.6" cy="-2.6" r="1.4" fill="CORONA" opacity=".8"/>',
  crown: '<path d="M-9 6V-5l4.5 4L0-8l4.5 7L9-5V6z"/><rect x="-9" y="6.5" width="18" height="2.5" rx="1"/><circle cx="0" cy="-8.6" r="1.4"/><circle cx="-9" cy="-5.6" r="1.2"/><circle cx="9" cy="-5.6" r="1.2"/>',
  clover: '<circle cx="0" cy="-4.6" r="4.2"/><circle cx="4.6" cy="0" r="4.2"/><circle cx="0" cy="4.6" r="4.2"/><circle cx="-4.6" cy="0" r="4.2"/><path d="M1 3Q4 8 8 9.5" stroke="currentColor" fill="none" stroke-width="1.6"/>',
  dice: '<rect x="-8.5" y="-8.5" width="17" height="17" rx="3.5"/><g fill="BG"><circle cx="-4.2" cy="-4.2" r="1.7"/><circle cx="4.2" cy="-4.2" r="1.7"/><circle r="1.7"/><circle cx="-4.2" cy="4.2" r="1.7"/><circle cx="4.2" cy="4.2" r="1.7"/></g>',
  fan: '<rect x="-5" y="-8" width="10" height="15" rx="2" transform="rotate(-18)" opacity=".6"/><rect x="-5" y="-8" width="10" height="15" rx="2" transform="rotate(14)" opacity=".8"/><rect x="-5" y="-8.5" width="10" height="15" rx="2"/><path d="M0-5L2.6 0 0 5-2.6 0z" fill="BG"/>',
  rocket: '<path d="M0-10C4.5-6 4.5 2 3.2 5h-6.4C-4.5 2-4.5-6 0-10z"/><path d="M-3.2 1L-6.5 6l3.3-1zM3.2 1l3.3 5-3.3-1z"/><circle cy="-3" r="1.8" fill="BG"/><path d="M-2 5.5h4L0 10z" fill="FLAME"/>',
  bolt: '<path d="M2.5-10L-6 1.5h5L-3 10 6.5-2.5h-5L4-10z"/>',
  phoenix: '<path d="M0-10C3-6 8-3 7 3 6 7 3 9.5 0 9.5-3 9.5-6 7-7 3-8-3-3-6 0-10z"/><path d="M0-2C2 0 3.5 2 3 4.5 2.6 6.5 1.4 7.5 0 7.5-1.4 7.5-2.6 6.5-3 4.5-3.5 2-2 0 0-2z" fill="#ff5a00"/><path d="M-7-1C-10-4-10-8-9-9-7-6-6-4-5-2zM7-1C10-4 10-8 9-9 7-6 6-4 5-2z"/>',
  castle: '<path d="M-9 9V-4h3v-3h2.5v3h2.5v-3h2v3h2.5v-3h2.5v3h3V9H2.5V4a2.5 2.5 0 0 0-5 0V9z"/>',
};

const SEED = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; };

const emblem = (t, color, x, y, scale, extra = '') => {
  const body = ART[t.art].replace(/BG/g, t.b).replace(/CORONA/g, t.c).replace(/FLAME/g, '#ffcf3f');
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}" color="${color}"${extra}>${body}</g>`;
};

// Ten background styles, one per tier. W x H is the card (50 x 70).
const BACKS = [
  { name: 'Glow', draw: (t) => `<rect width="50" height="70" fill="url(#g)"/>` },
  { name: 'Pinstripe', draw: (t) => `<rect width="50" height="70" fill="url(#g)"/><g stroke="${t.c}" stroke-opacity=".22" stroke-width="1.2">${Array.from({ length: 16 }, (_, i) => `<line x1="${i * 8 - 40}" y1="0" x2="${i * 8 + 30}" y2="70"/>`).join('')}</g>` },
  { name: 'Polka', draw: (t) => `<rect width="50" height="70" fill="url(#g)"/><g fill="${t.c}" fill-opacity=".2">${Array.from({ length: 70 }, (_, i) => { const r = Math.floor(i / 7); const c = i % 7; return `<circle cx="${c * 8 + (r % 2) * 4}" cy="${r * 7 + 3}" r="1.6"/>`; }).join('')}</g>` },
  { name: 'Lattice', draw: (t) => `<rect width="50" height="70" fill="url(#g)"/><g stroke="${t.c}" stroke-opacity=".28" stroke-width=".8">${Array.from({ length: 14 }, (_, i) => `<line x1="${i * 7 - 35}" y1="0" x2="${i * 7 + 35}" y2="70"/><line x1="${i * 7 + 35}" y1="0" x2="${i * 7 - 35}" y2="70"/>`).join('')}</g>` },
  { name: 'Starfield', draw: (t, rnd) => `<rect width="50" height="70" fill="url(#g)"/><g fill="${t.c}">${Array.from({ length: 46 }, () => `<circle cx="${(rnd() * 50).toFixed(1)}" cy="${(rnd() * 70).toFixed(1)}" r="${(0.25 + rnd() * 0.75).toFixed(2)}" opacity="${(0.35 + rnd() * 0.65).toFixed(2)}"/>`).join('')}</g>` },
  { name: 'Tide', draw: (t) => `<rect width="50" height="70" fill="url(#g)"/><g fill="none" stroke="${t.c}" stroke-opacity=".3" stroke-width="1.1">${Array.from({ length: 12 }, (_, i) => `<path d="M-5 ${i * 6.5}q6.25-4 12.5 0t12.5 0 12.5 0 12.5 0 12.5 0"/>`).join('')}</g>` },
  { name: 'Sunburst', draw: (t) => `<rect width="50" height="70" fill="url(#g)"/><g fill="${t.c}" fill-opacity=".16">${Array.from({ length: 18 }, (_, i) => `<path d="M25 35L${(25 + 80 * Math.cos((i * 20) * Math.PI / 180)).toFixed(1)} ${(35 + 80 * Math.sin((i * 20) * Math.PI / 180)).toFixed(1)}L${(25 + 80 * Math.cos((i * 20 + 10) * Math.PI / 180)).toFixed(1)} ${(35 + 80 * Math.sin((i * 20 + 10) * Math.PI / 180)).toFixed(1)}z"/>`).join('')}</g>` },
  { name: 'Mandala', draw: (t) => `<rect width="50" height="70" fill="url(#g)"/><g transform="translate(25 35)" fill="none" stroke="${t.c}" stroke-opacity=".38" stroke-width=".7">${Array.from({ length: 12 }, (_, i) => `<ellipse rx="5" ry="19" transform="rotate(${i * 15})"/>`).join('')}${[8, 15, 22].map((r) => `<circle r="${r}"/>`).join('')}</g>` },
  { name: 'Emblem Tile', draw: (t) => `<rect width="50" height="70" fill="url(#g)"/>${Array.from({ length: 30 }, (_, i) => { const r = Math.floor(i / 5); const c = i % 5; return emblem(t, t.c, c * 11 + 3 + (r % 2) * 5.5, r * 12 + 5, 0.24, ' opacity=".22"'); }).join('')}` },
  { name: 'Holo Foil', draw: (t) => `<rect width="50" height="70" fill="url(#holo)"/><rect width="50" height="70" fill="url(#g)" opacity=".55"/><g transform="translate(25 35)" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".6">${Array.from({ length: 24 }, (_, i) => `<line x1="0" y1="0" x2="${(60 * Math.cos(i * 15 * Math.PI / 180)).toFixed(1)}" y2="${(60 * Math.sin(i * 15 * Math.PI / 180)).toFixed(1)}"/>`).join('')}</g>`, foil: true },
];

const GOLD = '#ffd54a';
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// Each tier also gets its own mood, so a track's ten designs don't all look alike.
const MOODS = {
  2: (t) => ({ a: '#ffffff', b: t.c, c: t.a }), // light
  4: (t) => ({ a: t.b, b: '#000000', c: t.c }), // night
  5: (t) => ({ a: t.c, b: t.a, c: '#ffffff' }), // pastel
  7: (t) => ({ a: '#1a1426', b: '#000000', c: t.c }), // midnight
};

function drawBack(base, tier, id) {
  const t = MOODS[tier] ? { ...base, ...MOODS[tier](base) } : base;
  const style = BACKS[tier];
  const rnd = SEED(id);
  const gold = tier >= 6;
  const frame = gold ? GOLD : t.c;
  const corners = tier >= 4 ? [[8, 9], [42, 9], [8, 61], [42, 61]].map(([x, y]) => emblem(t, frame, x, y, 0.26, ' opacity=".9"')).join('') : '';
  const medal = 6.5 + tier * 0.45;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 70" preserveAspectRatio="xMidYMid slice"><defs>`
    + `<radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></radialGradient>`
    + `<radialGradient id="m" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></radialGradient>`
    + '<linearGradient id="holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6ad5"/><stop offset=".25" stop-color="#ffd36e"/><stop offset=".5" stop-color="#6affc8"/><stop offset=".75" stop-color="#6ab8ff"/><stop offset="1" stop-color="#c86aff"/></linearGradient>'
    + `</defs>${style.draw(t, rnd)}`
    + `<rect x="${tier >= 2 ? 3 : 2.5}" y="${tier >= 2 ? 3 : 2.5}" width="${tier >= 2 ? 44 : 45}" height="${tier >= 2 ? 64 : 65}" rx="4" fill="none" stroke="${frame}" stroke-width="${gold ? 1.3 : 0.9}" stroke-opacity="${gold ? 1 : 0.7}"/>`
    + (tier >= 8 ? `<rect x="5.2" y="5.2" width="39.6" height="59.6" rx="3" fill="none" stroke="${GOLD}" stroke-width=".5"/>` : '')
    + corners
    + `<circle cx="25" cy="35" r="${medal + 2.2}" fill="${gold ? GOLD : t.c}" opacity="${gold ? 0.95 : 0.55}"/>`
    + `<circle cx="25" cy="35" r="${medal}" fill="url(#m)"/>`
    + emblem(t, gold ? GOLD : t.c, 25, 35, medal / 13)
    + '</svg>';
}

function drawFace(t, tier) {
  const gold = tier >= 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 70" preserveAspectRatio="xMidYMid slice">`
    + `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${t.face}"/></linearGradient></defs>`
    + '<rect width="50" height="70" fill="url(#f)"/>'
    + emblem(t, t.a, 25, 36, 1.9, ' opacity=".09"')
    + `<rect x="2.5" y="2.5" width="45" height="65" rx="3.5" fill="none" stroke="${gold ? '#d4a017' : t.a}" stroke-width="${gold ? 1.4 : 0.9}" stroke-opacity="${gold ? 1 : 0.55}"/>`
    + (tier >= 3 ? emblem(t, gold ? '#d4a017' : t.a, 7, 8, 0.2) + emblem(t, gold ? '#d4a017' : t.a, 43, 62, 0.2) : '')
    + '</svg>';
}

/** All designs: { id, track, tier, name, emblem, need, goal, foil, gold }. Art is drawn on first use. */
export const DESIGNS = TRACKS.flatMap((t) => BACKS.map((b, tier) => ({
  id: tier === 0 && t.id === 'starter' ? 'classic' : `${t.id}-${tier}`,
  track: t.id,
  tier,
  name: tier === 0 && t.id === 'starter' ? 'Classic' : `${t.title} ${b.name}`,
  emblem: t.emblem,
  edge: tier >= 6 ? '#b8860b' : t.b,
  gold: tier >= 6,
  foil: !!b.foil,
  need: t.need ? t.need[tier] : null,
  goal: t.goal ? t.goal(t.need[tier]) : (tier === 0 ? 'Everyone has this one' : 'Sign in to use it'),
})));

const BY_ID = new Map(DESIGNS.map((d) => [d.id, d]));
const TRACK_BY_ID = new Map(TRACKS.map((t) => [t.id, t]));
export const designOf = (id) => BY_ID.get(id) || BY_ID.get('classic');

const drawn = new Map();
const art = (d) => {
  if (!drawn.has(d.id)) {
    const t = TRACK_BY_ID.get(d.track);
    drawn.set(d.id, { back: svgUrl(drawBack(t, d.tier, d.id)), face: svgUrl(drawFace(t, d.tier)) });
  }
  return drawn.get(d.id);
};

/** Inline style for a card face or back in this design. Classic keeps the stylesheet's look. */
export const faceStyle = (id) => {
  const d = designOf(id);
  if (d.id === 'classic') return undefined;
  return { background: `${art(d).face} center / 100% 100% no-repeat, #fff`, borderColor: d.edge, boxShadow: `0 3px 0 ${d.edge}` };
};
export const backStyle = (id) => {
  const d = designOf(id);
  if (d.id === 'classic') return undefined;
  return { background: `${art(d).back} center / 100% 100% no-repeat, ${TRACK_BY_ID.get(d.track).b}`, borderColor: d.gold ? GOLD : '#fff6e3' };
};
/** Extra class for a design's cards: the top tier shimmers. */
export const designClass = (id) => (designOf(id).foil ? ' is-foil' : '');

const nameKey = (name) => String(name || '').trim().toLowerCase();

/**
 * One player's counts from saved game summaries. A seat is theirs when it carries their account id, or,
 * for games saved before accounts were recorded, when it has their name.
 */
export function progressFor(fiveGames, clubsGames, { uid, name }) {
  const c = { games: 0, fiveWins: 0, clubsWins: 0, S: 0, C: 0, D: 0, H: 0, NT: 0, nola: 0, dnola: 0, big: 0, slam: 0, shutout: 0, comeback: 0 };
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
      // Comeback: the deepest your team was below zero in a game you won.
      const low = (s.lows || [])[team];
      if (typeof low === 'number' && low < 0) c.comeback = Math.max(c.comeback, -low);
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
