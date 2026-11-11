import { itemKey } from './sharedAisles';

export type RecipeItem = {
  /** What to look for in the store, e.g. "yellow onion". */
  item: string;
  /** Amount the recipe needs, e.g. "2 cups". Shown only; the list holds item names. */
  amount: string;
  /** A staple most kitchens already have; left unticked so it isn't added by default. */
  pantry: boolean;
};

/** Hand-set labels. Diet labels (gluten-free, dairy-free, vegetarian) are worked out from the items in diet.ts. */
export type RecipeTag = 'healthy' | 'family' | 'one pot' | 'slow cooker' | 'breakfast' | 'grill';

export type Recipe = {
  id: string;
  title: string;
  servings: string;
  minutes?: number;
  tags?: RecipeTag[];
  /** Shown on the recipe's picture when it has no photo. */
  emoji?: string;
  /** File name in the app's documents folder: the photo a recipe was scanned from. */
  photo?: string;
  /** The recipe page's own picture, for recipes added from a link. */
  imageUrl?: string;
  items: RecipeItem[];
  /**
   * "suggested" ships with the app; "mine" is in the shopper's own recipes (added from a photo, link or
   * pasted text, or saved); "community" was shared by another shopper (lib/community.ts).
   */
  source: 'suggested' | 'mine' | 'community';
  /** Who shared it, for community recipes and saved copies of them. */
  author?: string;
  /** The shared recipe's id, for community recipes and saved copies of them. */
  communityId?: string;
  /** Community category (lib/community.ts CATEGORIES). */
  category?: string;
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


const r = (
  id: string,
  title: string,
  minutes: number,
  emoji: string,
  tags: RecipeTag[],
  items: RecipeItem[],
  servings = '4 servings',
): Recipe => ({ id: `s-${id}`, title, servings, minutes, emoji, tags, items, source: 'suggested' });

/** Weeknight recipes that ship with the app, so suggestions work offline and cost nothing. */
export const SUGGESTED: Recipe[] = [
  r('tacos', 'Ground beef tacos', 25, '🌮', ['family'], [
    i('ground beef', '1 lb'), i('corn taco shells', '12'), i('taco seasoning', '1 packet'),
    i('shredded cheddar cheese', '1 cup'), i('iceberg lettuce', '1 small head'), i('tomatoes', '2'),
    i('sour cream', '1/2 cup'), i('salsa', '1 jar'),
  ]),
  r('stirfry', 'Chicken and broccoli stir-fry', 30, '🥦', ['healthy'], [
    i('boneless chicken breast', '1.5 lb'), i('broccoli', '2 crowns'), i('soy sauce', '1/3 cup'),
    i('fresh ginger', '1 inch'), i('garlic', '3 cloves'), i('cornstarch', '1 tbsp'), i('jasmine rice', '2 cups'),
    i('green onions', '1 bunch'), p('vegetable oil', '2 tbsp'), p('sugar', '1 tbsp'),
  ]),
  r('spaghetti', 'Spaghetti with meat sauce', 40, '🍝', ['family'], [
    i('spaghetti', '1 lb'), i('ground beef', '1 lb'), i('marinara sauce', '24 oz jar'), i('yellow onion', '1'),
    i('garlic', '3 cloves'), i('parmesan cheese', 'for serving'), i('garlic bread', '1 loaf'),
    p('olive oil', '1 tbsp'), p('salt'),
  ], '6 servings'),
  r('sheetpan', 'Sheet-pan sausage and vegetables', 35, '🫑', ['one pot', 'healthy'], [
    i('smoked sausage', '14 oz'), i('baby potatoes', '1.5 lb'), i('bell peppers', '2'), i('red onion', '1'),
    i('zucchini', '2'), i('italian seasoning', '2 tsp'), p('olive oil', '3 tbsp'), p('salt'), p('black pepper'),
  ]),
  r('chili', 'Easy beef chili', 50, '🌶️', ['one pot', 'family'], [
    i('ground beef', '1.5 lb'), i('kidney beans', '2 cans'), i('diced tomatoes', '28 oz can'),
    i('tomato sauce', '15 oz can'), i('yellow onion', '1'), i('chili powder', '3 tbsp'),
    i('shredded cheddar cheese', 'for topping'), i('sour cream', 'for topping'), p('ground cumin', '2 tsp'), p('salt'),
  ], '6 servings'),
  r('salmon', 'Lemon garlic salmon with asparagus', 25, '🐟', ['healthy'], [
    i('salmon fillets', '4'), i('asparagus', '1 bunch'), i('lemons', '2'), i('garlic', '4 cloves'),
    i('unsalted butter', '3 tbsp'), i('fresh parsley', '1 bunch'), p('olive oil', '2 tbsp'), p('salt'), p('black pepper'),
  ]),
  r('burgers', 'Cheeseburgers', 25, '🍔', ['grill', 'family'], [
    i('ground beef', '1.5 lb'), i('hamburger buns', '8 pack'), i('american cheese slices', '8'),
    i('iceberg lettuce', '1 small head'), i('tomatoes', '2'), i('red onion', '1'), i('pickles', '1 jar'),
    i('ketchup'), i('mustard'), p('salt'),
  ]),
  r('alfredo', 'Chicken alfredo', 30, '🍜', ['family'], [
    i('fettuccine', '1 lb'), i('boneless chicken breast', '1 lb'), i('heavy cream', '1.5 cups'),
    i('parmesan cheese', '1 cup grated'), i('unsalted butter', '4 tbsp'), i('garlic', '3 cloves'),
    i('fresh parsley', 'for garnish'), p('salt'), p('black pepper'),
  ]),
  r('quesadillas', 'Chicken quesadillas', 20, '🧀', ['family'], [
    i('rotisserie chicken', '1'), i('flour tortillas', '8 large'), i('shredded mexican cheese', '2 cups'),
    i('bell peppers', '1'), i('salsa', '1 jar'), i('sour cream', '1/2 cup'), i('avocados', '2'),
  ]),
  r('pancakes', 'Pancake breakfast', 25, '🥞', ['breakfast', 'family'], [
    i('pancake mix', '2 cups'), i('eggs', '1 dozen'), i('milk', '1/2 gallon'), i('bacon', '1 lb'),
    i('maple syrup', '1 bottle'), i('blueberries', '1 pint'), i('unsalted butter', '4 tbsp'),
  ]),
  r('curry', 'Chickpea coconut curry', 30, '🍛', ['healthy', 'one pot'], [
    i('chickpeas', '2 cans'), i('coconut milk', '13.5 oz can'), i('diced tomatoes', '14 oz can'),
    i('baby spinach', '5 oz'), i('yellow onion', '1'), i('garlic', '3 cloves'), i('fresh ginger', '1 inch'),
    i('curry powder', '2 tbsp'), i('basmati rice', '2 cups'), p('vegetable oil', '2 tbsp'), p('salt'),
  ]),
  r('blts', 'BLTs and tomato soup', 20, '🥪', ['family'], [
    i('bacon', '1 lb'), i('sandwich bread', '1 loaf'), i('romaine lettuce', '1 head'), i('tomatoes', '2'),
    i('mayonnaise'), i('tomato soup', '2 cans'),
  ]),
  r('caesar', 'Grilled chicken Caesar salad', 25, '🥗', ['healthy', 'grill'], [
    i('boneless chicken breast', '1.5 lb'), i('romaine lettuce', '2 heads'), i('caesar dressing', '1 bottle'),
    i('croutons', '1 bag'), i('parmesan cheese', '1/2 cup shaved'), i('lemons', '1'), p('olive oil', '1 tbsp'),
    p('black pepper'),
  ]),
  r('potroast', 'Slow cooker pot roast', 480, '🥩', ['slow cooker', 'family'], [
    i('chuck roast', '3 lb'), i('baby potatoes', '1.5 lb'), i('carrots', '1 lb'), i('yellow onion', '1'),
    i('beef broth', '2 cups'), i('fresh thyme', 'a few sprigs'), i('tomato paste', '2 tbsp'), p('salt'), p('black pepper'),
  ], '6 servings'),
  r('friedrice', 'Shrimp fried rice', 25, '🍤', [], [
    i('frozen shrimp', '1 lb'), i('jasmine rice', '2 cups'), i('frozen peas and carrots', '12 oz bag'), i('eggs', '3'),
    i('soy sauce', '3 tbsp'), i('sesame oil', '1 tbsp'), i('green onions', '1 bunch'), i('garlic', '2 cloves'),
    p('vegetable oil', '2 tbsp'),
  ]),
  r('pizza', 'Homemade pepperoni pizza', 30, '🍕', ['family'], [
    i('pizza dough', '1 lb'), i('pizza sauce', '1 jar'), i('shredded mozzarella cheese', '2 cups'),
    i('pepperoni', '6 oz'), i('bagged salad', '1'), p('olive oil', '1 tbsp'), p('all-purpose flour', 'for dusting'),
  ]),
  // Added for more healthy, vegetarian, gluten-free and dairy-free choices.
  r('bowls', 'Chicken burrito bowls', 30, '🌯', ['healthy', 'family'], [
    i('boneless chicken thighs', '1.5 lb'), i('long grain rice', '2 cups'), i('black beans', '1 can'),
    i('frozen corn', '12 oz bag'), i('salsa', '1 jar'), i('avocados', '2'), i('limes', '2'), i('fresh cilantro', '1 bunch'),
    i('romaine lettuce', '1 head'), p('chili powder', '2 tsp'), p('ground cumin', '1 tsp'), p('olive oil', '2 tbsp'), p('salt'),
  ]),
  r('lentilsoup', 'Lentil and vegetable soup', 45, '🥣', ['healthy', 'one pot'], [
    i('green lentils', '1.5 cups'), i('vegetable broth', '6 cups'), i('carrots', '3'), i('celery', '3 stalks'),
    i('yellow onion', '1'), i('garlic', '3 cloves'), i('diced tomatoes', '14 oz can'), i('baby spinach', '5 oz'),
    i('lemons', '1'), p('olive oil', '2 tbsp'), p('ground cumin', '1 tsp'), p('salt'),
  ], '6 servings'),
  r('tofu', 'Crispy tofu and vegetable stir-fry', 30, '🥢', ['healthy'], [
    i('extra firm tofu', '14 oz'), i('tamari', '1/4 cup'), i('snap peas', '8 oz'), i('red bell pepper', '1'),
    i('broccoli', '1 crown'), i('garlic', '3 cloves'), i('fresh ginger', '1 inch'), i('brown rice', '1.5 cups'),
    i('sesame seeds', '1 tbsp'), i('cornstarch', '2 tbsp'), p('vegetable oil', '3 tbsp'),
  ]),
  r('steakpotato', 'Steak, roasted potatoes and green beans', 40, '🥔', ['grill'], [
    i('sirloin steak', '1.5 lb'), i('yukon gold potatoes', '2 lb'), i('green beans', '1 lb'), i('garlic', '4 cloves'),
    i('fresh rosemary', '2 sprigs'), p('olive oil', '3 tbsp'), p('salt'), p('black pepper'),
  ]),
  r('greekchicken', 'Greek chicken sheet pan', 40, '🍋', ['healthy', 'one pot'], [
    i('boneless chicken thighs', '2 lb'), i('red onion', '1'), i('cherry tomatoes', '1 pint'), i('cucumber', '1'),
    i('kalamata olives', '1/2 cup'), i('lemons', '2'), i('dried oregano', '2 tsp'), i('feta cheese', '4 oz'),
    i('plain greek yogurt', '1 cup'), p('olive oil', '3 tbsp'), p('salt'),
  ]),
  r('turkeychili', 'White bean turkey chili', 40, '🍲', ['healthy', 'one pot'], [
    i('ground turkey', '1.5 lb'), i('great northern beans', '2 cans'), i('chicken broth', '3 cups'),
    i('diced green chiles', '4 oz can'), i('yellow onion', '1'), i('garlic', '3 cloves'), i('frozen corn', '1 cup'),
    i('limes', '1'), i('fresh cilantro', '1 bunch'), p('ground cumin', '2 tsp'), p('dried oregano', '1 tsp'), p('salt'),
  ], '6 servings'),
  r('pulledpork', 'Slow cooker pulled pork sandwiches', 480, '🐖', ['slow cooker', 'family'], [
    i('pork shoulder', '3 lb'), i('barbecue sauce', '18 oz bottle'), i('apple cider vinegar', '1/4 cup'),
    i('brown sugar', '2 tbsp'), i('hamburger buns', '8 pack'), i('coleslaw mix', '14 oz bag'), i('mayonnaise', '1/2 cup'),
    p('paprika', '1 tbsp'), p('salt'),
  ], '8 servings'),
  r('chickentacos', 'Slow cooker salsa chicken tacos', 360, '🫔', ['slow cooker', 'family'], [
    i('boneless chicken breast', '2 lb'), i('salsa', '16 oz jar'), i('taco seasoning', '1 packet'),
    i('corn tortillas', '16'), i('avocados', '2'), i('limes', '2'), i('red cabbage', '1/2 head'), i('fresh cilantro', '1 bunch'),
  ]),
  r('shrimpzoodles', 'Garlic shrimp with zucchini noodles', 20, '🦐', ['healthy'], [
    i('raw shrimp', '1 lb'), i('zucchini', '4'), i('cherry tomatoes', '1 pint'), i('garlic', '4 cloves'),
    i('lemons', '1'), i('fresh basil', '1 bunch'), p('red pepper flakes', '1/4 tsp'), p('olive oil', '3 tbsp'), p('salt'),
  ]),
  r('omelet', 'Veggie egg scramble with potatoes', 20, '🍳', ['breakfast', 'healthy'], [
    i('eggs', '1 dozen'), i('frozen hash browns', '20 oz bag'), i('bell peppers', '1'), i('baby spinach', '5 oz'),
    i('yellow onion', '1'), i('salsa', '1 jar'), p('olive oil', '2 tbsp'), p('salt'), p('black pepper'),
  ]),
  r('oats', 'Overnight oats', 10, '🥛', ['breakfast', 'healthy'], [
    i('old fashioned oats', '2 cups'), i('almond milk', '1/2 gallon'), i('chia seeds', '2 tbsp'), i('bananas', '2'),
    i('strawberries', '1 lb'), i('honey', '1 bottle'),
  ]),
  r('macncheese', 'Baked mac and cheese', 45, '🧀', ['family'], [
    i('elbow macaroni', '1 lb'), i('sharp cheddar cheese', '16 oz block'), i('milk', '3 cups'), i('unsalted butter', '4 tbsp'),
    i('panko breadcrumbs', '1/2 cup'), p('all-purpose flour', '1/4 cup'), p('salt'),
  ], '6 servings'),
  r('blackbean', 'Black bean and sweet potato tacos', 35, '🍠', ['healthy', 'family'], [
    i('sweet potatoes', '2'), i('black beans', '2 cans'), i('corn tortillas', '12'), i('avocados', '2'), i('limes', '2'),
    i('red onion', '1'), i('fresh cilantro', '1 bunch'), p('chili powder', '2 tsp'), p('olive oil', '2 tbsp'), p('salt'),
  ]),
  r('pestopasta', 'Pesto pasta with cherry tomatoes', 20, '🌿', ['family'], [
    i('penne pasta', '1 lb'), i('basil pesto', '6 oz jar'), i('cherry tomatoes', '1 pint'), i('fresh mozzarella', '8 oz'),
    i('baby spinach', '5 oz'), i('parmesan cheese', 'for serving'), p('salt'),
  ]),
];
