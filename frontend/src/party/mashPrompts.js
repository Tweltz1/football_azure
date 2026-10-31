// Monster Mash-up prompts: silly, family friendly Halloween writing prompts.

export const PROMPTS = [
  'The worst thing to find in your trick-or-treat bag',
  'A terrible name for a haunted house',
  'What the mummy is really hiding under all those bandages',
  "Dracula's secret hobby",
  'The worst costume to wear to a job interview',
  'What a ghost writes in its diary',
  "A werewolf's least favorite chore",
  'The real reason zombies walk so slowly',
  'A new flavor of candy corn nobody asked for',
  "Frankenstein's monster's dating profile headline",
  "What the skeleton's text message said",
  'The worst thing a witch could put in her cauldron',
  'A rejected name for a Halloween candy bar',
  "Something you'd never want to hear a haunted doll say",
  'The scariest thing about the Hood League draft',
  'A spooky new rule for fantasy football',
  "What the black cat is actually thinking",
  'The worst spell to cast by accident',
  'A pumpkin\'s biggest fear',
  'The title of a horror movie about a group chat',
  'The worst sound to hear in the attic',
  "A vampire's favorite pizza topping",
  'What ghosts do for fun on a Tuesday',
  'A new Halloween tradition that would ruin everything',
  'The worst thing to say while carving a pumpkin',
  'What the bats are gossiping about',
  "The name of the zombie's band",
  'The most useless superpower for a monster',
  'What the monster under the bed does all day',
  'The worst house on the block gives out...',
  "A haunted house's online review",
  'What a witch\'s broom would say if it could talk',
  'The scariest thing to find in your fridge on Halloween',
  "A mummy's go-to excuse for being late",
  'The worst place to hide during hide-and-seek in a graveyard',
  'A horror movie that would be way less scary with a dog in it',
  'Something you should never put on a jack-o\'-lantern',
  "The werewolf's favorite song",
  'The first thing a ghost would buy online',
  'What the haunted house\'s Wi-Fi password is',
  "Dracula's biggest pet peeve",
  "The worst thing to yell in a haunted corn maze",
  'A name for a monster made entirely of leftover candy',
  "What a zombie orders at a drive-thru",
  'The spookiest thing your coach could say at halftime',
  "A skeleton's worst nightmare",
  "The real reason the headless horseman lost his head",
  'An unpopular Halloween costume idea for your pet',
  'What the spider is building instead of a web',
  'The worst text to get from a ghost at 3 a.m.',
  'A monster that would be terrible at its job',
  "The mummy's favorite sport",
  'Something a vampire would never admit',
  'A sign you\'re in a horror movie',
  'The worst candy to hand out, according to every kid ever',
];

export const FINAL_PROMPTS = [
  'Write the opening line of the scariest story ever told',
  'Invent a brand new Halloween monster. What is it called?',
  'The one thing that would make Halloween even better',
  'Write a spooky new rule for the Hood League',
  "Describe this room's most likely monster in five words",
  'The best excuse for eating all of the Halloween candy',
  'Name the haunted house this whole crew would run',
];

// Kept PG-13: a short list of words that get masked on the TV. Answers stay playful, not crude.
const MASK = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard', 'slut', 'whore', 'nigg', 'fag', 'retard', 'beer', 'weed', 'vodka', 'whiskey', 'blunt', 'cigarette', 'vape'];

export const clean = (text) => {
  let out = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  MASK.forEach((w) => {
    out = out.replace(new RegExp(`${w}\\w*`, 'gi'), (m) => `${m[0]}${'*'.repeat(Math.max(2, m.length - 1))}`);
  });
  return out;
};
