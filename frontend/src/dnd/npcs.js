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
  (q) => `Three nights ago I saw lanterns moving where no one lives. ${q.villainName}’s people, I’d bet.`,
  (q) => `My cousin went looking for ${q.villainName}. We buried an empty coffin last spring.`,
  (q) => `If it’s ${q.goal} you want, travel light and travel fast. They know you’re coming.`,
  (q) => `Don’t camp near standing water. That’s all I’ll say about ${q.villainName}.`,
  (q) => `The last crew that tried for ${q.reward} came back one short. Then two short.`,
  (q) => `${q.villainName} pays in gold that goes cold in your hand. Ask me how I know.`,
  (q) => `${cap(q.contact)} came by here yesterday, looking over their shoulder the whole time.`,
  (q) => `I’d count my friends twice before the end of this. ${cap(q.twistHint)}.`,
  () => 'The roads changed this year. Signposts point the wrong way, and nobody admits to turning them.',
  () => 'Something big moved through here at night. The dogs wouldn’t stop shaking.',
  () => 'Keep your torches lit past the bend. What lives in the dark there hates the light.',
  () => 'If you hear singing and can’t see the singer, walk the other way. Quickly.',
];

const SLAY_LINES = [
  (m, n) => `Those ${m} have been terrorizing me for days. Drive them off and I’ll pay you well. (${n} here)`,
  (m) => `Please, the ${m}! I can’t get past them. Clear them out and it’s worth your while.`,
  (m) => `If you can deal with the ${m} around here, I’ll make it worth your trouble.`,
  (m) => `The ${m} took my best goat and my second-best goat. I want them gone. Every one.`,
  (m) => `I’ve got coin saved for a rainy day. Those ${m} are a whole storm. Clear them out?`,
  (m) => `Every night those ${m} come a little closer. Put an end to it and I’ll pay.`,
  (m) => `You look like you can handle a blade. The ${m} out there? Handle them.`,
  (m) => `My grandmother chased off the ${m} with a broom once. I am not my grandmother. Help?`,
];

const FETCH_LINES = [
  (item) => `I dropped my ${item} somewhere around here. It’s probably in one of those chests. Bring it back?`,
  (item) => `Some thief stuffed my ${item} in a chest. Find it and I’ll reward you.`,
  (item) => `My ${item} is all I’ve got left of home. Someone locked it in a chest out there.`,
  (item) => `If you open a chest and find a ${item}, that’s mine. I’ll make it worth your while.`,
  (item) => `Rotten luck: my ${item} got packed up with the loot. Check the chests for me?`,
  (item) => `Bring me back my ${item} and I’ll tell everyone you’re heroes. And pay you. Mostly pay you.`,
];

const THANKS = ['Bless you!', 'I owe you one.', 'You’re true heroes.', 'I won’t forget this.', 'Here, you’ve earned this.', 'I’ll tell my children about you. Well, the dog.',
  'Gods, thank you. Drinks are on me if you’re ever back.', 'You did it! I didn’t think anyone could.', 'Take this, and take my thanks with it.',
  'They’ll sing about this. Badly, but they’ll sing.', 'A debt’s a debt. Here’s what I promised.', 'Finally, a good night’s sleep!'];
const AGAIN = ['Good luck out there.', 'Be careful.', 'Still here. Still grateful.', 'Go on, they’re waiting for you.', 'Mind the monsters.',
  'Back again? Don’t you have a villain to stop?', 'Watch your step past the old trees.', 'Come back alive. That’s an order.',
  'If you see my brother out there, tell him he owes me three silver.', 'I’ve said all I know. Go!', 'Don’t make me worry about you.',
  'Keep your blades sharp and your boots dry.', 'May your dice roll high.', 'Is it me or is it getting darker?'];

/** How each NPC talks. Their words get wrapped in their mood. */
const MOODS = {
  gruff: { open: ['Hmph.', 'Listen.', 'Look.', 'Right.', 'Ugh, fine.'], close: ['Now leave me be.', 'That’s all.', 'Don’t make me repeat it.', ''] },
  cheerful: { open: ['Oh, hello there!', 'Well met, friends!', 'Ah, travelers!', 'Good day to you!', 'Oh, how exciting!'], close: ['Have a lovely day!', 'Safe travels!', 'Ooh, good luck!', ''] },
  nervous: { open: ['Oh! You startled me.', 'Shh, not so loud.', 'Is anyone following you?', 'Okay. Okay okay okay.', 'Please, keep your voice down.'], close: ['I didn’t tell you this.', 'Please hurry.', 'Don’t say my name out there.', ''] },
  grand: { open: ['Ahem!', 'Gather close, brave souls.', 'Hark!', 'At last, heroes worthy of the tale.', 'Behold, wanderers!'], close: ['Fate favors the bold!', 'Go forth!', 'So it is written.', ''] },
  sly: { open: ['Psst. Over here.', 'You didn’t hear this from me.', 'Interesting company you keep.', 'For a friend, a whisper.', 'Well, well.'], close: ['Our secret, yes?', 'Remember who helped you.', 'Off you go.', ''] },
};
export const MOOD_IDS = Object.keys(MOODS);

/** What NPCs say when you try to persuade or scare them. */
export const PERSUADE_FAIL = ['Hmph. I don’t know you, and I’ve said all I’m going to say.', 'Nice try. Flattery doesn’t pay my rent.',
  'I’ve heard sweeter words from a goblin.', 'No. And stop smiling at me like that.', 'You’ll have to do better than that, friend.'];
export const INTIMIDATE_OK = (gold) => [`All right, all right! Take it, ${gold} gold, just leave me be!`, `Here! ${gold} gold! It’s all I have, I swear!`,
  `Fine! ${gold} gold. You’re no better than the monsters.`, `Take the ${gold} gold and go. Please.`];
export const INTIMIDATE_FAIL = ['Ha! Is that supposed to scare me? We’re done here.', 'I’ve been threatened by scarier things before breakfast.',
  'Get out of my sight before I call someone bigger.', 'You? Scare me? Walk away while you can.'];
export const CAUGHT = ['Hey! THIEF! Guards!', 'Get your hand out of my pocket! GUARDS!', 'Stop, thief! Somebody help!', 'I felt that! THIEF!'];

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
      mood: r.pick(MOOD_IDS),
      said: 0,
    };
  });
};

/** What an NPC says when someone talks to them: the core line, in their own voice. rand varies repeat visits. */
export const npcLine = (npc, rand = null) => {
  let line = npc.task.line;
  if (npc.rewarded) line = rand ? AGAIN[Math.floor(rand() * AGAIN.length)] : npc.again;
  else if (npc.done) line = npc.thanks;
  const mood = MOODS[npc.mood];
  if (!mood || !rand) return line;
  const open = rand() < 0.7 ? mood.open[Math.floor(rand() * mood.open.length)] : '';
  const close = rand() < 0.5 ? mood.close[Math.floor(rand() * mood.close.length)] : '';
  return [open, line, close].filter(Boolean).join(' ');
};

/** The phone's short summary of a task. */
export const taskLabel = (npc) => {
  if (npc.task.kind === 'slay') return `Defeat the ${plural(MONSTERS[npc.task.monster].name)} for ${npc.name}`;
  if (npc.task.kind === 'fetch') return `Find ${npc.name}’s ${npc.task.item} in a chest`;
  return null;
};
