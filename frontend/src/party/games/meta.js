// What the lobby shows about each game. Light on purpose: the phone page imports this too.
import { themeInfo } from '../season.js';
import { CANDLE_TEXT, CHARMS } from '../lastCandle.js';
import { HALL_PLACE, HALL_TITLE } from './hallway.js';

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

export const GAME_META = [
  {
    id: 'candle',
    title: 'Last Candle',
    emoji: '🕯️',
    tag: 'Co-op',
    minutes: '6–8 min',
    blurb: 'Keep the candles lit until dawn. Work together, shout a lot.',
    how: [
      `${cap(CANDLE_TEXT.foes)} walk up the paths. Each shows the charms that send it away.`,
      `Your phone holds 3 charms. Tap one to throw it. Throw a charm nobody needs and you get ${CANDLE_TEXT.spooked === 'SPOOKED!' ? 'spooked' : 'stuck for a moment'}.`,
      `Shout! “Who has ${CHARMS[0].name.toLowerCase()}?!” Fog hides some ${CANDLE_TEXT.foes}, and only one phone can see through it.`,
    ],
    phoneHint: "You'll throw charms from this phone in a minute.",
  },
  {
    id: 'quiz',
    title: 'Fright Quiz',
    emoji: '🎃',
    tag: 'Versus',
    minutes: '6–8 min',
    blurb: 'Spooky trivia. The fastest right answer scores the most.',
    how: [
      'A Halloween question pops up on the TV. The answers show on your phone.',
      'Tap the right one, fast. The quicker you are, the more points you get.',
      'First right answer gets a bonus, three in a row is a Hot Streak, and Round 3 counts double.',
    ],
    phoneHint: "You'll answer on this phone. Fingers ready!",
  },
  {
    id: 'mash',
    title: 'Monster Mash-up',
    emoji: '🧟',
    tag: 'Versus',
    minutes: '8–10 min',
    blurb: 'Write the funniest answers to spooky prompts, then vote for the best.',
    minPlayers: 3,
    how: [
      'Your phone gives you a spooky prompt. Write something funny.',
      'Answers go head to head on the TV. Nobody knows who wrote what.',
      'Everyone else votes. Every vote is points, and winning them all is a Monster Mash-up!',
    ],
    phoneHint: "You'll write answers and vote on this phone.",
  },
  {
    id: 'hallway',
    title: HALL_TITLE,
    emoji: '🚪',
    tag: 'Co-op',
    minutes: '6–10 min',
    blurb: `Climb ${HALL_PLACE} together. Only the guides know which door is safe.`,
    how: [
      'Each floor has a row of doors. Only one is safe.',
      'Two guides get clues on their phones. Neither can solve it alone, so read them out loud!',
      `Everyone votes for a door. A wrong door lets a ${CANDLE_TEXT.foe} out and costs a lantern.`,
    ],
    phoneHint: 'You might be a guide! Watch this phone for clues.',
  },
  {
    id: 'mask',
    title: "Who's Behind the Mask?",
    emoji: '🎭',
    tag: 'Versus',
    minutes: '10–15 min',
    blurb: 'Everyone gets a secret word except the vampires. Give clues, sniff out the fakers, and vote them out.',
    minPlayers: 3,
    how: [
      'Humans get a secret word. Vampires only see 3 similar words, never the real one!',
      'Everyone writes a one-word clue. Humans hint without giving it away; vampires fake one that fits.',
      'Talk it out and vote. Catch a vampire and the humans score. More players means more vampires!',
    ],
    phoneHint: 'Keep your phone hidden. Your secret word (or your fangs) show up here.',
  },
  // Holiday-only games: each shows up (first in the list) only while its holiday is on. See season.js.
  {
    id: 'trot',
    holiday: 'thanksgiving',
    title: 'Turkey Trot',
    emoji: '🦃',
    tag: 'Co-op',
    minutes: '5–7 min',
    blurb: 'The turkeys got loose! Steer your farmer with your phone and herd them into the pen before dinner.',
    how: [
      'Your phone is a joystick that walks your farmer around the yard.',
      'Turkeys run away from you. Get behind one and walk it up into the pen.',
      'Pen enough turkeys before the dinner bell. Team up to trap them!',
    ],
    phoneHint: 'Your phone turns into a joystick in a minute.',
  },
  {
    id: 'rush',
    holiday: 'christmas',
    title: 'Gift Wrap Rush',
    emoji: '🎁',
    tag: 'Co-op',
    minutes: '5–7 min',
    blurb: "Run Santa's assembly line together: box, wrap, bow and tag every present before it reaches the sleigh.",
    how: [
      'Toys ride the belt past four stations: Box, Wrap, Bow and Tag. Your phone is your station.',
      "When a present reaches your part of the belt, tap what its order card on the TV asks for.",
      'Perfect presents fly onto the sleigh. One wrong pick and it goes in the coal bin!',
    ],
    phoneHint: 'Your station shows up on this phone in a minute.',
  },
  {
    id: 'countdown',
    holiday: 'newyear',
    title: 'Countdown Chaos',
    emoji: '🎆',
    tag: 'Versus',
    minutes: '5–6 min',
    blurb: 'The ball drops and everyone hits STOP as close to midnight as they dare. Go over and you get nothing!',
    how: [
      'The ball drops toward midnight. The clock runs on your phone.',
      'Hit STOP as close to midnight as you dare. Past midnight scores nothing!',
      'Closest wins the round. Watch out for clocks that go dark, run fast or wobble.',
    ],
    phoneHint: 'Your clock and STOP button show up on this phone.',
  },
  {
    id: 'admirer',
    holiday: 'valentines',
    title: 'Secret Admirer',
    emoji: '💌',
    tag: 'Versus',
    minutes: '6–8 min',
    minPlayers: 3,
    blurb: 'Write a sweet anonymous note to your secret valentine, then guess who wrote every note in the room.',
    how: [
      'Your phone gives you a secret valentine. Write them a sweet note. Try to sound like someone else!',
      'The notes are read out one by one. Guess who wrote each one on your phone.',
      'Right guesses score. Fool the room with your own note to score even more!',
    ],
    phoneHint: "Keep your phone close. Your secret valentine's name shows up here.",
  },
  {
    id: 'rainbow',
    holiday: 'stpatricks',
    title: 'Rainbow Run',
    emoji: '🌈',
    tag: 'Versus',
    minutes: '5–7 min',
    blurb: 'Climb the rainbow for gold, but head home before it falls. How lucky do you feel?',
    how: [
      'Every step, pick CLIMB or HEAD HOME on your phone. Climbers split the gold on each new step.',
      'Head home to bank your gold. Only banked gold counts!',
      'If the same hazard shows up twice, the rainbow falls and every climber drops their gold.',
    ],
    phoneHint: 'Your CLIMB and HEAD HOME buttons show up here.',
  },
];

