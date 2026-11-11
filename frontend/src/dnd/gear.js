// Gear you unlock by playing: helmets and hats, cloaks and wings, auras, pets and titles.
// Each hero keeps a tally of what they've done (sheet.deeds). A piece unlocks when its tally is reached,
// and stays unlocked: the tallies only go up. What you wear is sheet.wear = { head, cloak, aura, pet, title }.
// The art is in the same units as the party cartoon (personMarkup): feet at 0,0, top of the head near y -232.

import { personMarkup } from '../party/cartoon';
import { parseLook } from '../party/look';

export const SLOTS = [
  { id: 'head', name: 'Head', icon: '⛑️' },
  { id: 'cloak', name: 'Cloak', icon: '🧣' },
  { id: 'aura', name: 'Aura', icon: '✨' },
  { id: 'pet', name: 'Pet', icon: '🐾' },
  { id: 'title', name: 'Title', icon: '🏷️' },
];

/** What each tally counts, for the phone's progress lines. */
export const DEEDS = {
  scenes: 'scenes explored', places: 'kinds of places visited', kills: 'monsters defeated', bosses: 'bosses defeated',
  undead: 'undead destroyed', crits: 'critical hits', quests: 'quests finished', flawless: 'quests finished with nobody falling',
  pockets: 'pockets picked', persuades: 'NPCs persuaded', intimidates: 'NPCs intimidated', surprises: 'ambushes sprung',
  traps: 'traps found', stashes: 'hidden stashes found', chests: 'chests opened', mimics: 'mimics found', items: 'items used',
  potions: 'potions drunk', gold: 'gold earned', shopping: 'things bought', tasks: 'side tasks done', downs: 'times knocked out',
  heals: 'HP healed on friends', level: 'level', classQuests: 'quests finished as this class',
};

const g = (slot, id, name, deed, need, extra = {}) => ({ slot, id, name, deed, need, ...extra });

