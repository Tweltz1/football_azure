// The built-in narrator: a small story grammar. Each moment is built from a template whose #slots# are filled
// from word banks (shared, per setting, and per hero class), so the same moment reads differently thousands of
// ways. It runs on the phone or TV with no network, and it's what the table hears whenever the AI is off or slow.

import { makeRng, tools } from './rng';
import { settingFor } from './settings';

// ---- Word banks shared by every setting ----------------------------------------------------------------

const SHARED = {
  arrive: [
    'You step into #place#', 'The path brings you to #place#', 'At last you reach #place#', 'You push on into #place#',
    'One by one, the party enters #place#', 'Torches raised, you come to #place#', 'You find yourselves in #place#',
    'Nobody speaks as you enter #place#', 'Boots scuffing, you arrive at #place#',
  ],
  notice: ['You notice', 'Your eyes land on', 'Ahead, you make out', 'Off to one side there is', 'Hard to miss:', 'In the gloom you spot'],
  hear: ['Somewhere close you hear', 'From the far side comes', 'Every few seconds there is', 'Your ears catch', 'Faint but clear:', 'Under it all:'],
  smell: ['The air smells of', 'It reeks of', 'You catch the scent of', 'Hanging in the air:', 'Your nose wrinkles at'],
  hook: [
    'What do you do?', 'Something is watching.', 'Weapons ready?', 'Nobody moves first.', 'It is too quiet.', 'Which way?',
    'Somebody should check that out.', 'The hair on your neck stands up.', 'This place has secrets.', 'Stay close.',
    'You get the feeling you are expected.', 'Choose carefully.', 'The clock is ticking.',
  ],
  feel: ['#hero# shivers.', '#hero# grips their weapon a little tighter.', '#hero# mutters something about a bad feeling.', '#hero# grins. This is the fun part.', '#hero# checks their pack one more time.', '#hero# looks back the way you came.'],
  battlecry: ['Steel rings out!', 'Ambush!', 'They saw you first.', 'No more sneaking.', 'Here they come!', 'Too late to run.', 'Blades out!', 'The quiet breaks all at once.', 'Trouble!', 'So much for the easy way.'],
  charge: [
    'charge out of the shadows', 'close in from every side', 'block the way forward', 'burst out with a howl', 'drop from above',
    'rise from behind cover', 'spread out to surround you', 'come screaming across the floor', 'step forward, grinning', 'were waiting all along',
  ],
  initiative: ['Roll initiative!', 'Roll for initiative!', 'Initiative, everyone!', 'Dice up. Roll initiative!'],
  fallen: ['The last enemy falls.', 'Silence returns.', 'It is over, for now.', 'The dust settles.', 'Nothing else moves.', 'The fight ends as fast as it began.', 'The last foe crumples.'],
  after: ['wipes their blade', 'catches their breath', 'checks the bodies for coin', 'lets out a shaky laugh', 'counts their bruises', 'sits down hard', 'bandages a cut without a word', 'whoops a little too loudly'],
  onward: [
    'But that sound again', 'Deeper in, a door creaks open', 'A trail of fresh tracks leads on', 'The way onward is clear', 'Something deeper in heard all of that',
    'A cold draft points the way', 'One of them dropped a crumpled note', 'Far off, a bell starts ringing',
  ],
  shine: ['It glints in the torchlight.', 'Finders keepers.', 'Somebody hid this for a reason.', 'Not bad at all.', 'Worth the trip.', 'It feels warm to the touch.', 'There is a name scratched on it.'],
  danger: ['Someone get to them, fast!', 'Their breathing is shallow.', 'The enemies sense weakness.', 'This is bad.', 'Heal them, now!', 'Not like this!'],
  cheer: ['Bards will sing about that one.', 'That one had their name on it.', 'Even the monsters wince.', 'What a hit!', 'Textbook.', 'The whole table felt that.', 'Someone write that down.'],
  doorway: ['A cold draft comes from beyond.', 'Footprints lead that way. Fresh ones.', 'Whatever is ahead, there is no going back.', 'Light flickers on the other side.', 'Someone left it open. Recently.', 'The next part of the journey waits.'],
  taunt: ['"You took your time."', '"I was hoping you would come."', '"Kneel, and I make it quick."', '"So these are the heroes. How small."', '"Turn back. Last warning."', '"You have no idea what you have walked into."', '"Good. I was getting bored."'],
  consider: ['The DM considers this…', 'Roll for it!', 'Bold. Very bold.', 'Let’s see how that goes.', 'Interesting choice.', 'Nobody expected that.', 'The world holds its breath.'],
  ending: ['Rest up. This story is not over.', 'Word of your deeds spreads.', 'Somewhere, someone is very angry about this.', 'Tonight, you drink for free.', 'But the twist still nags at you.', 'A new rumor is already waiting.'],
  time: ['As night falls', 'Before dawn', 'Around midday', 'Late in the evening', 'Hours later', 'Just after sunrise'],
};

