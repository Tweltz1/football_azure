// A light version of fifth edition rules: ability scores, classes, races, levels, dice and monsters.
// Enough to run a table on a TV without a rulebook, while the AI narrator and the human co-DM fill the gaps.

export const FEET_PER_SQUARE = 5;
export const STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const STAT_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
export const mod = (score) => Math.floor((Number(score || 10) - 10) / 2);
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// XP needed to reach each level (index = level).
export const XP_FOR_LEVEL = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000];
export const MAX_LEVEL = 10;
export const levelForXp = (xp) => {
  let level = 1;
  while (level < MAX_LEVEL && xp >= XP_FOR_LEVEL[level + 1]) level += 1;
  return level;
};
export const proficiency = (level) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

export const SKILLS = {
  Athletics: 'str', Acrobatics: 'dex', Stealth: 'dex', 'Sleight of Hand': 'dex', Arcana: 'int', History: 'int',
  Investigation: 'int', Religion: 'int', Nature: 'int', Perception: 'wis', Insight: 'wis', Survival: 'wis',
  Medicine: 'wis', 'Animal Handling': 'wis', Persuasion: 'cha', Deception: 'cha', Intimidation: 'cha', Performance: 'cha',
};

// ---- Dice -------------------------------------------------------------------------------------------

/** Rolls "2d6+3" (also "d20", "1d4-1", "3d4+3"). Returns { total, rolls, mod, text }. */
export const roll = (expr, rand = Math.random) => {
  const m = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(String(expr || ''));
  if (!m) {
    const flat = parseInt(expr, 10) || 0;
    return { total: flat, rolls: [], mod: flat, text: String(flat) };
  }
  const count = Math.min(20, parseInt(m[1] || '1', 10));
  const sides = Math.max(2, parseInt(m[2], 10));
  const bonus = m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0;
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(rand() * sides));
  const total = rolls.reduce((a, b) => a + b, 0) + bonus;
  return { total: Math.max(0, total), rolls, mod: bonus, text: `${count}d${sides}${bonus ? signed(bonus) : ''}` };
};

/** Doubles the dice (not the bonus) for a critical hit. */
export const critDice = (expr) => String(expr).replace(/^(\d*)d/, (all, n) => `${(parseInt(n || '1', 10)) * 2}d`);

/** A d20 test. adv: 1 advantage, -1 disadvantage. Returns { d20, other, total, nat20, nat1 }. */
export const d20 = (bonus = 0, adv = 0, rand = Math.random) => {
  const a = 1 + Math.floor(rand() * 20);
  const b = 1 + Math.floor(rand() * 20);
  const pick = adv > 0 ? Math.max(a, b) : adv < 0 ? Math.min(a, b) : a;
  return { d20: pick, other: adv ? (pick === a ? b : a) : null, total: pick + bonus, nat20: pick === 20, nat1: pick === 1, bonus };
};

// ---- Races and classes ----------------------------------------------------------------------------------

export const RACES = {
  human: { name: 'Human', speed: 30, bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, perk: 'Versatile: +1 to every ability.' },
  elf: { name: 'Elf', speed: 30, bonus: { dex: 2, wis: 1 }, perk: 'Keen senses and darkvision. Advantage on Perception.', darkvision: true },
  dwarf: { name: 'Dwarf', speed: 25, bonus: { con: 2, str: 1 }, perk: 'Tough as stone: +1 HP per level. Darkvision.', darkvision: true, hpPerLevel: 1 },
  halfling: { name: 'Halfling', speed: 25, bonus: { dex: 2, cha: 1 }, perk: 'Lucky: reroll a natural 1 once per scene.' },
  orc: { name: 'Half-Orc', speed: 30, bonus: { str: 2, con: 1 }, perk: 'Relentless: drop to 1 HP instead of 0, once per session. Darkvision.', darkvision: true },
  tiefling: { name: 'Tiefling', speed: 30, bonus: { cha: 2, int: 1 }, perk: 'Infernal blood: resists fire. Darkvision.', darkvision: true },
  dragonborn: { name: 'Dragonborn', speed: 30, bonus: { str: 2, cha: 1 }, perk: 'Breath weapon: 2d6 in a cone, once per scene.' },
  gnome: { name: 'Gnome', speed: 25, bonus: { int: 2, dex: 1 }, perk: 'Gnome cunning: advantage against magic. Darkvision.', darkvision: true },
};