// Ordered roughly from first night to legend.
export const GEAR = [
  // Head
  g('head', 'traveler-hood', 'Traveler’s hood', 'scenes', 3),
  g('head', 'iron-helm', 'Iron helm', 'kills', 10),
  g('head', 'circlet', 'Silver circlet', 'level', 3),
  g('head', 'thief-hood', 'Thief’s hood', 'pockets', 3),
  g('head', 'feather-cap', 'Feathered cap', 'persuades', 5),
  g('head', 'treasure-hat', 'Treasure hunter’s hat', 'stashes', 5),
  g('head', 'leaf-hood', 'Leafy hood', 'tasks', 10),
  g('head', 'horned-helm', 'Horned helm', 'kills', 50),
  g('head', 'crown', 'Hero’s crown', 'level', 5),
  g('head', 'dragon-helm', 'Dragon-scale helm', 'bosses', 1),
  g('head', 'shadow-mask', 'Shadow mask', 'pockets', 15),
  g('head', 'bone-helm', 'Bone helm', 'undead', 25),
  g('head', 'antlers', 'Wanderer’s antlers', 'places', 8),
  g('head', 'royal-crown', 'Jeweled crown', 'level', 10),
  g('head', 'star-hat', 'Star wizard hat', 'classQuests', 3, { cls: 'wizard' }),
  g('head', 'winged-helm', 'Winged helm', 'classQuests', 3, { cls: 'paladin' }),
  g('head', 'champion-helm', 'Champion’s plumed helm', 'classQuests', 3, { cls: 'fighter' }),
  g('head', 'wolf-pelt', 'Wolf pelt', 'classQuests', 3, { cls: 'barbarian' }),
  g('head', 'masked-hood', 'Masked hood', 'classQuests', 3, { cls: 'rogue' }),
  // Cloak
  g('cloak', 'adventurer-cloak', 'Adventurer’s cloak', 'quests', 1),
  g('cloak', 'red-cape', 'Crimson cape', 'crits', 5),
  g('cloak', 'tattered-cloak', 'Survivor’s rags', 'downs', 1),
  g('cloak', 'merchant-mantle', 'Merchant’s mantle', 'shopping', 10),
  g('cloak', 'frost-cloak', 'Frost cloak', 'scenes', 25),
  g('cloak', 'starry-cloak', 'Starry cloak', 'quests', 10),
  g('cloak', 'royal-cape', 'Royal cape', 'gold', 2000),
  g('cloak', 'flame-cape', 'Flame cape', 'kills', 150),
  g('cloak', 'bat-wings', 'Bat wings', 'undead', 10),
  g('cloak', 'angel-wings', 'Angel wings', 'heals', 150),
  g('cloak', 'dragon-wings', 'Dragon wings', 'bosses', 10),
  g('cloak', 'night-cloak', 'Night cloak', 'classQuests', 3, { cls: 'ranger' }),
  // Aura
  g('aura', 'sparkle', 'Sparkles', 'chests', 5),
  g('aura', 'leaf-aura', 'Swirling leaves', 'tasks', 5),
  g('aura', 'frost-aura', 'Frost', 'traps', 10),
  g('aura', 'shadow-aura', 'Shadows', 'surprises', 10),
  g('aura', 'golden-aura', 'Golden glow', 'flawless', 1),
  g('aura', 'storm-aura', 'Storm', 'items', 25),
  g('aura', 'flame-aura', 'Flames', 'crits', 25),
  g('aura', 'ghost-aura', 'Ghost wisps', 'undead', 50),
  g('aura', 'rainbow-aura', 'Legend’s rainbow', 'quests', 25),
  g('aura', 'halo', 'Sun halo', 'classQuests', 3, { cls: 'cleric' }),
  // Pet
  g('pet', 'cat', 'Tavern cat', 'scenes', 1),
  g('pet', 'frog', 'Swamp frog', 'places', 4),
  g('pet', 'owl', 'Wise owl', 'traps', 5),
  g('pet', 'raven', 'Raven', 'surprises', 5),
  g('pet', 'fairy', 'Fairy', 'potions', 10),
  g('pet', 'mimic', 'Tiny mimic', 'mimics', 1),
  g('pet', 'skull-wisp', 'Skull wisp', 'downs', 5),
  g('pet', 'slime', 'Pet slime', 'kills', 100),
  g('pet', 'whelp', 'Dragon whelp', 'bosses', 5),
  g('pet', 'wolf-pup', 'Wolf pup', 'classQuests', 3, { cls: 'ranger' }),
  g('pet', 'songbird', 'Songbird', 'classQuests', 3, { cls: 'bard' }),
  // Titles
  g('title', 'brave', 'the Brave', 'kills', 1),
  g('title', 'wanderer', 'the Wanderer', 'places', 3),
  g('title', 'light-fingers', 'Light Fingers', 'pockets', 1),
  g('title', 'silver-tongue', 'Silver Tongue', 'persuades', 3),
  g('title', 'trapfinder', 'Trapfinder', 'traps', 3),
  g('title', 'bounty-hunter', 'Bounty Hunter', 'tasks', 3),
  g('title', 'treasure-seeker', 'Treasure Seeker', 'stashes', 3),
  g('title', 'ghost', 'the Ghost', 'surprises', 3),
  g('title', 'veteran', 'the Veteran', 'level', 4),
  g('title', 'monster-hunter', 'Monster Hunter', 'kills', 25),
  g('title', 'lucky', 'the Lucky', 'crits', 10),
  g('title', 'terror', 'the Terror', 'intimidates', 5),
  g('title', 'lifesaver', 'Lifesaver', 'heals', 40),
  g('title', 'haggler', 'the Haggler', 'shopping', 5),
  g('title', 'collector', 'the Collector', 'items', 10),
  g('title', 'deep-pockets', 'Deep Pockets', 'gold', 500),
  g('title', 'bossbreaker', 'Bossbreaker', 'bosses', 3),
  g('title', 'gravewalker', 'Gravewalker', 'undead', 15),
  g('title', 'mimic-tamer', 'Mimic Tamer', 'mimics', 3),
  g('title', 'hero', 'Hero of the Realm', 'quests', 5),
  g('title', 'unbreakable', 'the Unbreakable', 'flawless', 3),
  g('title', 'prince-thieves', 'Prince of Thieves', 'pockets', 40),
  g('title', 'champion', 'the Champion', 'level', 8),
  g('title', 'worldwalker', 'Worldwalker', 'places', 8),
  g('title', 'slayer', 'the Slayer', 'kills', 250),
  g('title', 'moneybags', 'Moneybags', 'gold', 5000),
  g('title', 'dragonslayer', 'Dragonslayer', 'bosses', 15),
  g('title', 'legend', 'the Legend', 'quests', 20),
];

