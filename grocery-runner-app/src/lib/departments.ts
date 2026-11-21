import { Department } from './types';

/** Department walk order used when nothing better is known. Cold items are last. */
export const DEPARTMENT_ORDER: Department[] = [
  'produce',
  'bakery',
  'deli',
  'meat',
  'pantry',
  'health',
  'baby',
  'household',
  'pet',
  'other',
  'frozen',
  'dairy',
];

export const DEPARTMENT_LABEL: Record<Department, string> = {
  produce: 'Produce',
  bakery: 'Bakery',
  deli: 'Deli',
  meat: 'Meat & Seafood',
  pantry: 'Center aisles',
  household: 'Paper & cleaning',
  health: 'Health & beauty',
  baby: 'Baby',
  pet: 'Pet supplies',
  frozen: 'Frozen',
  dairy: 'Dairy',
  other: 'Other',
};

/**
 * Things bought on a grocery run that aren't food: paper goods and cleaning, pharmacy and health & beauty,
 * baby and pet. They sit in numbered aisles (Target and Walmart in the general merchandise side), so a
 * store's own aisle answers place them; until then the generic map puts them in aisles of their own.
 */
export const NON_FOOD_DEPARTMENTS: Department[] = ['household', 'health', 'baby', 'pet'];

export const COLD_DEPARTMENTS: Department[] = ['frozen', 'dairy'];