// Actions: kind attack (roll vs AC), save (target rolls), auto (always hits), heal, self.
// range in squares (1 = touching). uses: per session (null = unlimited). bonus: uses the bonus action.
const A = (id, name, extra) => ({ id, name, range: 1, kind: 'attack', uses: null, bonus: false, ...extra });

export const CLASSES = {
  fighter: {
    name: 'Fighter', hitDie: 10, ac: 16, primary: ['str', 'con', 'dex', 'wis', 'cha', 'int'], save: 'str',
    blurb: 'Armor, a big sword and staying power.',
    look: { hat: 8, top: 16, topColor: 11 },
    actions: [
      A('longsword', 'Longsword', { dice: '1d8', stat: 'str' }),
      A('handaxe', 'Thrown Handaxe', { dice: '1d6', stat: 'str', range: 4 }),
      A('second-wind', 'Second Wind', { kind: 'heal', self: true, dice: '1d10', addLevel: true, uses: 1, bonus: true }),
    ],
  },
  barbarian: {
    name: 'Barbarian', hitDie: 12, ac: 14, primary: ['str', 'con', 'dex', 'wis', 'cha', 'int'], save: 'con',
    blurb: 'Rage, hit hard, shrug off damage.',
    look: { hat: 8, top: 3, topColor: 7 },
    actions: [
      A('greataxe', 'Greataxe', { dice: '1d12', stat: 'str' }),
      A('rage', 'Rage', { kind: 'self', effect: 'rage', uses: 2, bonus: true }),
    ],
  },
  rogue: {
    name: 'Rogue', hitDie: 8, ac: 14, primary: ['dex', 'con', 'int', 'wis', 'cha', 'str'], save: 'dex',
    blurb: 'Sneak attacks, locks, traps and quick getaways.',
    look: { hat: 23, top: 1, topColor: 5 },
    actions: [
      A('dagger', 'Dagger', { dice: '1d4', stat: 'dex', sneak: true }),
      A('shortbow', 'Shortbow', { dice: '1d6', stat: 'dex', range: 16, sneak: true }),
      A('cunning', 'Cunning Action: Dash', { kind: 'self', effect: 'dash', bonus: true }),
    ],
  },
  ranger: {
    name: 'Ranger', hitDie: 10, ac: 14, primary: ['dex', 'wis', 'con', 'str', 'int', 'cha'], save: 'dex',
    blurb: 'Longbow, tracking and the wild.',
    look: { hat: 17, top: 10, topColor: 9 },
    actions: [
      A('longbow', 'Longbow', { dice: '1d8', stat: 'dex', range: 24 }),
      A('shortsword', 'Shortsword', { dice: '1d6', stat: 'dex' }),
      A('hunters-mark', "Hunter's Mark", { kind: 'self', effect: 'mark', uses: 2, bonus: true }),
    ],
  },
  wizard: {
    name: 'Wizard', hitDie: 6, ac: 12, primary: ['int', 'con', 'dex', 'wis', 'cha', 'str'], save: 'int',
    blurb: 'Fire bolts, magic missiles and big ideas.',
    look: { hat: 15, top: 17, topColor: 21 },
    actions: [
      A('fire-bolt', 'Fire Bolt', { dice: '1d10', stat: 'int', range: 24, spell: true }),
      A('magic-missile', 'Magic Missile', { kind: 'auto', dice: '3d4+3', range: 24, uses: 3, spell: true }),
      A('burning-hands', 'Burning Hands', { kind: 'save', save: 'dex', dice: '3d6', range: 3, area: 1, uses: 2, spell: true }),
    ],
  },
  cleric: {
    name: 'Cleric', hitDie: 8, ac: 16, primary: ['wis', 'con', 'str', 'cha', 'int', 'dex'], save: 'wis',
    blurb: 'Heals the party and smites the undead.',
    look: { hat: 12, top: 7, topColor: 6 },
    actions: [
      A('mace', 'Mace', { dice: '1d6', stat: 'str' }),
      A('sacred-flame', 'Sacred Flame', { kind: 'save', save: 'dex', dice: '1d8', range: 12, spell: true }),
      A('healing-word', 'Healing Word', { kind: 'heal', dice: '1d4', stat: 'wis', range: 12, uses: 3, bonus: true, spell: true }),
    ],
  },
  bard: {
    name: 'Bard', hitDie: 8, ac: 13, primary: ['cha', 'dex', 'con', 'wis', 'int', 'str'], save: 'cha',
    blurb: 'Songs, jokes and inspiration. Also insults that hurt.',
    look: { hat: 18, top: 5, topColor: 14 },
    actions: [
      A('rapier', 'Rapier', { dice: '1d8', stat: 'dex' }),
      A('vicious-mockery', 'Vicious Mockery', { kind: 'save', save: 'wis', dice: '1d4', range: 12, spell: true }),
      A('healing-word', 'Healing Word', { kind: 'heal', dice: '1d4', stat: 'cha', range: 12, uses: 2, bonus: true, spell: true }),
      A('inspire', 'Bardic Inspiration', { kind: 'self', effect: 'inspire', uses: 3, bonus: true, range: 12, ally: true }),
    ],
  },
  paladin: {
    name: 'Paladin', hitDie: 10, ac: 18, primary: ['str', 'cha', 'con', 'wis', 'dex', 'int'], save: 'wis',
    blurb: 'Heavy armor, holy smites and an oath to keep.',
    look: { hat: 6, top: 15, topColor: 27 },
    actions: [
      A('warhammer', 'Warhammer', { dice: '1d8', stat: 'str' }),
      A('smite', 'Divine Smite', { dice: '3d8', stat: 'str', uses: 2 }),
      A('lay-on-hands', 'Lay on Hands', { kind: 'heal', dice: '5', perLevel: 5, range: 1, uses: 1 }),
    ],
  },
};

