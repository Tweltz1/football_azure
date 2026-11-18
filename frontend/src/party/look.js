// A party character's look, as a short code. The first 15 fields are exactly Hood Protocol's Look
// (hood-protocol/App/Look.swift), so a Hood Protocol look loads here unchanged. Field 16 is a
// costume (Halloween or holiday), which Hood Protocol ignores.

import { season } from './season.js';

export const SKINS = [0xF6D7C3, 0xEBB998, 0xD39A6E, 0xB0774B, 0x8A5634, 0x5E3A22, 0xF1C7A5, 0xEABF9B, 0xF4CFB0, 0xE8B892];
export const HAIR_STYLES = ['Buzz', 'Short', 'Curly', 'Afro', 'Long', 'Bun', 'Bald', 'Mohawk', 'Mullet', 'Spiky', 'Pigtails', 'Dreads'];
export const HAIR_COLORS = [0x1C1410, 0x4A2E1D, 0x8B5A2B, 0xD8B26A, 0xB8432F, 0x9A9A9A, 0x7B5CFF, 0x2B1D16,
  0x39E75F, 0x8FE3FF, 0xFF5FA2, 0x2F6BFF, 0xFF8A2A, 0xF3EBD2, 0x1FB5A8];
export const HATS = ['None', 'Cap', 'Backwards cap', 'Beanie', 'Party hat', 'Cowboy hat', 'Crown', 'Traffic cone',
  'Viking helmet', 'Propeller cap', 'Chef hat', 'Tinfoil hat', 'Angel halo', 'Beer helmet',
  'Top hat', 'Wizard hat', 'Pirate hat', 'Bucket hat', 'Beret', 'Bunny ears', 'Devil horns',
  'Graduation cap', 'Durag', 'Bandana'];
export const TOPS = ['Tee', 'Hoodie', 'Jersey', 'Tank', 'Dress', 'Hawaiian shirt', 'Tuxedo', 'Toga', 'Letterman jacket', 'Referee shirt',
  'Flannel', 'Puffer jacket', 'Basketball jersey', 'Overalls', 'Lab coat', 'Superhero cape', 'Leather jacket', 'Bathrobe'];
export const EXTRAS = ['None', 'Gold grill', 'Clown nose', 'Eye black', 'Sweatband', 'Diamond earring',
  'Monocle', 'Eye patch', 'Star tattoo', 'Freckles', 'Fangs', 'Nose ring', 'Bubblegum', 'Heart tattoo'];
export const FACIAL_HAIR = ['None', 'Beard', 'Mustache'];
export const CLOTHES = [0x8B6CFF, 0x3DDC97, 0xFF6B6B, 0xF5B84A, 0x2F80ED, 0x111318, 0xF2F2F2, 0x6B4E3D, 0xFF8BD0, 0x3A5A40,
  0x2340C8, 0xA9ABB2, 0x6D6A70, 0x1C1E26, 0x203731, 0xD1237A, 0xD33B3B, 0x7A7C62, 0x1F5A3B,
  0x8F9298, 0x8E1D2C, 0x1F2A44, 0xC9B98A, 0xE7B94A, 0x24242A, 0xB07A4C, 0x2A3A30,
  0xD4AF37, 0xFF6A13, 0xB9A7F5, 0x9ED3FF, 0x6B1F2E, 0x9BE15D, 0xC9CED6];
export const PANTS_COLORS = [0x2B3A55, 0x1A1A1A, 0x6E6A60, 0xC2B280, 0x5A6B7A, 0x7A2E2E, 0x1B1B22, 0x9A9CA3, 0x26304F, 0xA3A5AB, 0x3A3F4A, 0xD8C39A, 0xB4B6BB,
  0xFF5FA2, 0x4E6B3A, 0xF2F2F2, 0xD4AF37];
export const SHOE_COLORS = [0xF2F2F2, 0x111111, 0xFF6B6B, 0x2F80ED, 0xF5B84A, 0xD4AF37, 0x39E75F, 0xFF5FA2, 0x8E44AD];
export const COSTUMES = ['None', 'Vampire cape', 'Skeleton suit', 'Pumpkin head', 'Ghost sheet', 'Witch hat',
  'Monster bolts', 'Zombie', 'Mummy wraps', 'Black cat',
  // Holiday costumes (added 2026-11; append only, the index is saved in look codes).
  'Santa hat', 'Elf hat', 'Reindeer antlers', 'Pilgrim hat', 'Turkey hat', 'Heart glasses', 'Leprechaun hat',
  'Uncle Sam hat', 'New Year crown', 'Bunny ears'];

