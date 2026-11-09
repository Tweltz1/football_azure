import { itemKey } from './sharedAisles';

export type RecipeItem = {
  /** What to look for in the store, e.g. "yellow onion". */
  item: string;
  /** Amount the recipe needs, e.g. "2 cups". Shown only; the list holds item names. */
  amount: string;
  /** A staple most kitchens already have; left unticked so it isn't added by default. */
  pantry: boolean;
};

export type Recipe = {
  id: string;
  title: string;
  servings: string;
  minutes?: number;
  tags?: string[];
  items: RecipeItem[];
  /** "suggested" ships with the app; "mine" came from a photo, link or pasted text. */
  source: 'suggested' | 'mine';
};

/** Recipe items not already on the list (by normalised name), in recipe order, without repeats. */
export function newItems(names: string[], onList: string[]): string[] {
  const seen = new Set(onList.map(itemKey));
  const out: string[] = [];
  for (const name of names) {
    const key = itemKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out;
}

const i = (item: string, amount = '', pantry = false): RecipeItem => ({ item, amount, pantry });
const p = (item: string, amount = '') => i(item, amount, true);

/** Weeknight recipes that ship with the app, so suggestions work offline and cost nothing. */
export const SUGGESTED: Recipe[] = [
  {
    id: 's-tacos',
    title: 'Ground beef tacos',
    servings: '4 servings',
    minutes: 25,
    tags: ['quick', 'kid friendly'],
    items: [
      i('ground beef', '1 lb'),
      i('taco shells', '12'),
      i('taco seasoning', '1 packet'),
      i('shredded cheddar cheese', '1 cup'),
      i('iceberg lettuce', '1 small head'),
      i('tomatoes', '2'),
      i('sour cream', '1/2 cup'),
      i('salsa', '1 jar'),
    ],
    source: 'suggested',
  },
  {
    id: 's-stirfry',
    title: 'Chicken and broccoli stir-fry',
    servings: '4 servings',
    minutes: 30,
    tags: ['quick', 'healthy'],
    items: [
      i('boneless chicken breast', '1.5 lb'),
      i('broccoli', '2 crowns'),
      i('soy sauce', '1/3 cup'),
      i('fresh ginger', '1 inch'),
      i('garlic', '3 cloves'),
      i('cornstarch', '1 tbsp'),
      i('jasmine rice', '2 cups'),
      i('green onions', '1 bunch'),
      p('vegetable oil', '2 tbsp'),
      p('sugar', '1 tbsp'),
    ],
    source: 'suggested',
  },
  {
    id: 's-spaghetti',
    title: 'Spaghetti with meat sauce',
    servings: '6 servings',
    minutes: 40,
    tags: ['kid friendly', 'classic'],
    items: [
      i('spaghetti', '1 lb'),
      i('ground beef', '1 lb'),
      i('marinara sauce', '24 oz jar'),
      i('yellow onion', '1'),
      i('garlic', '3 cloves'),
      i('parmesan cheese', 'for serving'),
      i('garlic bread', '1 loaf'),
      p('olive oil', '1 tbsp'),
      p('salt'),
    ],
    source: 'suggested',
  },
  {
    id: 's-sheetpan',
    title: 'Sheet-pan sausage and vegetables',
    servings: '4 servings',
    minutes: 35,
    tags: ['one pan', 'quick'],
    items: [
      i('smoked sausage', '14 oz'),
      i('baby potatoes', '1.5 lb'),
      i('bell peppers', '2'),
      i('red onion', '1'),
      i('zucchini', '2'),
      i('italian seasoning', '2 tsp'),
      p('olive oil', '3 tbsp'),
      p('salt'),
      p('black pepper'),
    ],
    source: 'suggested',
  },
  {
    id: 's-chili',
    title: 'Easy beef chili',
    servings: '6 servings',
    minutes: 50,
    tags: ['one pot', 'freezer friendly'],
    items: [
      i('ground beef', '1.5 lb'),
      i('kidney beans', '2 cans'),
      i('diced tomatoes', '28 oz can'),
      i('tomato sauce', '15 oz can'),
      i('yellow onion', '1'),
      i('chili powder', '3 tbsp'),
      i('shredded cheddar cheese', 'for topping'),
      i('sour cream', 'for topping'),
      p('ground cumin', '2 tsp'),
      p('salt'),
    ],
    source: 'suggested',
  },
  {
    id: 's-salmon',
    title: 'Lemon garlic salmon with asparagus',
    servings: '4 servings',
    minutes: 25,
    tags: ['healthy', 'quick'],
    items: [
      i('salmon fillets', '4'),
      i('asparagus', '1 bunch'),
      i('lemons', '2'),
      i('garlic', '4 cloves'),
      i('unsalted butter', '3 tbsp'),
      i('fresh parsley', '1 bunch'),
      p('olive oil', '2 tbsp'),
      p('salt'),
      p('black pepper'),
    ],
    source: 'suggested',
  },
  {
    id: 's-burgers',
    title: 'Cheeseburgers',
    servings: '4 servings',
    minutes: 25,
    tags: ['grill', 'kid friendly'],
    items: [
      i('ground beef', '1.5 lb'),
      i('hamburger buns', '8 pack'),
      i('american cheese slices', '8'),
      i('iceberg lettuce', '1 small head'),
      i('tomatoes', '2'),
      i('red onion', '1'),
      i('pickles', '1 jar'),
      i('ketchup'),
      i('mustard'),
      p('salt'),
    ],
    source: 'suggested',
  },
  {
    id: 's-alfredo',
    title: 'Chicken alfredo',
    servings: '4 servings',
    minutes: 30,
    tags: ['comfort'],
    items: [
      i('fettuccine', '1 lb'),
      i('boneless chicken breast', '1 lb'),
      i('heavy cream', '1.5 cups'),
      i('parmesan cheese', '1 cup grated'),
      i('unsalted butter', '4 tbsp'),
      i('garlic', '3 cloves'),
      i('fresh parsley', 'for garnish'),
      p('salt'),
      p('black pepper'),
    ],
    source: 'suggested',
  },
  {
    id: 's-quesadillas',
    title: 'Chicken quesadillas',
    servings: '4 servings',
    minutes: 20,
    tags: ['quick', 'kid friendly'],
    items: [
      i('rotisserie chicken', '1'),
      i('flour tortillas', '8 large'),
      i('shredded mexican cheese', '2 cups'),
      i('bell peppers', '1'),
      i('salsa', '1 jar'),
      i('sour cream', '1/2 cup'),
      i('avocados', '2'),
    ],
    source: 'suggested',
  },
  {
    id: 's-pancakes',
    title: 'Pancake breakfast',
    servings: '4 servings',
    minutes: 25,
    tags: ['breakfast'],
    items: [
      i('pancake mix', '2 cups'),
      i('eggs', '1 dozen'),
      i('milk', '1/2 gallon'),
      i('bacon', '1 lb'),
      i('maple syrup', '1 bottle'),
      i('blueberries', '1 pint'),
      i('unsalted butter', '4 tbsp'),
    ],
    source: 'suggested',
  },
  {
    id: 's-curry',
    title: 'Chickpea coconut curry',
    servings: '4 servings',
    minutes: 30,
    tags: ['vegetarian', 'one pot'],
    items: [
      i('chickpeas', '2 cans'),
      i('coconut milk', '13.5 oz can'),
      i('diced tomatoes', '14 oz can'),
      i('baby spinach', '5 oz'),
      i('yellow onion', '1'),
      i('garlic', '3 cloves'),
      i('fresh ginger', '1 inch'),
      i('curry powder', '2 tbsp'),
      i('basmati rice', '2 cups'),
      p('vegetable oil', '2 tbsp'),
      p('salt'),
    ],
    source: 'suggested',
  },
  {
    id: 's-blts',
    title: 'BLTs and tomato soup',
    servings: '4 servings',
    minutes: 20,
    tags: ['quick', 'lunch'],
    items: [
      i('bacon', '1 lb'),
      i('sandwich bread', '1 loaf'),
      i('romaine lettuce', '1 head'),
      i('tomatoes', '2'),
      i('mayonnaise'),
      i('tomato soup', '2 cans'),
    ],
    source: 'suggested',
  },
  {
    id: 's-caesar',
    title: 'Grilled chicken Caesar salad',
    servings: '4 servings',
    minutes: 25,
    tags: ['healthy', 'quick'],
    items: [
      i('boneless chicken breast', '1.5 lb'),
      i('romaine lettuce', '2 heads'),
      i('caesar dressing', '1 bottle'),
      i('croutons', '1 bag'),
      i('parmesan cheese', '1/2 cup shaved'),
      i('lemons', '1'),
      p('olive oil', '1 tbsp'),
      p('black pepper'),
    ],
    source: 'suggested',
  },
  {
    id: 's-potroast',
    title: 'Slow cooker pot roast',
    servings: '6 servings',
    minutes: 480,
    tags: ['slow cooker', 'comfort'],
    items: [
      i('chuck roast', '3 lb'),
      i('baby potatoes', '1.5 lb'),
      i('carrots', '1 lb'),
      i('yellow onion', '1'),
      i('beef broth', '2 cups'),
      i('onion soup mix', '1 packet'),
      i('fresh thyme', 'a few sprigs'),
      p('salt'),
      p('black pepper'),
    ],
    source: 'suggested',
  },
  {
    id: 's-friedrice',
    title: 'Shrimp fried rice',
    servings: '4 servings',
    minutes: 25,
    tags: ['quick'],
    items: [
      i('frozen shrimp', '1 lb'),
      i('jasmine rice', '2 cups'),
      i('frozen peas and carrots', '12 oz bag'),
      i('eggs', '3'),
      i('soy sauce', '3 tbsp'),
      i('sesame oil', '1 tbsp'),
      i('green onions', '1 bunch'),
      i('garlic', '2 cloves'),
      p('vegetable oil', '2 tbsp'),
    ],
    source: 'suggested',
  },
  {
    id: 's-pizza',
    title: 'Homemade pepperoni pizza',
    servings: '4 servings',
    minutes: 30,
    tags: ['kid friendly'],
    items: [
      i('pizza dough', '1 lb'),
      i('pizza sauce', '1 jar'),
      i('shredded mozzarella cheese', '2 cups'),
      i('pepperoni', '6 oz'),
      i('bagged salad', '1'),
      p('olive oil', '1 tbsp'),
      p('all-purpose flour', 'for dusting'),
    ],
    source: 'suggested',
  },
];