export const CLASS_IDS = Object.keys(CLASSES);
export const RACE_IDS = Object.keys(RACES);

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** Ability scores from the standard array, best scores where the class wants them, plus race bonuses. */
export const baseStats = (classId, raceId) => {
  const cls = CLASSES[classId] || CLASSES.fighter;
  const race = RACES[raceId] || RACES.human;
  const out = {};
  cls.primary.forEach((stat, i) => { out[stat] = STANDARD_ARRAY[i] + (race.bonus[stat] || 0); });
  return out;
};

export const maxHpFor = (classId, raceId, level, stats) => {
  const cls = CLASSES[classId] || CLASSES.fighter;
  const race = RACES[raceId] || RACES.human;
  const con = mod(stats.con);
  const avg = Math.floor(cls.hitDie / 2) + 1;
  return Math.max(1, cls.hitDie + con + (level - 1) * (avg + con) + level * (race.hpPerLevel || 0));
};

/** A fresh level-1 character sheet. */
export const newCharacter = ({ name, classId = 'fighter', raceId = 'human', look = null, id = null }) => {
  const stats = baseStats(classId, raceId);
  const hp = maxHpFor(classId, raceId, 1, stats);
  return {
    id,
    name: String(name || 'Adventurer').slice(0, 24),
    classId: CLASSES[classId] ? classId : 'fighter',
    raceId: RACES[raceId] ? raceId : 'human',
    level: 1,
    xp: 0,
    stats,
    hp,
    maxHp: hp,
    gold: 10,
    inventory: ['Backpack', 'Rations (5)', 'Torch'],
    look,
    notes: '',
    history: [],
  };
};

