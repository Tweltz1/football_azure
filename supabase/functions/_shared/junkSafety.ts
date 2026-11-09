// Curbsy listing rules: things that can't be given away on a public app (App Store guideline 1.2 and the
// Terms at /junk-terms.html), checked against what people type and what the phone's photo labels say.
// Free and instant: plain word rules, no paid service. Reports, blocks and the daily review catch the rest.
//
// Each rule is a list of words or phrases (matched as whole words, plurals included). Everyday things that
// share a word are let through first: "glue gun", "wine rack", "dog crate", "weed eater", "medicine cabinet".

export interface SafetyRule {
  key: string;
  /** Shown to the poster. */
  reason: string;
  words: string[];
  /** Phrases that make a match fine ("glue gun"). */
  allow?: string[];
  /** A match is fine when the very next word is one of these ("wine" + "rack", "dog" + "crate"). */
  okNext?: string[];
  /** A match is fine when the word just before is one of these ("toy" + "gun", "stuffed" + "dog"). */
  okPrev?: string[];
}

const TOYISH = ['toy', 'toys', 'nerf', 'water', 'squirt', 'bubble', 'plush', 'stuffed', 'ceramic', 'statue', 'figurine', 'lawn', 'garden', 'decor', 'decorative', 'wooden', 'lego', 'cap'];
const PET_GEAR = [
  'bed', 'beds', 'crate', 'crates', 'cage', 'cages', 'kennel', 'kennels', 'house', 'houses', 'food', 'bowl', 'bowls', 'toy', 'toys',
  'leash', 'leashes', 'collar', 'collars', 'carrier', 'carriers', 'gate', 'gates', 'door', 'ramp', 'ramps', 'tank', 'tanks',
  'aquarium', 'tree', 'trees', 'tower', 'litter', 'harness', 'feeder', 'feeders', 'fence', 'run', 'coop', 'coops', 'pen', 'pens',
  'hutch', 'hutches', 'stroller', 'blanket', 'mat', 'scratcher', 'scratching', 'post', 'condo', 'clothes', 'sweater', 'shampoo',
  'brush', 'bath', 'waterer', 'heater', 'lamp', 'stand', 'trailer', 'wire', 'netting', 'supplies', 'stuff', 'gear', 'kit',
  'fountain', 'box', 'boxes', 'flap', 'perch', 'swing', 'seed', 'decoy', 'decoys', 'figurine', 'statue', 'print', 'pillow',
  'finder', 'finders', 'net', 'nets', 'pond', 'fryer', 'tape', 'lure', 'lures', 'hook', 'hooks', 'boots', 'boot', 'call', 'calls',
  'float', 'floats', 'floaty', 'pool', 'mold', 'molds', 'plate', 'plates', 'puzzle', 'book', 'books', 'costume', 'mask', 'ornament',
  'ornaments', 'pads', 'pad', 'diapers', 'wash', 'tags', 'tag', 'door', 'sign', 'mug', 'shirt', 'painting', 'picture', 'poster',
];
const DRINK_GEAR = [
  'glass', 'glasses', 'rack', 'racks', 'fridge', 'refrigerator', 'cooler', 'chiller', 'cabinet', 'cart', 'sign', 'signs',
  'opener', 'openers', 'mug', 'mugs', 'stein', 'steins', 'pong', 'table', 'decanter', 'aerator', 'stopper', 'stoppers',
  'bucket', 'barrel', 'tap', 'tower', 'making', 'brewing', 'kit', 'cork', 'corks', 'holder', 'shelf', 'bottles', 'carafe',
  'pitcher', 'tub', 'caddy', 'crate', 'crates', 'box', 'boxes', 'koozie', 'koozies', 'bong', 'cozy', 'barrels', 'cask', 'set',
];

const ANIMAL_REASON = 'Live animals can\'t be given away on Curbsy (pet gear like crates and beds is fine).';