// ---- Per-setting word banks (added to each setting's sights, sounds and smells) --------------------------

const PLACES = {
  tavern: {
    place: ['the Hooded Lantern', 'a crowded inn', 'a smoky common room', 'the Drunken Griffon', 'a roadside tavern'],
    detail: ['A barmaid keeps glancing at the back door.', 'The bard stops playing when you walk in.', 'Someone has carved a map into the bar top.', 'A card game goes very quiet.', 'The bouncer is missing an ear and a sense of humor.'],
    sight: ['a mug of something green and bubbling', 'a wanted poster with a familiar face', 'a dartboard with a dagger in the bullseye'],
    sound: ['a chair scraping back slowly', 'someone whispering your names'],
    smell: ['burnt bread', 'wet dog'],
  },
  forest: {
    place: ['the old trade road', 'a moss-green clearing', 'the edge of the Thornwood', 'a bend in the forest road', 'a ford across a cold stream'],
    detail: ['The trees lean in a little too close.', 'Something big walked here, and not long ago.', 'The birds stop singing.', 'A rope bridge sways over a gully ahead.', 'Sunlight comes through in dusty spears.'],
    sight: ['an abandoned campfire, still warm', 'a hanged lantern swaying on its own', 'a hunter’s snare with something still in it'],
    sound: ['hoofbeats far off', 'a crow laughing'],
    smell: ['wild garlic', 'rain on the way'],
  },
  dungeon: {
    place: ['a vaulted stone hall', 'the lower cells', 'a flooded corridor', 'the old armory', 'a chamber of broken pillars'],
    detail: ['Chains hang from the walls, some still locked.', 'Water drips in a slow, steady beat.', 'Scratch marks on the door count to forty.', 'The torches here were lit recently.', 'A lever on the wall is labeled DO NOT.'],
    sight: ['a skeleton still holding a key', 'a sealed iron door', 'fresh goblin graffiti'],
    sound: ['chains rattling', 'a heavy door slamming far below'],
    smell: ['rust and old straw', 'lamp oil'],
  },
  cave: {
    place: ['a glittering cavern', 'a narrow crystal tunnel', 'the edge of an underground lake', 'a cave full of humming stone', 'a grotto lit by glowing moss'],
    detail: ['Crystals hum when anyone talks too loud.', 'Your torchlight bounces in a hundred colors.', 'The floor is slick and drops off into black water.', 'Something has been mining here, badly.', 'Bats shift overhead.'],
    sight: ['a geode the size of a cart', 'tiny footprints in the dust', 'a dwarven pickaxe snapped in two'],
    sound: ['crystals chiming', 'a deep breathing sound from below'],
    smell: ['wet stone', 'something like copper'],
  },
  crypt: {
    place: ['the crypt of the old kings', 'a hall of sealed tombs', 'the ossuary', 'a chapel of the dead', 'a graveyard under a bruised sky'],
    detail: ['The candles light themselves as you pass.', 'One coffin lid is pushed aside.', 'Names on the tombs have been scratched out.', 'Your breath fogs, though it is not cold.', 'A bell tolls once. Nobody rang it.'],
    sight: ['a statue weeping black water', 'skulls stacked into a doorway', 'fresh flowers on an ancient grave'],
    sound: ['bones settling', 'a whisper that says your name'],
    smell: ['grave dirt', 'old incense'],
  },
  castle: {
    place: ['the great hall', 'the castle courtyard', 'a long gallery of portraits', 'the throne room', 'the guard barracks'],
    detail: ['The portraits’ eyes have been cut out.', 'A feast sits half eaten and cold.', 'Banners of a fallen house hang in rags.', 'Guards’ boots echo somewhere above.', 'The throne is empty. The cushion is warm.'],
    sight: ['a suit of armor holding a fresh rose', 'a map table covered in red pins', 'a cracked crown on the floor'],
    sound: ['a harpsichord playing alone', 'a portcullis grinding'],
    smell: ['candle wax and roast boar', 'cold iron'],
  },
  swamp: {
    place: ['the Witchmire', 'a sunken boardwalk', 'a hut on chicken legs', 'a drowned village', 'a fog-choked bog'],
    detail: ['Bubbles rise in the water, too regular to be natural.', 'Lanterns float in the fog with no one holding them.', 'The boardwalk ends without warning.', 'Frogs croak in a rhythm, like counting.', 'A rowboat drifts past, empty.'],
    sight: ['a scarecrow made of reeds', 'a witch’s charm of bones and twine', 'eyes just above the waterline'],
    sound: ['something large slipping into the water', 'a cackle carried on the wind'],
    smell: ['rotting lilies', 'marsh gas'],
  },
  mountain: {
    place: ['the high pass', 'a ledge above the clouds', 'an abandoned watchtower', 'a frozen waterfall', 'the giant’s stair'],
    detail: ['The wind steals your words away.', 'Snow slides off a ledge above with a hiss.', 'The road is cut by an old avalanche.', 'A goat watches you, unimpressed.', 'Far below, a river glints like a blade.'],
    sight: ['giant footprints in the snow', 'a frozen climber still roped to the rock', 'an eagle nest the size of a wagon'],
    sound: ['rocks tumbling far off', 'a horn from the peaks'],
    smell: ['thin cold air', 'woodsmoke from a hidden camp'],
  },
};

