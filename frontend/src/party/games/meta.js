// What the lobby shows about each game. Light on purpose: the phone page imports this too.

export const GAME_META = [
  {
    id: 'candle',
    title: 'Last Candle',
    emoji: '🕯️',
    tag: 'Co-op',
    minutes: '6–8 min',
    blurb: 'Keep the candles lit until dawn. Work together, shout a lot.',
    how: [
      'Monsters walk up the paths. Each shows the charms that banish it.',
      'Your phone holds 3 charms. Tap one to throw it. Throw a charm nobody needs and you get spooked.',
      'Shout! “Who has garlic?!” Fog hides some monsters, and only one phone can see through it.',
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
    title: 'Haunted Hallway',
    emoji: '🚪',
    tag: 'Co-op',
    minutes: '6–10 min',
    blurb: 'Pick the safe door together. Only the guides know the clues.',
    soon: true,
  },
  {
    id: 'mask',
    title: "Who's Behind the Mask?",
    emoji: '🎭',
    tag: 'Versus',
    minutes: '10–15 min',
    blurb: 'One of you is a secret vampire. Give clues, then vote them out.',
    soon: true,
  },
];

export const metaFor = (id) => GAME_META.find((g) => g.id === id) || GAME_META[0];
export const isPlayable = (id) => GAME_META.some((g) => g.id === id && !g.soon);