/** Fills in anything a saved sheet is missing and keeps every number in range. */
export const normalizeCharacter = (sheet) => {
  const base = newCharacter({ name: sheet?.name, classId: sheet?.classId, raceId: sheet?.raceId, look: sheet?.look, id: sheet?.id || null });
  const xp = Math.max(0, Math.floor(Number(sheet?.xp) || 0));
  const level = levelForXp(xp);
  const stats = { ...base.stats };
  STATS.forEach((s) => { if (Number.isFinite(sheet?.stats?.[s])) stats[s] = Math.min(20, Math.max(3, Math.floor(sheet.stats[s]))); });
  const maxHp = maxHpFor(base.classId, base.raceId, level, stats);
  const hp = Number.isFinite(sheet?.hp) ? Math.min(maxHp, Math.max(0, Math.floor(sheet.hp))) : maxHp;
  return {
    ...base,
    xp,
    level,
    stats,
    maxHp,
    hp,
    gold: Math.max(0, Math.floor(Number(sheet?.gold) || 0)),
    inventory: Array.isArray(sheet?.inventory) ? sheet.inventory.map((s) => String(s).slice(0, 40)).slice(0, 40) : base.inventory,
    notes: String(sheet?.notes || '').slice(0, 2000),
    history: Array.isArray(sheet?.history) ? sheet.history.slice(-50) : [],
    campaignId: sheet?.campaignId || null,
  };
};

export const speedOf = (sheet) => (RACES[sheet.raceId] || RACES.human).speed;
export const acOf = (sheet) => (CLASSES[sheet.classId] || CLASSES.fighter).ac + (sheet.classId === 'barbarian' ? Math.max(0, mod(sheet.stats.con)) : 0)
  + (['rogue', 'ranger', 'bard'].includes(sheet.classId) ? Math.min(2, Math.max(0, mod(sheet.stats.dex) - 1)) : 0);
export const actionsOf = (sheet) => (CLASSES[sheet.classId] || CLASSES.fighter).actions;
export const describe = (sheet) => `${(RACES[sheet.raceId] || RACES.human).name} ${(CLASSES[sheet.classId] || CLASSES.fighter).name} ${sheet.level}`;

/** The attack bonus and damage bonus for an action. */
export const actionNumbers = (sheet, action) => {
  const level = sheet.level || 1;
  const statMod = action.stat ? mod(sheet.stats[action.stat]) : 0;
  const finesse = action.stat === 'dex' || action.stat === 'str' ? Math.max(mod(sheet.stats.str), mod(sheet.stats.dex)) : statMod;
  const useMod = ['dagger', 'rapier', 'shortsword'].includes(action.id) ? finesse : statMod;
  const castMod = mod(sheet.stats[(CLASSES[sheet.classId] || CLASSES.fighter).primary[0]]);
  const toHit = proficiency(level) + (action.spell ? castMod : useMod);
  const saveDc = 8 + proficiency(level) + castMod;
  const dmgBonus = action.spell ? (action.kind === 'heal' ? castMod : 0) : useMod;
  return { toHit, saveDc, dmgBonus };
};

// ---- Monsters ----------------------------------------------------------------------------------------------

// glyph: the emoji shown on the token; color: base color for the figure.
const M = (id, name, glyph, color, s) => ({ id, name, glyph, color, speed: 30, range: 1, ...s });