export const GEAR_BY_ID = Object.fromEntries(GEAR.map((x) => [x.id, x]));

const ONE = {
  scenes: 'scene explored', kills: 'monster defeated', bosses: 'boss defeated', quests: 'quest finished', flawless: 'quest with nobody falling',
  pockets: 'pocket picked', mimics: 'mimic found', downs: 'time knocked out',
};

const CLASS_NAMES = { fighter: 'Fighter', barbarian: 'Barbarian', rogue: 'Rogue', ranger: 'Ranger', wizard: 'Wizard', cleric: 'Cleric', bard: 'Bard', paladin: 'Paladin' };

// ---- Tallies ----------------------------------------------------------------------------------------------

const NUM_DEEDS = Object.keys(DEEDS).filter((k) => k !== 'places' && k !== 'level');

/** A clean copy of saved tallies: whole numbers, and a list of place ids. */
export const cleanDeeds = (raw) => {
  const d = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  NUM_DEEDS.forEach((k) => {
    const n = Math.floor(Number(d[k]) || 0);
    if (n > 0) out[k] = Math.min(10000000, n);
  });
  out.places = Array.isArray(d.places) ? [...new Set(d.places.map((p) => String(p).slice(0, 16)))].slice(0, 12) : [];
  return out;
};

/** How far a sheet is toward a tally. */
export const deedValue = (sheet, deed) => {
  if (deed === 'level') return sheet?.level || 1;
  const d = sheet?.deeds || {};
  if (deed === 'places') return (d.places || []).length;
  return d[deed] || 0;
};

export const isUnlocked = (sheet, item) => Boolean(item) && (!item.cls || item.cls === sheet?.classId) && deedValue(sheet, item.deed) >= item.need;

export const unlockedIds = (sheet) => GEAR.filter((item) => isUnlocked(sheet, item)).map((item) => item.id);

/** "Defeat 10 monsters" and the like, for a locked piece. */
export const howToUnlock = (item) => {
  const what = DEEDS[item.deed] || item.deed;
  if (item.deed === 'level') return `Reach level ${item.need}`;
  if (item.deed === 'classQuests') return `Finish ${item.need} quests as a ${CLASS_NAMES[item.cls] || item.cls}`;
  if (item.need === 1) return `First ${ONE[item.deed] || what}`;
  return `${item.need} ${what}`;
};

/** Only pieces this hero has unlocked, in the right slot. */
export const cleanWear = (raw, sheet) => {
  const w = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  SLOTS.forEach(({ id }) => {
    const item = GEAR_BY_ID[w[id]];
    if (item && item.slot === id && (!sheet || isUnlocked(sheet, item))) out[id] = item.id;
  });
  return out;
};

export const titleOf = (sheet) => GEAR_BY_ID[sheet?.wear?.title]?.name || null;

// ---- Art --------------------------------------------------------------------------------------------------