export const SAFETY_RULES: SafetyRule[] = [
  {
    key: 'weapons',
    reason: 'Weapons, ammunition and their parts can\'t be listed on Curbsy.',
    words: [
      'gun', 'guns', 'firearm', 'rifle', 'pistol', 'handgun', 'shotgun', 'revolver', 'ammo', 'ammunition', 'bullet', 'bullets',
      'gun magazine', 'ar15', 'ar 15', 'ak47', 'ak 47', 'glock', 'silencer', 'suppressor',
      'gunpowder', 'black powder', 'switchblade', 'butterfly knife', 'balisong', 'brass knuckles', 'knuckle duster', 'stun gun',
      'taser', 'pepper spray', 'mace spray', 'nunchucks', 'nunchaku', 'throwing star', 'throwing stars', 'crossbow',
      'bb gun', 'pellet gun', 'airsoft', 'paintball gun', 'grenade', 'explosive', 'explosives', 'dynamite', 'blackjack baton',
      'brass knuckle', 'sword cane', 'gun parts', 'lower receiver', 'upper receiver', 'bump stock', ],
    allow: [
      'glue gun', 'hot glue gun', 'heat gun', 'nail gun', 'staple gun', 'stapler gun', 'spray gun', 'paint gun', 'caulk gun',
      'caulking gun', 'grease gun', 'massage gun', 'water gun', 'squirt gun', 'nerf gun', 'nerf guns', 'toy gun', 'toy guns',
      'bubble gun', 'cap gun', 'foam gun', 'label gun', 'price gun', 'tape gun', 'soldering gun', 'rivet gun', 'air gun nozzle',
      'blow gun', 'impact gun', 'grout gun', 'texture gun', 'hopper gun', 'foam gun', 'radar gun', 'temperature gun', 'temp gun',
      'thermometer gun', 'laser tag', 'top gun', 'gun safe', 'gun safes', 'gun cabinet', 'gun cabinets', 'gun rack', 'magazine rack',
      'magazine holder', 'rifle scope cover', 'bullet journal', 'bullet points', 'bullet blender', 'magic bullet', 'nutribullet',
      'silver bullet', 'bullet planter', 'bullet bass', 'fire extinguisher', 'spray gun paint',
    ],
    okNext: ['grip', 'grips', 'sprayer', 'nozzle', 'safe', 'safes', 'cabinet', 'rack', 'case', 'cases'],
    okPrev: TOYISH,
  },
  {
    key: 'drugs',
    reason: 'Drugs, cannabis and drug gear can\'t be listed on Curbsy.',
    words: [
      'marijuana', 'cannabis', 'weed', 'thc', 'cbd', 'delta 8', 'delta8', 'edibles', 'cocaine', 'coke baggie', 'crack pipe',
      'heroin', 'meth', 'methamphetamine', 'mdma', 'ecstasy', 'lsd', 'acid tabs', 'shrooms', 'magic mushrooms',
      'psilocybin', 'kratom', 'fentanyl', 'ketamine', 'dmt', 'bong', 'bongs', 'dab rig', 'dab rigs', 'one hitter', 'weed pipe',
      'pot pipe', 'pre rolls', 'grow tent for weed',
    ],
    allow: [
      'weed eater', 'weed eaters', 'weed whacker', 'weed whackers', 'weed wacker', 'weed trimmer', 'weed trimmers', 'weed killer',
      'weed barrier', 'weed block', 'weed fabric', 'weed puller', 'weed pullers', 'weed torch', 'weed burner', 'weed control',
      'weed and feed', 'weed n feed', 'weed preventer', 'weed cutter', 'weed sprayer', 'weed digger', 'weed remover', 'weed tool',
      'coke bottle', 'coke bottles', 'coca cola', 'diet coke', 'coke machine', 'coke sign', 'acid free', 'acid wash', 'battery acid',
      'beer bong', 'water pipe fitting', 'water pipe fittings', 'drug store', 'drugstore', 'molly bolt', 'molly bolts', 'molly anchors',
      'nitrous oxide sensor', 'meth lab kit', 'joints compound', 'joint compound', 'blunt tip', 'blunt scissors', 'blunt end',
      'blunt nose',
    ],
  },
  {
    key: 'alcohol',
    reason: 'Alcohol can\'t be given away on Curbsy (empty bottles, glasses and bar gear are fine).',
    words: [
      'beer', 'beers', 'wine', 'wines', 'liquor', 'booze', 'vodka', 'whiskey', 'whisky', 'bourbon', 'scotch', 'rum', 'tequila',
      'gin', 'brandy', 'cognac', 'champagne', 'prosecco', 'moonshine', 'hard seltzer', 'white claw', 'six pack of', 'case of beer',
      'mezcal', 'schnapps', 'liqueur', 'hard cider', 'malt liquor',
    ],
    allow: [
      'empty bottles', 'empty bottle', 'empty wine bottles', 'empty beer bottles', 'root beer', 'ginger beer', 'butterbeer', 'wine colored',
      'wine red', 'gin rummy', 'scotch tape', 'scotch brite', 'scotchgard', 'rum raisin', 'cotton gin', 'beer can chicken',
      'champagne color', 'champagne colored', 'champagne gold', 'champagne flutes', 'whiskey barrel planter', 'wine barrel planter',
      'cooking wine', 'wine bottle opener', 'scotch whisky glasses',
    ],
    okNext: [...DRINK_GEAR, 'flutes', 'flute', 'stones', 'colored', 'color', 'decor', 'crates', 'bottle opener', 'empties', 'empty', 'labels', 'tins'],
    okPrev: ['empty', 'toy', 'pretend', 'play', 'scotch'],
  },
  {
    key: 'tobacco',
    reason: 'Tobacco, vapes and nicotine can\'t be listed on Curbsy.',
    words: [
      'cigarette', 'cigarettes', 'cigar', 'cigars', 'tobacco', 'nicotine', 'vape', 'vapes', 'vaping', 'e cig', 'ecig', 'e cigarette',
      'juul', 'juuls', 'hookah', 'snus', 'chewing tobacco', 'dip cans', 'zyn', 'zyns', 'puff bar', 'elf bar', 'disposable vape',
    ],
    allow: ['cigar box', 'cigar boxes', 'cigarette lighter adapter', 'cigarette lighter charger', 'cigarette lighter plug', 'cigar box guitar'],
    okNext: ['box', 'boxes', 'humidor', 'lighter adapter', 'tin', 'tins'],
  },
  {
    key: 'medicine',
    reason: 'Medicine, prescriptions and medical sharps can\'t be listed on Curbsy.',
    words: [
      'prescription', 'prescriptions', 'pills', 'medication', 'medications', 'medicine', 'medicines', 'insulin', 'antibiotic',
      'antibiotics', 'steroid', 'steroids', 'xanax', 'adderall', 'oxycodone', 'oxycontin', 'percocet', 'vicodin', 'hydrocodone',
      'opioid', 'opioids', 'tramadol', 'valium', 'ambien', 'klonopin', 'suboxone', 'methadone', 'ozempic', 'wegovy', 'syringe',
      'syringes', 'hypodermic', 'needles for injection', 'epipen', 'epi pen', 'viagra', 'cialis', 'painkillers', 'pain killers',
      'sleeping pills', 'diet pills', 'testosterone',
    ],
    allow: [
      'medicine cabinet', 'medicine cabinets', 'medicine chest', 'medicine ball', 'medicine balls', 'pill organizer', 'pill box',
      'pill bottle', 'pills bottle', 'rx 7', 'rx7', 'rx 8', 'rx8', 'prescription glasses', 'prescription sunglasses',
      'prescription lenses', 'pill organizers', 'medication organizer', 'medication box', 'medication lock box',
    ],
    okNext: ['cabinet', 'cabinets', 'chest', 'ball', 'balls', 'organizer', 'organizers', 'box', 'boxes', 'bag', 'bags', 'case', 'cases', 'lock', 'glasses', 'sunglasses', 'lenses', 'bottle', 'bottles', 'shelf'],
  },
  {
    key: 'adult',
    reason: 'Adult or sexual items can\'t be listed on Curbsy.',
    words: [
      'porn', 'porno', 'pornography', 'xxx', 'nude', 'nudes', 'nsfw', 'sex toy', 'sex toys', 'dildo', 'dildos', 'fleshlight',
      'butt plug', 'onlyfans', 'only fans', 'sugar daddy', 'erotic',
      'adult toy', 'adult toys', 'adult video', 'adult videos', 'adult dvd', 'adult dvds', 'adult magazine', 'adult magazines', 'playboy',
      'hustler magazine', 'penthouse magazine', 'used panties', 'worn panties', 'used underwear', 'worn underwear', 'used socks for',
      'fetish', 'bdsm', 'sexy pics', 'cam girl', 'sexting',
    ],
    allow: ['nude color', 'nude colored', 'nude heels', 'nude pumps', 'nude lipstick', 'nude shoes', 'nude sandals', 'nude flats', 'naked eye', 'barenaked', 'escort car', 'ford escort'],
    okNext: ['color', 'colored', 'heels', 'pumps', 'lipstick', 'shoes', 'sandals', 'flats', 'boots', 'tone', 'tones', 'palette', 'eyeshadow', 'blush', 'nail', 'polish', 'bra', 'bras', 'eye'],
  },
  {
    // Checked everywhere, descriptions included: words that only ever mean a live animal.
    key: 'animals',
    reason: ANIMAL_REASON,
    words: [
      'puppy', 'puppies', 'kitten', 'kittens', 'ducklings', 'piglets', 'live animal', 'live animals', 'for adoption',
      'litter of puppies', 'litter of kittens', 'baby chicks', 'pet for free', 'free pet', 'free pets',
    ],
    allow: ['puppy pads', 'puppy pad', 'puppy gate', 'puppy pen', 'kitten heels', 'kitten heel'],
    okNext: PET_GEAR,
    okPrev: TOYISH,
  },
  {
    // Checked in titles, item names and tags only ("my dog chewed one leg" in a description is fine).
    key: 'animal_names',
    reason: ANIMAL_REASON,
    words: [
      'dog', 'dogs', 'cat', 'cats', 'rabbit', 'rabbits', 'bunny', 'bunnies', 'hamster', 'hamsters', 'guinea pig', 'guinea pigs',
      'ferret', 'ferrets', 'gerbil', 'gerbils', 'rat', 'rats', 'parrot', 'parrots', 'parakeet', 'parakeets', 'budgie', 'budgies',
      'cockatiel', 'cockatiels', 'chick', 'chicks', 'chicken', 'chickens', 'hen', 'hens', 'rooster', 'roosters', 'duck', 'ducks',
      'goat', 'goats', 'piglet', 'horse', 'horses', 'pony', 'ponies', 'snake', 'snakes', 'python', 'lizard', 'lizards', 'gecko',
      'geckos', 'iguana', 'bearded dragon', 'turtle', 'turtles', 'tortoise', 'tortoises', 'fish', 'goldfish', 'betta', 'koi',
      'tarantula', 'hedgehog', 'chinchilla', 'cockatoo', 'rehome', 'rehoming',
    ],
    allow: [
      'hot dog', 'hot dogs', 'corn dog', 'dog eared', 'dog ear', 'cat eye', 'cat eyes', 'cat5', 'cat 5', 'cat6', 'cat 6', 'cat 5e',
      'cat cable', 'cat ladder', 'cat litter', 'catwalk', 'cat walk', 'rat rod', 'rat tail comb', 'pig iron', 'piggy bank',
      'turtle sandbox', 'turtle shell sandbox', 'turtle wax', 'snake light', 'drain snake', 'plumbing snake', 'plumbers snake',
      'plumber snake', 'toilet snake', 'auger snake', 'horse trailer', 'saw horse', 'sawhorse', 'saw horses', 'sawhorses',
      'rocking horse', 'hobby horse', 'horse shoe', 'horseshoe', 'horseshoes', 'horse shoes', 'horsepower', 'charley horse',
      'lamb chop', 'calf sleeve', 'calf sleeves', 'chicken wire', 'chicken coop', 'chicken feeder', 'rubber chicken', 'koi pond',
      'pony tail', 'ponytail', 'dog days', 'hen and chicks', 'hens and chicks', 'goldfish crackers', 'mouse pad', 'computer mouse',
      'python book', 'monty python', 'bunny ears', 'easter bunny', 'bunny slippers', 'snake plant', 'snake plants', 'cat palm',
      'pig tail', 'pigtail', 'dog tags', 'dog tag', 'cat tree', 'cat trees', 'dog house', 'big wheel', 'piggyback', 'cattail',
      'cattails', 'bearded dragon tank', 'pug life', 'cat scratcher', 'pony wall', 'dog leg', 'catfish lure',
    ],
    okNext: PET_GEAR,
    okPrev: [...TOYISH, 'rocking', 'hobby', 'saw', 'hot', 'corn', 'drain', 'plumbing', 'rubber', 'stick', 'pool', 'my', 'no', 'not', 'without', 'friendly'],
  },
  {
    key: 'recalled',
    reason: 'Recalled or banned baby gear and hazardous materials can\'t be listed on Curbsy.',
    words: [
      'drop side crib', 'drop side cribs', 'dropside crib', 'drop down crib', 'rock n play', 'rock and play', 'rock n\' play',
      'inclined sleeper', 'infant sleeper incline', 'sleep positioner', 'sleep positioners', 'crib bumper', 'crib bumpers',
      'bumper pads for crib', 'baby walker with wheels', 'lawn darts', 'magnet balls', 'buckyballs', 'fireworks', 'firework',
      'gasoline', 'kerosene', 'asbestos', 'mercury thermometer', 'propane tank full', 'full propane', 'lead paint', 'radioactive', 'used car seat expired', 'expired car seat', 'breast milk',
      'human milk', 'baby formula opened',
    ],
    allow: [],
  },
  {
    key: 'hate',
    reason: 'Hateful or abusive language isn\'t allowed on Curbsy.',
    words: [
      'nigger', 'niggers', 'nigga', 'niggas', 'faggot', 'faggots', 'fag', 'fags', 'kike', 'kikes', 'spic', 'spics', 'chink', 'chinks',
      'wetback', 'wetbacks', 'tranny', 'trannies', 'retard', 'retards', 'retarded', 'gook', 'gooks', 'raghead', 'towelhead', 'beaner',
      'beaners', 'coon', 'coons', 'cunt', 'cunts', 'nazi', 'kkk', 'heil hitler', 'white power', 'kill yourself', 'kys',
    ],
    allow: ['raccoon', 'coon hound', 'coonhound', 'flame retardant', 'fire retardant', 'retardant'],
    okNext: ['hound', 'hounds', 'dog'],
  },
  {
    key: 'swearing',
    reason: 'Keep the language clean. Listings are public.',
    words: ['fuck', 'fucking', 'fucker', 'fucked', 'motherfucker', 'shit', 'shitty', 'bullshit', 'bitch', 'bitches', 'asshole', 'dickhead', 'whore', 'whores', 'slut', 'sluts', 'pussy'],
    allow: ['pussy willow', 'pussy willows'],
  },
];