export const MONSTERS = {
  rat: M('rat', 'Giant Rat', '🐀', '#7b6a5a', { hp: 7, ac: 12, toHit: 4, dice: '1d4+2', xp: 25, cr: 0.125 }),
  goblin: M('goblin', 'Goblin', '👺', '#5f8f3a', { hp: 7, ac: 15, toHit: 4, dice: '1d6+2', xp: 50, cr: 0.25 }),
  goblinArcher: M('goblinArcher', 'Goblin Archer', '🏹', '#6f9f4a', { hp: 7, ac: 13, toHit: 4, dice: '1d6+2', range: 16, xp: 50, cr: 0.25 }),
  kobold: M('kobold', 'Kobold', '🦎', '#b2552f', { hp: 5, ac: 12, toHit: 4, dice: '1d4+2', xp: 25, cr: 0.125 }),
  wolf: M('wolf', 'Wolf', '🐺', '#8a8f99', { hp: 11, ac: 13, toHit: 4, dice: '2d4+2', speed: 40, xp: 50, cr: 0.25 }),
  bandit: M('bandit', 'Bandit', '🗡️', '#8b5a2b', { hp: 11, ac: 12, toHit: 3, dice: '1d6+1', xp: 25, cr: 0.125 }),
  banditCaptain: M('banditCaptain', 'Bandit Captain', '🏴‍☠️', '#6b1f2e', { hp: 45, ac: 15, toHit: 5, dice: '2d6+3', xp: 450, cr: 2, boss: true }),
  skeleton: M('skeleton', 'Skeleton', '💀', '#e8e2cf', { hp: 13, ac: 13, toHit: 4, dice: '1d6+2', xp: 50, cr: 0.25 }),
  zombie: M('zombie', 'Zombie', '🧟', '#7a9a5a', { hp: 22, ac: 8, toHit: 3, dice: '1d6+1', speed: 20, xp: 50, cr: 0.25 }),
  ghoul: M('ghoul', 'Ghoul', '👹', '#9aa38f', { hp: 22, ac: 12, toHit: 4, dice: '2d6+2', xp: 200, cr: 1 }),
  wight: M('wight', 'Wight', '👻', '#4c5b78', { hp: 45, ac: 14, toHit: 4, dice: '2d8+2', xp: 700, cr: 3, boss: true }),
  spider: M('spider', 'Giant Spider', '🕷️', '#2b2233', { hp: 26, ac: 14, toHit: 5, dice: '1d8+3', xp: 200, cr: 1 }),
  orc: M('orc', 'Orc', '👊', '#4f7a3a', { hp: 15, ac: 13, toHit: 5, dice: '1d12+3', xp: 100, cr: 0.5 }),
  bugbear: M('bugbear', 'Bugbear', '🐻', '#8b5a2b', { hp: 27, ac: 16, toHit: 4, dice: '2d8+2', xp: 200, cr: 1 }),
  ogre: M('ogre', 'Ogre', '👹', '#a0794b', { hp: 59, ac: 11, toHit: 6, dice: '2d8+4', speed: 40, xp: 450, cr: 2, boss: true }),
  cultist: M('cultist', 'Cultist', '🕯️', '#5b2d8e', { hp: 9, ac: 12, toHit: 3, dice: '1d6+1', xp: 25, cr: 0.125 }),
  cultFanatic: M('cultFanatic', 'Cult Fanatic', '🔮', '#3a1f5c', { hp: 33, ac: 13, toHit: 4, dice: '2d8', range: 12, xp: 450, cr: 2, boss: true }),
  armor: M('armor', 'Animated Armor', '🛡️', '#9a9ca3', { hp: 33, ac: 18, toHit: 4, dice: '1d6+2', speed: 25, xp: 200, cr: 1 }),
  lizardfolk: M('lizardfolk', 'Lizardfolk', '🐊', '#3a6b3f', { hp: 22, ac: 15, toHit: 4, dice: '1d6+2', xp: 100, cr: 0.5 }),
  bullywug: M('bullywug', 'Bullywug', '🐸', '#5f8f3a', { hp: 11, ac: 15, toHit: 3, dice: '1d6+1', speed: 20, xp: 50, cr: 0.25 }),
  hag: M('hag', 'Green Hag', '🧙', '#3d6b2f', { hp: 82, ac: 17, toHit: 6, dice: '2d8+4', xp: 700, cr: 3, boss: true }),
  harpy: M('harpy', 'Harpy', '🦅', '#a3794f', { hp: 38, ac: 11, toHit: 3, dice: '2d4+1', speed: 40, xp: 200, cr: 1 }),
  griffon: M('griffon', 'Griffon', '🦁', '#c9a24a', { hp: 59, ac: 12, toHit: 6, dice: '2d6+4', speed: 40, xp: 450, cr: 2, boss: true }),
  drunk: M('drunk', 'Rowdy Patron', '🍺', '#b07a4c', { hp: 9, ac: 10, toHit: 2, dice: '1d4', xp: 10, cr: 0 }),
  thug: M('thug', 'Thug', '🥊', '#5a5f6a', { hp: 32, ac: 11, toHit: 4, dice: '1d6+2', xp: 100, cr: 0.5 }),
  mimic: M('mimic', 'Mimic', '📦', '#8b5a2b', { hp: 58, ac: 12, toHit: 5, dice: '1d8+3', speed: 15, xp: 450, cr: 2, boss: true }),
  youngDragon: M('youngDragon', 'Young Red Dragon', '🐉', '#b8432f', { hp: 110, ac: 18, toHit: 10, dice: '2d10+6', speed: 40, xp: 3900, cr: 10, boss: true, range: 2 }),
};
export const MONSTER_IDS = Object.keys(MONSTERS);
