// Friendly folk who stand around the maps. Walk up to one and talk: each gives a clue about the quest or a
// small side task (drive off some monsters, find something in a chest) that pays XP and gold.

import { makeRng, tools } from './rng';
import { MONSTERS } from './rules';
import { randomLook, lookCode } from '../party/look';

export const NPC_ROLES = {
  tavern: ['Barkeep', 'Bard', 'Card sharp', 'Serving girl'],
  forest: ['Merchant', 'Blacksmith', 'Farmer', 'Hunter', 'Woodcutter', 'Village elder'],
  dungeon: ['Prisoner', 'Lost cartographer'],
  cave: ['Lost miner', 'Dwarf prospector'],
  crypt: ['Gravedigger', 'Priest'],
  castle: ['Guard', 'Servant', 'Court jester'],
  swamp: ['Hermit', 'Frog catcher', 'Fisherman', 'Herbalist'],
  mountain: ['Pilgrim', 'Mountain guide', 'Goat herder', 'Camp cook'],
};

const FIRST = ['Bram', 'Elda', 'Tobin', 'Mira', 'Gareth', 'Isolde', 'Fenwick', 'Rook', 'Selene', 'Odo', 'Petra', 'Quill', 'Wren', 'Magnus', 'Tilda', 'Corwin', 'Hollis', 'Juniper', 'Pip', 'Agnes', 'Dunstan', 'Marigold'];

const KEEPSAKES = ['wedding ring', 'grandfather’s pocket watch', 'lucky dice', 'locket with a portrait inside', 'silver flute', 'journal', 'old war medal', 'family sword hilt'];

const CLUE_LINES = [
  (q) => `I’ve heard the name ${q.villainName}. People who say it too loud go missing.`,
  (q) => `Whatever you do, don’t trust everyone who offers help. ${cap(q.twistHint)}.`,
  (q) => `You’re after ${q.goal}? Then keep going. The answer is past the next door.`,
  (q) => `${q.villainName} has eyes everywhere. I’d watch the shadows if I were you.`,
  (q) => `There’s a reward in it, I hear: ${q.reward}. Worth the danger? You tell me.`,
  (q) => `Folks say ${q.contact} knows more than they told you.`,
];

const SLAY_LINES = [
  (m, n) => `Those ${m} have been terrorizing me for days. Drive them off and I’ll pay you well. (${n} here)`,
  (m) => `Please, the ${m}! I can’t get past them. Clear them out and it’s worth your while.`,
  (m) => `If you can deal with the ${m} around here, I’ll make it worth your trouble.`,
];

const FETCH_LINES = [
  (item) => `I dropped my ${item} somewhere around here. It’s probably in one of those chests. Bring it back?`,
  (item) => `Some thief stuffed my ${item} in a chest. Find it and I’ll reward you.`,
];

const THANKS = ['Bless you!', 'I owe you one.', 'You’re true heroes.', 'I won’t forget this.', 'Here, you’ve earned this.'];
const AGAIN = ['Good luck out there.', 'Be careful.', 'Still here. Still grateful.', 'Go on, they’re waiting for you.', 'Mind the monsters.'];

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const plural = (name) => (/s$/.test(name) ? name : name.replace(/y$/, 'ie').concat('s')).toLowerCase();

/** A short name for the quest's villain: "Vexa the Pale, a necromancer…" becomes "Vexa the Pale". */
export const villainName = (villain) => String(villain || 'the villain').split(',')[0];

/** Quest facts an NPC can drop as a clue. */
const questFacts = (quest) => ({
  villainName: villainName(quest?.villain),
  goal: quest?.goal || 'the job',
  reward: quest?.reward || 'gold',
  contact: quest?.contact || 'the one who hired you',
  twistHint: quest?.twist ? `I have a feeling ${quest.twist}` : 'not everything is what it seems',
});

/**
 * Set up the NPCs of a new scene: names, looks and a task each.
 * spots: [{ x, y, role }] from the map; monsters: monster ids in the scene; chests: how many chests.
 */
export const makeNpcs = (seed, spots, { monsters = [], chests = 0, quest = null } = {}) => {
  const r = tools(makeRng(seed));
  const counts = monsters.reduce((acc, id) => ({ ...acc, [id]: (acc[id] || 0) + 1 }), {});
  const kinds = Object.keys(counts).filter((id) => !MONSTERS[id]?.boss);
  let fetchUsed = false;
  return spots.map((spot, i) => {
    const name = r.pick(FIRST);
    let task;
    const roll = r.rand();
    if (roll < 0.4 && kinds.length) {
      const monster = r.pick(kinds);
      task = { kind: 'slay', monster, count: counts[monster], line: r.pick(SLAY_LINES)(plural(MONSTERS[monster].name), counts[monster]) };
    } else if (roll < 0.7 && chests > 0 && !fetchUsed) {
      fetchUsed = true;
      const item = r.pick(KEEPSAKES);
      task = { kind: 'fetch', item, line: r.pick(FETCH_LINES)(item) };
    } else {
      task = { kind: 'clue', line: r.pick(CLUE_LINES)(questFacts(quest)) };
    }
    return {
      id: `npc-${i}`,
      x: spot.x,
      y: spot.y,
      role: spot.role,
      name,
      look: lookCode({ ...randomLook(r.rand), costume: 0, extra: 0, shades: false }),
      task,
      talked: false,
      done: false,
      rewarded: false,
      thanks: r.pick(THANKS),
      again: r.pick(AGAIN),
    };
  });
};

/** What an NPC says when someone talks to them. */
export const npcLine = (npc) => {
  if (npc.rewarded) return npc.again;
  if (npc.done) return npc.thanks;
  return npc.task.line;
};

/** The phone's short summary of a task. */
export const taskLabel = (npc) => {
  if (npc.task.kind === 'slay') return `Defeat the ${plural(MONSTERS[npc.task.monster].name)} for ${npc.name}`;
  if (npc.task.kind === 'fetch') return `Find ${npc.name}’s ${npc.task.item} in a chest`;
  return null;
};