// ---- Hero flavor by class -------------------------------------------------------------------------------

const CLASS_FLAVOR = {
  Fighter: ['plants their feet', 'raises their shield', 'rolls their shoulders'],
  Barbarian: ['roars', 'cracks their knuckles', 'laughs at the danger'],
  Rogue: ['melts into the shadows', 'flips a dagger', 'is already checking pockets'],
  Ranger: ['nocks an arrow', 'reads the tracks', 'listens to the wind'],
  Wizard: ['mutters a spell under their breath', 'sparks dance on their fingers', 'flips through a spellbook'],
  Cleric: ['whispers a prayer', 'holy light glows in their hand', 'touches their holy symbol'],
  Bard: ['hums a battle tune', 'strums a defiant chord', 'already has a rhyme ready'],
  Paladin: ['speaks an oath', 'their armor gleams', 'steps in front of the others'],
};

// ---- Templates per moment -------------------------------------------------------------------------------

const TEMPLATES = {
  start: [
    '#weatherOpen##contact# finds you. On behalf of #patron#, they need you to #goal#. The trail leads to #settingName#. #startHook#',
    '#contact# slams a coin purse on the table. "#patronCap# is desperate. Someone has to #goal#." #startHook#',
    '#weatherOpen#a message arrives from #patron#: #goal#, and quickly. The first stop is #settingName#. #startHook#',
    'Everyone in town is talking about it. #patronCap# is offering #reward# to anyone who can #goal#. #contact# is waiting for you. #startHook#',
  ],
  startHook: ['Nobody else would take the job.', 'The pay is good. The odds are not.', 'They whisper one name before leaving: #villainName#.', '"Don’t trust anyone," they add.', 'They look over their shoulder the whole time.', 'The reward: #reward#.'],
  scene: [
    '#arrive#. #notice# #sight#. #hear# #sound#. #hook#',
    '#arrive#. #detail# #smell# #smellThing#. #hook#',
    '#time#, #arriveLower#. #detail# #notice# #sight#. #feel#',
    '#arrive#. #hear# #sound#, and #notice2# #sight#. #detail# #hook#',
    '#detail# #notice# #sight#. #smell# #smellThing#. #heroFlavor# #hook#',
  ],
  combat: [
    '#battlecry# #foes# #charge#. #initiative#',
    '#foes# #charge#! #heroFlavor# #initiative#',
    '#battlecry# #heroFlavor# #foes# #charge#. #initiative#',
    'Out of nowhere, #foesLower# #charge#. #battlecry# #initiative#',
  ],
  victory: [
    '#fallen# #hero# #after#. #onward#…',
    '#fallen# #detail# #onward#…',
    '#fallen# #hero# #after#, and #hero2# #after#. #hook#',
  ],
  loot: ['#detail#! #shine#', '#shine# #detail#.', 'Treasure! #detail#. #shine#'],
  mimic: ['The chest grows teeth. It was never a chest.', 'The lid snaps open, and keeps opening. Teeth. So many teeth.', 'The chest licks its lips. Chests do not have lips.', 'Gold coins, sticky with drool. The chest is hungry.'],
  down: ['#detail# falls! #danger#', '#detail# hits the ground. #danger#', 'No! #detail# goes down. #danger#'],
  crit: ['#detail#: a critical hit! #cheer#', 'Natural twenty! #detail#. #cheer#', '#cheer# #detail#, critical hit!'],
  exit: ['#hero# finds the way onward. #doorway#', '#hero# spots a way out. #doorway#', 'There! #hero# points the way. #doorway#'],
  boss: [
    '#villainName# is here. #taunt# #twistHint#',
    '#arrive#. On a throne of junk sits #villainName#. #taunt# #twistHint#',
    'The air goes still. #villainName# steps into the light. #taunt# #twistHint#',
  ],
  twistHint: ['', '', 'And something about this feels wrong…', 'You get the strange feeling this is not the whole story.'],
  action: ['#detail#. #consider#', '#consider# #detail#.'],
  check: ['#detail#'],
  complete: [
    'The quest is done: you #goal#. #patronCap# pays out: #reward#. #ending#',
    'It is finished. #villainName# will not trouble anyone again, for now. #ending#',
    'You did it. #hero# looks around at the others and laughs. #patronCap# keeps their promise: #reward#. #ending#',
  ],
  recap: [
    'Last time, the party set out to #goal#. #partyList# made it as far as #settingName#.',
    'Previously: #patron# sent you to #goal#. You reached #settingName#, and #villainName# knows you are coming.',
  ],
  free: ['#notice# #sight#. #hear# #sound#.', '#detail# #hook#'],
};