const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="#16122b" stroke-width="5" stroke-linejoin="round" ${extra}/>`;
const PN = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const E = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="#16122b" stroke-width="5" ${extra}/>`;
const EN = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const star = (x, y, r, fill) => {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const k = i % 2 ? r * 0.45 : r;
    pts.push(`${(x + Math.cos(a) * k).toFixed(1)},${(y + Math.sin(a) * k).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
};

// Head pieces sit on a head centred at (0, -186), radius about 46.
const hood = (c, dark, tip = false) => P('M-64 -146 Q-74 -254 0 -266 Q74 -254 64 -146 Q54 -168 48 -200 Q34 -238 0 -240 Q-34 -238 -48 -200 Q-54 -168 -64 -146 Z', c)
  + P('M-64 -150 Q-36 -128 0 -130 Q36 -128 64 -150 L70 -134 Q0 -104 -70 -134 Z', dark)
  + (tip ? P('M-16 -262 Q24 -306 60 -292 Q30 -280 22 -252 Z', c) : '');
const helmBase = (c, rim) => P('M-54 -184 Q-58 -256 0 -260 Q58 -256 54 -184 Z', c)
  + P('M-58 -196 L58 -196 L58 -180 L-58 -180 Z', rim)
  + P('M-6 -196 L6 -196 L6 -160 L-6 -160 Z', rim)
  + PN('M-34 -248 Q-20 -254 -8 -252', 'none', 'stroke="#ffffff" stroke-opacity="0.45" stroke-width="7" stroke-linecap="round"');
const horns = (c) => P('M-50 -222 Q-96 -226 -100 -288 Q-74 -252 -44 -242 Z', c) + P('M50 -222 Q96 -226 100 -288 Q74 -252 44 -242 Z', c);
const wingPair = (c, y = -226) => [-1, 1].map((s) => P(`M${48 * s} ${y} Q${96 * s} ${y - 40} ${110 * s} ${y - 74} Q${84 * s} ${y - 54} ${72 * s} ${y - 60} Q${76 * s} ${y - 40} ${60 * s} ${y - 38} Q${62 * s} ${y - 22} ${48 * s} ${y - 14} Z`, c)).join('');
const crownShape = (c, gems, tall = 1) => {
  const h = 24 * tall;
  return P(`M-48 -218 L48 -218 L48 ${-240 - h * 0.2} L32 ${-244 - h} L16 ${-238} L0 ${-250 - h} L-16 -238 L-32 ${-244 - h} L-48 ${-240 - h * 0.2} Z`, c)
    + gems.map((gc, i) => EN(-28 + i * 28, -230, 7, 7, gc, 'stroke="#16122b" stroke-width="3"')).join('');
};

const HEAD_ART = {
  'traveler-hood': () => hood('#7a5a3a', '#5c4128'),
  'iron-helm': () => helmBase('#9aa3ad', '#6c747d'),
  circlet: () => P('M-48 -222 Q0 -236 48 -222 L48 -212 Q0 -226 -48 -212 Z', '#d7dde6') + EN(0, -226, 8, 9, '#7ad7ff', 'stroke="#16122b" stroke-width="3"'),
  'thief-hood': () => hood('#3a3f4a', '#2a2e36', true),
  'feather-cap': () => P('M-56 -210 Q-46 -262 6 -262 Q60 -258 58 -210 Q0 -226 -56 -210 Z', '#2f6b4f')
    + P('M30 -250 Q90 -300 118 -330 Q96 -280 44 -236 Z', '#d33b3b') + PN('M40 -246 Q86 -286 112 -322', 'none', 'stroke="#ffd2d2" stroke-width="3"'),
  'treasure-hat': () => EN(0, -214, 86, 18, '#6b4a2a', 'stroke="#16122b" stroke-width="5"') + P('M-48 -216 Q-50 -268 0 -270 Q50 -268 48 -216 Z', '#7d5632')
    + P('M-48 -228 L48 -228 L48 -216 L-48 -216 Z', '#2a1a10') + EN(30, -222, 7, 7, '#e7b94a', 'stroke="#16122b" stroke-width="3"'),
  'leaf-hood': () => hood('#3f7a3a', '#2f5b2a') + [[-50, -228, -30], [-20, -258, 10], [30, -252, 30], [56, -210, 60], [-60, -180, -60]]
    .map(([x, y, a]) => EN(x, y, 14, 7, '#7fc66a', `stroke="#16122b" stroke-width="3" transform="rotate(${a} ${x} ${y})"`)).join(''),
  'horned-helm': () => horns('#efe6cf') + helmBase('#8a8f96', '#5c6168'),
  crown: () => crownShape('#e7b94a', ['#d33b3b', '#2f80ed', '#39e75f']),
  'dragon-helm': () => P('M-20 -258 L-10 -286 L0 -260 L10 -290 L20 -258 L30 -280 L38 -250 Z', '#e7b94a') + helmBase('#2f7a4a', '#1f5a34')
    + [-30, -10, 10, 30].map((x) => EN(x, -232, 8, 5, '#3f9a5f')).join('') + horns('#1f5a34'),
  'shadow-mask': () => hood('#1c1e26', '#111318') + P('M-50 -208 L50 -208 L50 -182 Q0 -172 -50 -182 Z', '#111318')
    + EN(-20, -194, 9, 6, '#d6fff0') + EN(20, -194, 9, 6, '#d6fff0'),
  'bone-helm': () => P('M-56 -186 Q-60 -264 0 -268 Q60 -264 56 -186 Q40 -200 28 -196 L0 -204 L-28 -196 Q-40 -200 -56 -186 Z', '#efe6cf')
    + EN(-20, -236, 12, 14, '#16122b') + EN(20, -236, 12, 14, '#16122b') + horns('#cfc4a8'),
  antlers: () => [-1, 1].map((s) => `<path d="M${18 * s} -228 Q${40 * s} -270 ${36 * s} -310 M${30 * s} -262 Q${60 * s} -272 ${72 * s} -298 M${36 * s} -290 Q${50 * s} -300 ${54 * s} -320 M${54 * s} -276 Q${80 * s} -270 ${96 * s} -284" fill="none" stroke="#6b4a2a" stroke-width="10" stroke-linecap="round"/>`).join('')
    + P('M-46 -222 Q0 -236 46 -222 L46 -212 Q0 -226 -46 -212 Z', '#3f7a3a'),
  'royal-crown': () => crownShape('#f2d16b', ['#d33b3b', '#7ad7ff', '#b86bff'], 1.6) + EN(0, -276, 9, 9, '#ffffff', 'stroke="#16122b" stroke-width="3"'),
  'star-hat': () => EN(0, -220, 84, 18, '#2340c8', 'stroke="#16122b" stroke-width="5"') + P('M-46 -226 Q-14 -300 34 -356 Q22 -290 48 -226 Z', '#2b4fd8')
    + star(-6, -262, 13, '#ffe066') + star(18, -298, 9, '#ffe066') + star(-24, -238, 7, '#ffe066'),
  'winged-helm': () => wingPair('#f4f1ea') + helmBase('#d7dde6', '#e7b94a'),
  'champion-helm': () => P('M-6 -258 Q-10 -310 40 -326 Q20 -300 26 -260 Q48 -296 80 -300 Q48 -280 18 -252 Z', '#d33b3b') + helmBase('#b4bcc6', '#7f8790'),
  'wolf-pelt': () => P('M-68 -146 Q-80 -256 0 -270 Q80 -256 68 -146 Q56 -170 50 -200 Q34 -236 0 -238 Q-34 -236 -50 -200 Q-56 -170 -68 -146 Z', '#8f9298')
    + P('M-56 -244 L-46 -298 L-22 -258 Z', '#8f9298') + P('M56 -244 L46 -298 L22 -258 Z', '#8f9298')
    + P('M-26 -262 Q0 -286 26 -262 Q14 -248 0 -250 Q-14 -248 -26 -262 Z', '#b9bcc2') + EN(0, -272, 8, 6, '#16122b'),
  'masked-hood': () => hood('#24242a', '#16161c', true) + P('M-50 -170 Q0 -160 50 -170 L50 -146 Q0 -136 -50 -146 Z', '#24242a'),
};

const capePath = 'M-42 -150 L42 -150 Q76 -80 70 -6 Q0 10 -70 -6 Q-76 -80 -42 -150 Z';
const cape = (c, extra = '') => P(capePath, c) + extra;
const wings = (c, vein, bat = false) => [-1, 1].map((s) => (bat
  ? P(`M${20 * s} -130 Q${90 * s} -200 ${150 * s} -170 Q${130 * s} -140 ${140 * s} -100 Q${110 * s} -112 ${100 * s} -80 Q${80 * s} -100 ${60 * s} -76 Q${50 * s} -100 ${20 * s} -96 Z`, c)
  : P(`M${20 * s} -130 Q${80 * s} -220 ${150 * s} -210 Q${140 * s} -170 ${130 * s} -140 Q${120 * s} -150 ${118 * s} -118 Q${104 * s} -128 ${100 * s} -96 Q${84 * s} -108 ${76 * s} -80 Q${50 * s} -100 ${20 * s} -96 Z`, c)
    + `<path d="M${40 * s} -126 Q${90 * s} -176 ${130 * s} -190" fill="none" stroke="${vein}" stroke-width="4"/>`)).join('');

const CLOAK_ART = {
  'adventurer-cloak': () => cape('#3f7a3a'),
  'red-cape': () => cape('#b3122e'),
  'tattered-cloak': () => P('M-42 -150 L42 -150 Q76 -80 70 -6 L54 -20 L44 4 L28 -14 L14 8 L0 -12 L-16 6 L-30 -14 L-46 2 L-56 -18 L-70 -6 Q-76 -80 -42 -150 Z', '#8a7a62'),
  'merchant-mantle': () => cape('#7d5632', P('M-70 -12 Q0 4 70 -12 L70 -2 Q0 14 -70 -2 Z', '#e7b94a')),
  'frost-cloak': () => cape('#7ab8e0', [[-56, -60], [52, -90], [-48, -110], [58, -30]].map(([x, y]) => star(x, y, 8, '#ffffff')).join('')),
  'starry-cloak': () => cape('#1f2a6a', [[-56, -60], [52, -96], [-46, -118], [60, -30], [-62, -24], [40, -50]].map(([x, y], i) => star(x, y, 5 + (i % 3) * 2, '#ffe066')).join('')),
  'royal-cape': () => cape('#6b2fa0', P('M-44 -152 L44 -152 L48 -136 L-48 -136 Z', '#f4f1ea') + [-30, -10, 10, 30].map((x) => EN(x, -144, 3, 4, '#16122b')).join('')),
  'flame-cape': () => cape('#d33b3b', PN('M-66 -12 Q-58 -46 -46 -20 Q-38 -60 -24 -16 Q-12 -54 0 -14 Q12 -54 24 -16 Q38 -60 46 -20 Q58 -46 66 -12 Q0 6 -66 -12 Z', '#ff8a2a')),
  'bat-wings': () => wings('#2a1f33', '#5a4a66', true),
  'angel-wings': () => wings('#f4f1ea', '#d7dde6'),
  'dragon-wings': () => wings('#b3122e', '#ff8a2a', true),
  'night-cloak': () => cape('#1c2a22', P('M-30 -150 Q-50 -80 -48 -10 L-36 -8 Q-40 -80 -22 -150 Z', '#3a5a40')),
};

const AURA = {
  sparkle: { glow: '#ffe066', p: 'star', colors: ['#ffe066', '#ffffff'] },
  'leaf-aura': { glow: '#7fc66a', p: 'leaf', colors: ['#7fc66a', '#3f7a3a', '#e7b94a'] },
  'frost-aura': { glow: '#9ed3ff', p: 'flake', colors: ['#ffffff', '#9ed3ff'] },
  'shadow-aura': { glow: '#4a2f66', p: 'dot', colors: ['#2a1f33', '#5a3a7a'] },
  'golden-aura': { glow: '#e7b94a', p: 'dot', colors: ['#ffe066', '#e7b94a'] },
  'storm-aura': { glow: '#7ad7ff', p: 'bolt', colors: ['#7ad7ff', '#ffffff'] },
  'flame-aura': { glow: '#ff6a13', p: 'flame', colors: ['#ff8a2a', '#ffe066', '#d33b3b'] },
  'ghost-aura': { glow: '#9be15d', p: 'wisp', colors: ['#c9ffb0', '#9be15d'] },
  'rainbow-aura': { glow: '#b86bff', p: 'star', colors: ['#ff5a4f', '#ff8a2a', '#ffe066', '#39e75f', '#2f80ed', '#b86bff'] },
  halo: { glow: '#ffe066', p: 'dot', colors: ['#fff6c8'], halo: true },
};

const particle = (kind, x, y, c) => {
  switch (kind) {
    case 'star': return star(x, y, 9, c);
    case 'leaf': return EN(x, y, 10, 5, c, `transform="rotate(${x} ${x} ${y})"`);
    case 'flake': return `<path d="M${x - 9} ${y}h18M${x} ${y - 9}v18M${x - 6} ${y - 6}l12 12M${x + 6} ${y - 6}l-12 12" stroke="${c}" stroke-width="3"/>`;
    case 'bolt': return PN(`M${x} ${y - 14} L${x - 6} ${y} L${x + 2} ${y} L${x - 4} ${y + 14} L${x + 8} ${y - 4} L${x} ${y - 4} Z`, c);
    case 'flame': return PN(`M${x} ${y - 16} Q${x + 10} ${y - 2} ${x + 6} ${y + 6} Q${x} ${y + 12} ${x - 6} ${y + 6} Q${x - 10} ${y - 2} ${x} ${y - 16} Z`, c);
    case 'wisp': return EN(x, y, 7, 11, c, 'opacity="0.8"');
    default: return EN(x, y, 7, 7, c);
  }
};

const SPOTS = [[-70, -40], [64, -90], [-56, -150], [72, -180], [-30, -230], [40, -30], [-80, -110], [20, -250]];

/** The glow under the hero's feet (drawn first). */
const auraBack = (id) => {
  const a = AURA[id];
  if (!a) return '';
  return `<g class="dq-aura">${EN(0, -4, 104, 34, a.glow, 'opacity="0.45" class="dq-aura-glow"')}${EN(0, -4, 70, 22, a.glow, 'opacity="0.35"')}</g>`;
};

/** Rising bits around the hero (drawn last). */
const auraFront = (id) => {
  const a = AURA[id];
  if (!a) return '';
  const bits = SPOTS.map(([x, y], i) => `<g class="dq-aura-p" style="animation-delay:${(-i * 0.37).toFixed(2)}s">${particle(a.p, x, y, a.colors[i % a.colors.length])}</g>`).join('');
  const halo = a.halo ? `<ellipse cx="0" cy="-276" rx="44" ry="11" fill="none" stroke="#ffe066" stroke-width="9" class="dq-aura-glow"/>` : '';
  return halo + bits;
};

// Pets stand (or hover) to the hero's right, in the same units.
const PET_ART = {
  cat: () => P('M70 -6 Q60 -50 96 -54 Q132 -50 122 -6 Z', '#f08a3a') + PN('M120 -20 Q152 -30 146 -70', 'none', 'stroke="#f08a3a" stroke-width="9" stroke-linecap="round"')
    + E(96, -70, 24, 22, '#f08a3a') + P('M76 -82 L80 -104 L94 -88 Z M116 -82 L112 -104 L98 -88 Z', '#f08a3a') + EN(88, -72, 3, 5, '#16122b') + EN(104, -72, 3, 5, '#16122b'),
  frog: () => E(100, -24, 34, 22, '#4f9a3a') + E(84, -46, 11, 11, '#4f9a3a') + E(116, -46, 11, 11, '#4f9a3a')
    + EN(84, -47, 5, 6, '#16122b') + EN(116, -47, 5, 6, '#16122b') + PN('M88 -22 Q100 -14 112 -22', 'none', 'stroke="#16122b" stroke-width="3"'),
  owl: () => E(100, -40, 28, 38, '#8b5a2b') + E(100, -26, 18, 22, '#c9a86a') + E(88, -58, 11, 11, '#ffffff') + E(112, -58, 11, 11, '#ffffff')
    + EN(88, -58, 5, 5, '#16122b') + EN(112, -58, 5, 5, '#16122b') + P('M96 -48 L104 -48 L100 -40 Z', '#e7b94a') + P('M76 -72 L82 -88 L90 -74 Z M124 -72 L118 -88 L110 -74 Z', '#8b5a2b'),
  raven: () => `<g class="dq-hover">${E(100, -150, 26, 18, '#1c1e26')}${E(124, -164, 13, 12, '#1c1e26')}${P('M134 -166 L152 -160 L134 -156 Z', '#e7b94a')}${P('M84 -152 Q70 -186 104 -168 Z', '#2a2e36')}${EN(126, -166, 3, 3, '#ffffff')}</g>`,
  fairy: () => `<g class="dq-hover">${EN(104, -170, 30, 30, '#ff8bd0', 'opacity="0.3"')}${EN(88, -182, 14, 8, '#e8f7ff', 'opacity="0.85" stroke="#9ed3ff" stroke-width="2"')}${EN(120, -182, 14, 8, '#e8f7ff', 'opacity="0.85" stroke="#9ed3ff" stroke-width="2"')}${E(104, -170, 9, 12, '#ffd2ec')}</g>`,
  mimic: () => P('M70 -6 L70 -52 L130 -52 L130 -6 Z', '#8b5a2b') + P('M66 -52 Q100 -86 134 -52 Z', '#6b4a2a')
    + PN('M72 -52 L80 -40 L88 -52 L96 -40 L104 -52 L112 -40 L120 -52 L128 -40 L130 -52', '#ffffff') + P('M94 -40 Q104 -16 112 -40 Z', '#ff5fa2') + E(100, -30, 6, 6, '#e7b94a'),
  'skull-wisp': () => `<g class="dq-hover">${PN('M86 -168 Q100 -220 114 -168 Z', '#9be15d', 'opacity="0.7"')}${E(100, -160, 22, 20, '#efe6cf')}${EN(92, -162, 6, 7, '#16122b')}${EN(108, -162, 6, 7, '#16122b')}${P('M92 -142 L108 -142 L108 -134 L92 -134 Z', '#efe6cf')}</g>`,
  slime: () => P('M66 -4 Q64 -70 100 -72 Q136 -70 134 -4 Z', '#39c78f', 'opacity="0.9"') + EN(84, -50, 8, 12, '#ffffff', 'opacity="0.5"')
    + EN(90, -38, 5, 7, '#16122b') + EN(112, -38, 5, 7, '#16122b'),
  whelp: () => wingsSmall() + E(100, -30, 30, 22, '#c0392b') + P('M126 -24 Q160 -20 168 -46 Q150 -30 128 -36 Z', '#c0392b')
    + E(84, -60, 18, 16, '#c0392b') + P('M74 -72 L70 -90 L82 -76 Z M92 -74 L94 -92 L100 -74 Z', '#e7b94a') + EN(80, -62, 3, 4, '#ffe066'),
  'wolf-pup': () => E(102, -30, 32, 22, '#9aa0a8') + P('M130 -36 Q156 -50 152 -72 Q142 -50 128 -46 Z', '#9aa0a8') + E(76, -52, 20, 18, '#9aa0a8')
    + P('M60 -54 L52 -58 L62 -44 Z', '#16122b') + P('M68 -66 L66 -86 L80 -70 Z M84 -68 L90 -86 L92 -64 Z', '#9aa0a8') + EN(72, -56, 3, 4, '#16122b'),
  songbird: () => `<g class="dq-hover">${E(100, -168, 18, 14, '#ffd23f')}${E(114, -178, 10, 10, '#ffd23f')}${P('M122 -180 L134 -176 L122 -172 Z', '#ff8a2a')}${P('M90 -172 Q80 -196 104 -180 Z', '#f5b84a')}${PN('M128 -196 q6 -8 12 0 q-6 8 -12 0', '#2f80ed')}</g>`,
};
const wingsSmall = () => P('M90 -44 Q76 -90 112 -78 Q104 -60 108 -46 Z', '#8e1d2c');

/**
 * A hero with their gear, as SVG markup in the cartoon's units. wear: { head, cloak, aura, pet }.
 * opts.pose is the cartoon pose; opts.plain leaves out the aura and pet (for a hero who is down).
 */
export const heroMarkup = (lookCode, wear = {}, pose = { kind: 'stand' }, opts = {}) => {
  const look = parseLook(lookCode);
  const w = wear || {};
  if (HEAD_ART[w.head]) {
    look.hat = 0;
    if ([3, 4, 10, 11].includes(look.hair)) look.hair = 1;
    if (look.costume === 3 || look.costume === 5) look.costume = 0;
  }
  const back = (!opts.plain ? auraBack(w.aura) : '') + (CLOAK_ART[w.cloak] ? CLOAK_ART[w.cloak]() : '');
  const clasp = CLOAK_ART[w.cloak] && !/wings/.test(w.cloak) ? E(0, -142, 9, 9, '#e7b94a') : '';
  const front = (HEAD_ART[w.head] ? HEAD_ART[w.head]() : '') + clasp
    + (!opts.plain && PET_ART[w.pet] ? PET_ART[w.pet]() : '') + (!opts.plain ? auraFront(w.aura) : '');
  return back + personMarkup(look, pose) + front;
};

/** Just one piece, for the phone's gear list. */
export const pieceMarkup = (item) => {
  if (!item) return '';
  if (item.slot === 'head') return EN(0, -186, 44, 44, '#ffffff', 'opacity="0.12"') + HEAD_ART[item.id]();
  if (item.slot === 'cloak') return CLOAK_ART[item.id]();
  if (item.slot === 'aura') return auraBack(item.id) + auraFront(item.id);
  if (item.slot === 'pet') return `<g transform="translate(-100 0)">${PET_ART[item.id]()}</g>`;
  return '';
};

/** The viewBox that frames a piece. */
export const pieceBox = (item) => {
  if (!item) return '0 0 1 1';
  if (item.slot === 'head') return '-105 -330 210 200';
  if (item.slot === 'cloak') return /wings/.test(item.id) ? '-160 -230 320 250' : '-95 -165 190 185';
  if (item.slot === 'pet') return '-80 -230 160 240';
  return '-120 -300 240 330';
};