// The quiz and the writing game take the name of the theme on now (see season.js): Thanksgiving Quiz,
// Sweetheart Quiz, Cookout Mash-up and so on. Outside Halloween they lead the list.
const theme = themeInfo();
for (let i = GAME_META.length - 1; i >= 0; i -= 1) {
  if (GAME_META[i].holiday && GAME_META[i].holiday !== theme.id) GAME_META.splice(i, 1);
}
if (theme.id !== 'spooky') {
  const themed = {
    quiz: {
      title: theme.quiz.title,
      emoji: theme.quiz.emoji,
      blurb: theme.quiz.blurb,
      how: [
        `A ${theme.quiz.kind} question pops up on the TV. The answers show on your phone.`,
        'Tap the right one, fast. The quicker you are, the more points you get.',
        'First right answer gets a bonus, three in a row is a Hot Streak, and Round 3 counts double.',
      ],
    },
    mash: {
      title: theme.mash.title,
      emoji: theme.mash.emoji,
      blurb: `Write the funniest answers to ${theme.mash.kind} prompts, then vote for the best.`,
      how: [
        `Your phone gives you a ${theme.mash.kind} prompt. Write something funny.`,
        'Answers go head to head on the TV. Nobody knows who wrote what.',
        `Everyone else votes. Every vote is points, and winning them all is a ${theme.mash.title}!`,
      ],
    },
  };
  GAME_META.forEach((g, i) => { if (themed[g.id]) GAME_META[i] = { ...g, ...themed[g.id] }; });
  GAME_META.sort((a, b) => (themed[b.id] ? 1 : 0) - (themed[a.id] ? 1 : 0));
  const special = GAME_META.findIndex((g) => g.holiday);
  if (special > 0) GAME_META.unshift(...GAME_META.splice(special, 1));
}

export const metaFor = (id) => GAME_META.find((g) => g.id === id) || GAME_META[0];
export const isPlayable = (id) => GAME_META.some((g) => g.id === id && !g.soon);

/** This holiday's own game, if it has one. */
export const HOLIDAY_GAME = GAME_META.find((g) => g.holiday) || null;
