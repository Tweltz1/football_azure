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
];

// The quiz and the writing game take the name of the theme on now (see season.js): Thanksgiving Quiz,
// Sweetheart Quiz, Cookout Mash-up and so on. Outside Halloween they lead the list.
const theme = themeInfo();
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
}

export const metaFor = (id) => GAME_META.find((g) => g.id === id) || GAME_META[0];
export const isPlayable = (id) => GAME_META.some((g) => g.id === id && !g.soon);
