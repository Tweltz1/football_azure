// Quests, names and a built-in narrator. The AI narrator replaces the narration when it's set up;
// this file keeps a session playable (and different every time) without it.

import { makeRng, tools } from './rng';
import { SETTINGS, settingFor } from './settings';
import { MONSTERS } from './rules';
import { narrate } from './narrator';

const PATRONS = [
  'a nervous halfling innkeeper', 'the town’s one-eyed sheriff', 'a priestess of the dawn', 'a dwarf merchant who lost a cart',
  'a retired adventurer with a bad knee', 'a talking raven', 'the mayor’s too-curious daughter', 'a guild of thieves who pay well',
  'a gnome inventor', 'a dying knight', 'a mysterious letter with no signature', 'the village children',
];
const GOALS = [
  'bring back a stolen relic', 'rescue a missing apprentice', 'find out why the dead are walking', 'stop a cult before the new moon',
  'recover a dwarven heirloom', 'escort a wagon of medicine through', 'clear out the monsters blocking the trade route',
  'find a cure for a cursed village', 'catch the thief who robbed the temple', 'map a place nobody comes back from',
  'deliver a sealed letter, unopened', 'find the source of a strange glowing light',
];
const VILLAINS = [
  'Vexa the Pale, a necromancer who keeps her heart in a jar', 'Gruk Two-Teeth, goblin king of the hills', 'the Ashen Choir, a cult of fire',
  'Baron Malric, who smiles too much', 'Old Mother Sedge, the swamp witch', 'Skarnax, a young red dragon with big plans',
  'the Hollow Knight, an empty suit of armor that walks', 'Lady Corvina and her crow-masked spies', 'a mimic that thinks it’s a king',
  'Brother Thane, a priest who heard the wrong god',
];
const TWISTS = [
  'the patron is secretly working for the villain', 'the villain is trying to stop something worse', 'the relic is alive',
  'one of the monsters wants to switch sides', 'the missing person left on purpose', 'the map was drawn by a liar',
  'the reward is cursed', 'a rival party of adventurers is after the same prize', 'the villain is the patron’s sibling',
  'there is a second, older villain behind the first', 'it was all a test by a bored wizard', 'the dead are walking because someone stole their names',
];
const REWARDS = ['200 gold', 'a magic sword', 'a deed to a run-down castle', 'a favor from the king', 'free ale for life', 'a map to a dragon hoard', 'a pet griffon egg'];

const FIRST = ['Bram', 'Elda', 'Tobin', 'Mira', 'Gareth', 'Isolde', 'Fenwick', 'Rook', 'Selene', 'Odo', 'Petra', 'Quill', 'Wren', 'Magnus', 'Tilda', 'Corwin', 'Nyx', 'Hollis', 'Juniper', 'Barnaby'];
const LAST = ['Underbough', 'Ironfoot', 'Thistlewood', 'Ashby', 'Blackwater', 'Copperkettle', 'Grimsby', 'Stormwind', 'Mudd', 'Larkspur', 'Hearthstone', 'Vane'];
export const npcName = (r) => `${r.pick(FIRST)} ${r.pick(LAST)}`;

// How a session flows between places. The last place has the boss.
const CHAINS = [
  ['tavern', 'forest', 'dungeon'],
  ['tavern', 'forest', 'cave'],
  ['tavern', 'swamp', 'crypt'],
  ['forest', 'mountain', 'cave'],
  ['tavern', 'mountain', 'castle'],
  ['tavern', 'crypt', 'dungeon'],
  ['forest', 'swamp', 'crypt'],
  ['tavern', 'castle', 'dungeon'],
  ['mountain', 'cave', 'dungeon'],
];

/** A new quest. Pass the titles of quests a campaign has already done to avoid repeats. */
export const makeQuest = (seed, avoid = []) => {
  const r = tools(makeRng(seed));
  let quest = null;
  for (let i = 0; i < 6; i += 1) {
    const goal = r.pick(GOALS);
    const villain = r.pick(VILLAINS);
    quest = {
      patron: r.pick(PATRONS),
      goal,
      villain,
      twist: r.pick(TWISTS),
      reward: r.pick(REWARDS),
      chain: r.pick(CHAINS),
      title: `${goal.charAt(0).toUpperCase()}${goal.slice(1)}`,
      contact: npcName(r),
      weather: r.pick(['a cold drizzle', 'a blood-red sunset', 'thick fog', 'a hot, still night', 'the first snow', 'a thunderstorm rolling in', 'a full moon']),
    };
    if (!avoid.includes(quest.title)) break;
  }
  return quest;
};

// ---- The built-in narrator ---------------------------------------------------------------------------

const pickFrom = (seed, list) => list[Math.abs(seed) % list.length];

/** A short narration for a cue. Uses the scene seed and a counter so it changes every time. */
export const localNarration = (cue, ctx, n = 0) => narrate(cue, ctx, n);

/** Short ideas the DM can drop in, so a scene never plays the same way twice. */
export const dmIdeas = (ctx, n = 0) => {
  const s = settingFor(ctx.setting);
  const r = tools(makeRng((ctx.seed || 1) + n * 977));
  const ideas = [
    `A ${r.pick(['wounded', 'lost', 'suspicious', 'very drunk', 'too friendly'])} NPC named ${npcName(r)} appears and asks for help.`,
    `Call for a ${r.pick(['Perception', 'Stealth', 'Investigation', 'Athletics', 'Insight'])} check: ${r.pick(s.sights)} hides a clue.`,
    `A trap: ${r.pick(['a pressure plate', 'a tripwire', 'a collapsing floor', 'poison darts', 'a swinging blade'])}. Dexterity save, DC ${r.int(11, 15)}.`,
    `Reinforcements: ${r.int(1, 3)} more ${MONSTERS[r.pick(s.monsters)[0]].name.toLowerCase()}s arrive.`,
    `A rival adventurer shows up wanting the same prize.`,
    `The twist starts to show: ${ctx.quest?.twist || 'not everything is what it seems'}.`,
  ];
  return r.shuffle(ideas).slice(0, 3);
};

export const SETTING_LIST = Object.values(SETTINGS);
export const pickFromSeed = pickFrom;