// Which costumes are offered and worn by made-up characters, by the theme on now (see season.js).
// Between holidays every costume is offered. A saved look keeps its costume either way.
export const SEASON_COSTUMES = {
  spooky: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  thanksgiving: [13, 14],
  christmas: [10, 11, 12],
  newyear: [18],
  valentines: [15],
  stpatricks: [16],
  easter: [19],
  july4: [17],
};
const ALL_COSTUMES = [...COSTUMES.keys()].slice(1);
export const costumesNow = () => SEASON_COSTUMES[season()] || ALL_COSTUMES;
/** The k-th costume of the season, wrapping around. */
export const seasonCostume = (k = 0) => { const l = costumesNow(); return l[((k % l.length) + l.length) % l.length]; };
/** Whether a costume shows in the editor right now. */
export const costumeOffered = (i) => i === 0 || costumesNow().includes(i);

// Kept family friendly: Hood Protocol's beer helmet isn't offered here, and a Hood Protocol look wearing
// one shows up with a regular cap instead.
export const HIDDEN = { hat: new Set([13]) };
const hidden = (key, value) => Boolean(HIDDEN[key]?.has(value));

// [field, number of choices or 2 for on/off], in code order.
const FIELDS = [
  ['skin', SKINS.length], ['hair', HAIR_STYLES.length], ['hairColor', HAIR_COLORS.length], ['hat', HATS.length],
  ['hatColor', CLOTHES.length], ['top', TOPS.length], ['topColor', CLOTHES.length], ['pants', PANTS_COLORS.length],
  ['shoes', SHOE_COLORS.length], ['glasses', 2], ['chain', 2], ['facial', FACIAL_HAIR.length], ['shades', 2],
  ['shorts', 2], ['extra', EXTRAS.length], ['costume', COSTUMES.length],
];
const FLAGS = new Set(['glasses', 'chain', 'shades', 'shorts']);

export const DEFAULT_LOOK = Object.freeze({
  skin: 2, hair: 1, hairColor: 0, hat: 0, hatColor: 0, top: 0, topColor: 0, pants: 0, shoes: 0,
  glasses: false, chain: false, facial: 0, shades: false, shorts: false, extra: 0, costume: 0,
});

/** "2.1.0.0.0.0.0.0.0.0.0.0.0.0.0.0": every field in order. */
export const lookCode = (look) => FIELDS.map(([key]) => {
  const value = look?.[key];
  return FLAGS.has(key) ? (value ? 1 : 0) : (Number.isFinite(value) ? value : 0);
}).join('.');

/** Reads a code. Unknown or missing parts fall back to defaults, out of range ones are clamped. */
export const parseLook = (code) => {
  const parts = String(code || '').split('.').map((p) => parseInt(p, 10));
  const look = { ...DEFAULT_LOOK };
  if (!code) return look;
  FIELDS.forEach(([key, count], index) => {
    const raw = Number.isFinite(parts[index]) ? parts[index] : 0;
    const value = Math.min(Math.max(raw, 0), count - 1);
    look[key] = FLAGS.has(key) ? value === 1 : value;
  });
  if (hidden('hat', look.hat)) look.hat = 1;
  return look;
};

export const isLookCode = (code) => typeof code === 'string' && /^\d{1,2}(\.\d{1,2}){10,20}$/.test(code);

/** Cycles one field forward (+1) or back (-1). */
export const stepLook = (look, key, dir) => {
  const field = FIELDS.find(([k]) => k === key);
  if (!field) return look;
  const count = field[1];
  if (FLAGS.has(key)) return { ...look, [key]: !look[key] };
  let value = look[key] || 0;
  if (key === 'costume') {
    const list = [0, ...costumesNow()];
    const at = list.indexOf(value);
    const next = at < 0 ? (dir > 0 ? 0 : list.length - 1) : ((at + dir) % list.length + list.length) % list.length;
    return { ...look, costume: list[next] };
  }
  do { value = ((value + dir) % count + count) % count; } while (hidden(key, value));
  return { ...look, [key]: value };
};