// Checked in order; first match wins. Each word also matches its plural ("tomato" → "tomatoes",
// "berry" → "berries"). Order matters:
//  1. "frozen" beats everything ("frozen broccoli").
//  2. Exceptions that a later, broader word would get wrong ("hamburger buns" is not meat, "black pepper"
//     is not produce, "salad mix" is produce even though "mix" is shelf-stable).
//  3. Shelf-stable forms: a seed, powder, sauce, broth or mix is in the center aisles whatever it is made
//     of ("celery seed", "chicken bouillon paste", "onion soup mix", "garlic powder").
//  4. Fresh departments by what the food is.
// Non-food comes right after frozen, so "shaving cream", "baby oil", "cough syrup" and "bird seed" never
// read as food. Words that are also food ("baby spinach", "hot dog", "rice paper") are never used bare.
const KEYWORDS: [Department, string[]][] = [
  ['frozen', ['frozen', 'ice cream', 'popsicle', 'ice pop', 'tater tot', 'pizza roll', 'frozen pizza', 'sherbet', 'gelato']],

  // Food that a non-food word below would take.
  ['dairy', ['vitamin d milk']],
  ['pantry', ['vitamin water', 'coffee filter', 'rice paper', 'birthday candle', 'cake candle']],
  ['household', ['disinfecting wipe', 'cleaning wipe', 'clorox wipe', 'lysol wipe', 'dish soap', 'dishwasher', 'dish detergent']],
  [
    'baby',
    [
      'diaper', 'baby wipe', 'wipe', 'baby food', 'baby formula', 'infant formula', 'formula', 'baby shampoo',
      'baby wash', 'baby lotion', 'baby oil', 'baby powder', 'baby bottle', 'baby cereal', 'baby puff', 'baby snack',
      'diaper cream', 'rash cream', 'pacifier', 'teether', 'sippy cup', 'pull up', 'pull-up', 'pullup', 'infant',
      'toddler', 'nursing pad', 'pedialyte',
    ],
  ],
  [
    'pet',
    [
      'pet', 'dog food', 'dog treat', 'dog toy', 'dog bone', 'dog chew', 'dog shampoo', 'puppy food', 'puppy pad', 'cat food', 'cat treat',
      'cat toy', 'cat litter', 'kitty litter', 'litter', 'kitten', 'kibble', 'rawhide', 'milk bone', 'flea',
      'bird seed', 'birdseed', 'fish food', 'hamster', 'guinea pig',
    ],
  ],
  [
    'health',
    [
      // pharmacy
      'pharmacy', 'prescription', 'medicine', 'medication', 'vitamin', 'multivitamin', 'gummy vitamin', 'supplement',
      'melatonin', 'probiotic', 'fish oil', 'ibuprofen', 'acetaminophen', 'aspirin', 'naproxen', 'tylenol', 'advil',
      'motrin', 'aleve', 'allergy', 'claritin', 'zyrtec', 'benadryl', 'antacid', 'tums', 'pepto', 'laxative',
      'cough drop', 'cough syrup', 'cough medicine', 'cold medicine', 'nyquil', 'dayquil', 'mucinex', 'nasal spray',
      'eye drop', 'contact solution', 'bandage', 'band aid', 'band-aid', 'bandaid', 'first aid', 'neosporin',
      'thermometer', 'heating pad', 'ice pack', 'pregnancy test', 'condom', 'hand sanitizer', 'sanitizer',
      // health & beauty
      'toothpaste', 'toothbrush', 'floss', 'mouthwash', 'shampoo', 'conditioner', 'dry shampoo', 'hair gel',
      'hairspray', 'hair spray', 'hair dye', 'hair tie', 'deodorant', 'antiperspirant', 'body wash', 'bar soap',
      'hand soap', 'soap', 'face wash', 'facial cleanser', 'lotion', 'moisturizer', 'hand cream', 'face cream',
      'sunscreen', 'sunblock', 'razor', 'shaving cream', 'shave gel', 'lip balm', 'chapstick', 'cotton ball',
      'cotton swab', 'q tip', 'q-tip', 'qtip', 'makeup', 'mascara', 'eyeliner', 'lipstick', 'foundation', 'nail polish',
      'nail file', 'tampon', 'pantyliner', 'panty liner', 'maxi pad', 'feminine', 'perfume', 'cologne',
    ],
  ],
  [
    'household',
    [
      // paper and plastic
      'paper towel', 'toilet paper', 'bath tissue', 'tissue', 'kleenex', 'napkin', 'paper plate', 'paper bowl',
      'paper cup', 'plastic cup', 'solo cup', 'plastic fork', 'plastic spoon', 'plastic utensil', 'plastic silverware',
      'drinking straw', 'trash bag', 'garbage bag', 'kitchen bag', 'aluminum foil', 'tin foil', 'foil', 'plastic wrap',
      'cling wrap', 'saran wrap', 'parchment', 'wax paper', 'ziploc', 'ziplock', 'zip lock', 'sandwich bag',
      'freezer bag', 'storage bag', 'snack bag', 'gallon bag', 'food storage', 'tupperware',
      // cleaning and laundry
      'laundry', 'detergent', 'fabric softener', 'dryer sheet', 'stain remover', 'oxiclean', 'bleach', 'sponge',
      'scrub brush', 'scrubber', 'steel wool', 'cleaner', 'cleaning', 'disinfectant', 'lysol', 'clorox', 'windex',
      'swiffer', 'mop', 'broom', 'dust pan', 'dustpan', 'duster', 'rubber glove', 'magic eraser', 'drain cleaner',
      'toilet bowl', 'air freshener', 'febreze', 'odor eliminator',
      // around the house
      'light bulb', 'lightbulb', 'battery', 'batteries', 'charcoal', 'lighter fluid', 'lighter', 'ice melt',
      'bug spray', 'insect repellent', 'mouse trap', 'trash can', 'candle', 'party supplies',
    ],
  ],

  ['pantry', ['tortilla chip', 'tortilla soup', 'bread crumb', 'breadcrumb', 'cake mix', 'bread mix', 'pie filling']],
  ['bakery', ['tortilla', 'hamburger bun', 'hot dog bun', 'slider bun', 'brioche bun']],
  ['produce', ['salad mix', 'spring mix', 'slaw mix', 'coleslaw mix', 'green bean', 'bean sprout', 'garlic clove']],
  ['dairy', ['chocolate milk', 'pepper jack', 'pizza dough', 'pie crust', 'crescent roll', 'biscuit dough', 'cookie dough', 'refrigerated']],
  ['deli', ['pepperoni', 'salami', 'prosciutto', 'deli', 'lunch meat', 'lunchmeat', 'cold cut', 'rotisserie', 'hummus']],
  [
    'pantry',
    [
      // peppers and spices that would otherwise read as produce or meat
      'black pepper', 'white pepper', 'peppercorn', 'red pepper flake', 'crushed red pepper', 'cayenne', 'lemon pepper',
      'ground ginger', 'ground clove', 'whole clove', 'ground mustard', 'dry mustard', 'garlic salt', 'onion salt',
      'celery salt', 'cumin', 'cinnamon', 'nutmeg', 'paprika', 'oregano', 'turmeric', 'allspice', 'coriander',
      'cardamom', 'bay leaf', 'bay leaves', 'chili powder', 'curry', 'seasoning', 'spice', 'rub',
      // shelf-stable forms
      'seed', 'powder', 'extract', 'bouillon', 'broth', 'stock', 'soup', 'paste', 'sauce', 'dressing', 'mix',
      'flake', 'vinegar', 'oil', 'syrup', 'jerky', 'canned', 'dried', 'dry', 'diced tomato', 'crushed tomato',
      'stewed tomato', 'tomato puree', 'sun dried', 'cream of', 'coconut milk', 'evaporated milk', 'condensed milk',
      'powdered milk', 'peanut butter', 'almond butter', 'apple butter', 'cookie butter', 'applesauce', 'juice',
      // dry goods
      'pasta', 'noodle', 'spaghetti', 'macaroni', 'penne', 'fettuccine', 'linguine', 'lasagna', 'rice', 'quinoa',
      'oat', 'oatmeal', 'cereal', 'granola', 'cracker', 'chip', 'pretzel', 'popcorn', 'cookie', 'bean', 'lentil',
      'chickpea', 'flour', 'sugar', 'salt', 'cornstarch', 'cornmeal', 'baking soda', 'baking powder', 'yeast',
      'breadcrumb', 'bread crumb', 'crouton', 'panko', 'nut', 'almond', 'walnut', 'pecan', 'peanut', 'cashew',
      'pistachio', 'raisin', 'chocolate', 'cocoa', 'honey', 'jam', 'jelly', 'ketchup', 'mustard', 'mayo',
      'mayonnaise', 'salsa', 'pickle', 'olive', 'tuna', 'coffee', 'tea', 'soda', 'water', 'taco shell',
      'tortilla chip', 'marshmallow', 'sprinkles', 'gelatin', 'jello', 'pudding',
    ],
  ],

  ['dairy', ['milk', 'buttermilk', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'ricotta', 'feta', 'yogurt', 'butter', 'margarine', 'egg', 'cream', 'half and half', 'creamer', 'cottage']],
  [
    'meat',
    [
      'chicken', 'beef', 'pork', 'steak', 'bacon', 'sausage', 'turkey', 'ground', 'hamburger', 'roast', 'brisket',
      'meatball', 'hot dog', 'bratwurst', 'brat', 'chorizo', 'lamb', 'veal', 'ham', 'ribs', 'tenderloin', 'sirloin',
      'drumstick', 'thigh', 'wing', 'fish', 'salmon', 'shrimp', 'tilapia', 'cod', 'crab', 'lobster', 'scallop', 'meat',
    ],
  ],
  ['bakery', ['bread', 'bagel', 'bun', 'roll', 'muffin', 'croissant', 'tortilla', 'cake', 'donut', 'doughnut', 'baguette', 'pita', 'naan', 'pie']],
  [
    'produce',
    [
      'apple', 'banana', 'lettuce', 'romaine', 'tomato', 'onion', 'shallot', 'scallion', 'leek', 'potato', 'yam',
      'carrot', 'pepper', 'jalapeno', 'jalapeño', 'avocado', 'lemon', 'lime', 'orange', 'grapefruit', 'clementine',
      'berry', 'strawberry', 'blueberry', 'raspberry', 'blackberry', 'cranberry', 'grape', 'cherry', 'peach',
      'nectarine', 'pear', 'plum', 'mango', 'pineapple', 'melon', 'watermelon', 'cantaloupe', 'kiwi', 'spinach',
      'kale', 'arugula', 'cabbage', 'bok choy', 'celery', 'cucumber', 'zucchini', 'squash', 'eggplant', 'garlic',
      'ginger', 'broccoli', 'cauliflower', 'asparagus', 'brussels sprout', 'corn', 'mushroom', 'salad', 'herb',
      'cilantro', 'parsley', 'basil', 'thyme', 'rosemary', 'dill', 'mint', 'sage', 'chive', 'radish', 'beet',
      'tofu', 'fruit', 'vegetable', 'veggie', 'okra', 'artichoke', 'sprout',
    ],
  ],
];