/** Rules that also apply to private chat messages (the rest only matter for public listings). */
export const CHAT_RULES = ['hate'];

// Look-alike characters inside a word ("w33d", "p0rn", "c@nnabis"). Only these, so "cat5" or "2x4" stay as they are.
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '@': 'a', '$': 's' };

/** Lower-case words with punctuation and look-alike spellings ("w33d", "g.u.n") flattened. */
export function safetyWords(text: string): string[] {
  const flat = text.toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    // Single letters split by dots or dashes ("g.u.n", "c-b-d") join up; "t-shirt" stays.
    .replace(/\b[a-z](?:[.\-_*][a-z])+\b/g, (m) => m.replace(/[.\-_*]/g, ''))
    .replace(/['’]/g, '');
  return flat.split(/[^a-z0-9@$]+/).filter(Boolean)
    .map((w) => (/[a-z]/.test(w) ? w.replace(/(?<=[a-z@$0-9])[013@$](?=[a-z@$0-9]*[a-z])|^[@$](?=[a-z])/g, (c) => LEET[c] ?? c) : w))
    .map((w) => w.replace(/[@$]/g, ''))
    .filter(Boolean);
}

const phraseWords = (p: string) => safetyWords(p);
const startsAt = (words: string[], at: number, phrase: string[]) => phrase.every((w, k) => words[at + k] === w);

export interface SafetyHit { key: string; reason: string; word: string }

/** The first rule the text breaks, or null when it's fine. `only` limits the check to some rules. */
export function checkText(text: string, only?: string[]): SafetyHit | null {
  const words = safetyWords(text);
  if (!words.length) return null;
  for (const rule of SAFETY_RULES) {
    if (only && !only.includes(rule.key)) continue;
    // Words covered by an allowed phrase don't count.
    const covered = new Set<number>();
    for (const a of rule.allow ?? []) {
      const p = phraseWords(a);
      for (let i = 0; i + p.length <= words.length; i++) if (startsAt(words, i, p)) for (let k = 0; k < p.length; k++) covered.add(i + k);
    }
    for (const w of rule.words) {
      const p = phraseWords(w);
      for (let i = 0; i + p.length <= words.length; i++) {
        if (!startsAt(words, i, p)) continue;
        if (p.some((_, k) => covered.has(i + k))) continue;
        const next = words[i + p.length];
        const prev = words[i - 1];
        if (next && rule.okNext?.includes(next)) continue;
        if (prev && rule.okPrev?.includes(prev)) continue;
        return { key: rule.key, reason: rule.reason, word: w };
      }
    }
  }
  return null;
}

/** Labels the phone's photo classifier gave (Apple Vision), at or above this confidence, are checked too. */
export const LABEL_MIN_CONFIDENCE = 0.5;
/** Photo label rules: only the clear-cut ones (a dog lying next to a couch shouldn't stop the post). */
export const LABEL_RULES = ['weapons', 'drugs', 'tobacco', 'adult'];