// ---- Grammar engine ---------------------------------------------------------------------------------------

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// Moments whose #detail# is what the engine says happened, not scenery.
const DETAIL_KINDS = { loot: 'You find something', down: 'Someone', crit: 'A mighty blow', action: 'Someone tries something', check: 'The roll is in' };

const recentLines = [];
const remember = (text) => {
  recentLines.push(text);
  if (recentLines.length > 60) recentLines.shift();
};

const bankFor = (ctx, cue, r) => {
  const s = settingFor(ctx.setting);
  const local = PLACES[s.id] || PLACES.tavern;
  const q = ctx.quest || {};
  const party = (ctx.party || []).filter((p) => p && p.name);
  const heroes = party.length ? r.shuffle(party.slice()) : [{ name: 'Someone', cls: '' }];
  const flavor = heroes[0].cls && CLASS_FLAVOR[heroes[0].cls] ? CLASS_FLAVOR[heroes[0].cls] : ['steadies themself'];
  const villain = (q.villain || 'the villain').split(',')[0];
  const foeNames = (ctx.foes || []).map((f) => f.name);
  const foes = cue.detail || (foeNames.length ? [...new Set(foeNames)].join(' and ') : 'Enemies');
  return {
    ...SHARED,
    place: local.place,
    sight: [...s.sights, ...local.sight],
    sound: [...s.sounds, ...local.sound],
    smellThing: [...s.smells, ...local.smell],
    detail: DETAIL_KINDS[cue.kind] ? [cue.detail || DETAIL_KINDS[cue.kind]] : local.detail,
    notice2: SHARED.notice.map(lower),
    arriveLower: SHARED.arrive.map(lower),
    hero: [heroes[0].name],
    hero2: [(heroes[1] || heroes[0]).name],
    heroFlavor: [`${heroes[0].name} ${r.pick(flavor)}.`],
    foes: [foes],
    foesLower: [lower(foes)],
    settingName: [s.name.replace(/^The /, 'the ')],
    contact: [q.contact || 'A stranger'],
    patron: [q.patron || 'someone desperate'],
    patronCap: [cap(q.patron || 'Your patron')],
    goal: [q.goal || 'help'],
    reward: [q.reward || 'a fair share of gold'],
    villainName: [villain],
    weatherOpen: q.weather ? [`Under ${q.weather}, `, `In ${q.weather}, `, ''] : [''],
    partyList: [party.length ? party.map((p) => p.name).join(', ') : 'The party'],
    ...Object.fromEntries(['startHook', 'twistHint'].map((k) => [k, TEMPLATES[k]])),
  };
};