const plural = (w: string) => (/[^aeiou]y$/.test(w) ? `(?:${w}|${w.slice(0, -1)}ies)` : `${w}(?:e?s)?`);
const PATTERNS: [Department, RegExp][] = KEYWORDS.map(([dept, words]) => [
  dept,
  new RegExp(`(?:^|[^a-z])(?:${words.map(plural).join('|')})(?![a-z])`),
]);

/** The department an item's name clearly points to, or null when no keyword matches. */
export function matchDepartment(name: string): Department | null {
  const text = name.toLowerCase().normalize('NFC');
  for (const [dept, pattern] of PATTERNS) if (pattern.test(text)) return dept;
  return null;
}

/** Best guess at a department from an item's name. Falls back to the center aisles. */
export function guessDepartment(name: string): Department {
  return matchDepartment(name) ?? 'pantry';
}

/** Maps a Kroger product category (e.g. "Dairy", "Frozen") to our department. */
export function departmentFromKrogerCategory(category: string | undefined): Department | null {
  if (!category) return null;
  const c = category.toLowerCase();
  if (c.includes('frozen')) return 'frozen';
  if (c.includes('dairy')) return 'dairy';
  if (c.includes('produce')) return 'produce';
  if (c.includes('bakery')) return 'bakery';
  if (c.includes('deli')) return 'deli';
  if (c.includes('meat') || c.includes('seafood')) return 'meat';
  if (c.includes('baby')) return 'baby';
  if (c.includes('pet')) return 'pet';
  if (/health|beauty|personal care|pharmacy|medicine|vitamin|oral care|hair care|skin care|bath/.test(c)) return 'health';
  if (/cleaning|household|paper|laundry|kitchen supplies|party/.test(c)) return 'household';
  return 'pantry';
}