export const randomLook = (rand = Math.random) => {
  const pick = (n) => Math.floor(rand() * n);
  return {
    skin: pick(SKINS.length),
    hair: pick(HAIR_STYLES.length),
    hairColor: pick(8),
    hat: rand() < 0.4 ? 0 : [...HATS.keys()].filter((h) => h > 0 && !hidden('hat', h))[pick(HATS.length - 1 - HIDDEN.hat.size)],
    hatColor: pick(27),
    top: pick(TOPS.length),
    topColor: pick(27),
    pants: pick(13),
    shoes: pick(5),
    glasses: rand() < 0.2,
    chain: rand() < 0.25,
    facial: rand() < 0.2 ? 1 + pick(2) : 0,
    shades: rand() < 0.15,
    shorts: rand() < 0.2,
    extra: rand() < 0.3 ? 1 + pick(EXTRAS.length - 1) : 0,
    costume: rand() < 0.6 ? seasonCostume(pick(99)) : 0,
  };
};

/** The Hood League crew (as drawn on the site), in the site's CREW order. Same as Look.crew in Hood Protocol. */
export const crewLook = (index) => {
  const c = (hex) => Math.max(0, CLOTHES.indexOf(hex));
  const p = (hex) => Math.max(0, PANTS_COLORS.indexOf(hex));
  const i = ((index % 10) + 10) % 10;
  const look = { ...DEFAULT_LOOK, skin: [6, 7, 8, 6, 9, 8, 7, 6, 8, 7][i], hair: 0, hat: 1, shoes: 0 };
  switch (i) {
    case 0: return { ...look, hat: 2, hatColor: c(0x8E1D2C), top: 3, topColor: c(0x2340C8), pants: p(0x1B1B22), shorts: true };
    case 1: return { ...look, hatColor: c(0x1F2A44), top: 1, topColor: c(0xA9ABB2), pants: p(0x9A9CA3), facial: 1 };
    case 2: return { ...look, hatColor: c(0xC9B98A), top: 0, topColor: c(0x6D6A70), pants: p(0x26304F) };
    case 3: return { ...look, hat: 2, hatColor: c(0xE7B94A), top: 1, topColor: c(0x1C1E26), pants: p(0xA3A5AB) };
    case 4: return { ...look, hatColor: c(0x203731), top: 2, topColor: c(0x203731), pants: p(0x3A3F4A), shades: true, facial: 2 };
    case 5: return { ...look, hat: 0, hair: 4, hairColor: 7, top: 4, topColor: c(0xD1237A), shoes: 2 };
    case 6: return { ...look, hatColor: c(0x24242A), top: 1, topColor: c(0xD33B3B), pants: p(0x1B1B22), facial: 1 };
    case 7: return { ...look, hatColor: c(0xB07A4C), top: 0, topColor: c(0x7A7C62), pants: p(0x1B1B22) };
    case 8: return { ...look, hatColor: c(0x2A3A30), top: 2, topColor: c(0x1F5A3B), pants: p(0xD8C39A), shorts: true };
    default: return { ...look, hatColor: c(0x24242A), top: 1, topColor: c(0x8F9298), pants: p(0xB4B6BB) };
  }
};

export const CREW_NAMES = ['John', 'Evan', 'Bush', 'Pat', 'Michael', 'Chrome', 'Connor', 'Ben', 'Weltz', 'Logan'];

/** The editor's rows: [field, label, choice names or null for colors/toggles, colors]. */
export const EDITOR_ROWS = [
  { key: 'costume', label: 'Costume', names: COSTUMES },
  { key: 'skin', label: 'Skin', colors: SKINS },
  { key: 'hair', label: 'Hair', names: HAIR_STYLES },
  { key: 'hairColor', label: 'Hair color', colors: HAIR_COLORS },
  { key: 'hat', label: 'Hat', names: HATS },
  { key: 'hatColor', label: 'Hat color', colors: CLOTHES },
  { key: 'top', label: 'Top', names: TOPS },
  { key: 'topColor', label: 'Top color', colors: CLOTHES },
  { key: 'pants', label: 'Pants', colors: PANTS_COLORS },
  { key: 'shoes', label: 'Shoes', colors: SHOE_COLORS },
  { key: 'extra', label: 'Face extra', names: EXTRAS },
  { key: 'facial', label: 'Facial hair', names: FACIAL_HAIR },
  { key: 'glasses', label: 'Glasses', toggle: true },
  { key: 'shades', label: 'Shades', toggle: true },
  { key: 'chain', label: 'Gold chain', toggle: true },
  { key: 'shorts', label: 'Shorts', toggle: true },
];

export const hex = (value) => `#${(value >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