const expand = (text, bank, r, depth = 0) => text.replace(/#(\w+)#/g, (_, key) => {
  const list = bank[key];
  if (!list || !list.length) return '';
  const pick = r.pick(list);
  return depth < 4 ? expand(pick, bank, r, depth + 1) : pick;
});

const tidy = (text) => {
  const t = text.replace(/\s+/g, ' ').replace(/\s+([.,!?…])/g, '$1').replace(/\.\./g, '.').trim();
  // Capitalize the start of each sentence (after a template slot fills it in lower case).
  return cap(t).replace(/([.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
};

/** One narration for a cue: { kind, detail }. ctx is the engine's aiContext. n varies it further. */
export const narrate = (cue, ctx = {}, n = 0) => {
  const kind = TEMPLATES[cue.kind] && !['startHook', 'twistHint'].includes(cue.kind) ? cue.kind : 'free';
  let text = '';
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const r = tools(makeRng(((ctx.seed || 1) * 31 + n * 131 + attempt * 7919 + kind.length * 17) >>> 0));
    const bank = bankFor(ctx, cue, r);
    text = tidy(expand(r.pick(TEMPLATES[kind]), bank, r));
    if (!recentLines.includes(text)) break;
  }
  remember(text);
  return text;
};

/** Roughly how many different lines a moment can produce in one setting (for tests and bragging). */
export const variety = (kind, settingId = 'tavern') => {
  const ctx = { setting: settingId, quest: {}, party: [{ name: 'A', cls: 'Fighter' }] };
  const bank = bankFor(ctx, { kind }, tools(makeRng(1)));
  const count = (text, depth = 0) => (text.match(/#(\w+)#/g) || []).reduce((total, slot) => {
    const list = bank[slot.slice(1, -1)] || [''];
    const options = list.reduce((sum, item) => sum + (depth < 4 ? count(item, depth + 1) : 1), 0);
    return total * Math.max(1, options);
  }, 1);
  return TEMPLATES[kind].reduce((sum, t) => sum + count(t), 0);
};

export const _forgetRecent = () => { recentLines.length = 0; };
