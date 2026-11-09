import { Department } from './types';

/** Department walk order used when nothing better is known. Cold items are last. */
export const DEPARTMENT_ORDER: Department[] = [
  'produce',
  'bakery',
  'deli',
  'meat',
  'pantry',
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
  frozen: 'Frozen',
  dairy: 'Dairy',
  other: 'Other',
};

export const COLD_DEPARTMENTS: Department[] = ['frozen', 'dairy'];

// Checked in order; first match wins. Shelf-stable look-alikes come first so "peanut butter" is not
// dairy, then "frozen" so "frozen peas" is not produce.
const KEYWORDS: [Department, string[]][] = [
  ['pantry', ['peanut butter', 'almond butter', 'apple butter', 'cream of', 'apple juice', 'orange juice', 'applesauce', 'canned', 'dried']],
  ['frozen', ['frozen', 'ice cream', 'popsicle', 'pizza rolls', 'tater tots', 'waffles']],
  ['dairy', ['milk', 'cheese', 'yogurt', 'butter', 'eggs', 'egg', 'cream', 'sour cream', 'cottage', 'creamer']],
  ['meat', ['chicken', 'beef', 'pork', 'steak', 'bacon', 'sausage', 'turkey', 'ground', 'fish', 'salmon', 'shrimp', 'tilapia', 'ham', 'ribs']],
  ['deli', ['deli', 'sliced', 'rotisserie', 'hummus', 'salami', 'prosciutto']],
  ['bakery', ['bread', 'bagel', 'bun', 'buns', 'roll', 'rolls', 'muffin', 'croissant', 'tortilla', 'cake', 'donut', 'baguette']],
  ['produce', ['apple', 'banana', 'lettuce', 'tomato', 'onion', 'potato', 'carrot', 'pepper', 'avocado', 'lemon', 'lime', 'berries', 'strawberries', 'grapes', 'spinach', 'celery', 'cucumber', 'garlic', 'broccoli', 'orange', 'cilantro', 'mushroom', 'salad']],
];

/** Best guess at a department from an item's name. Falls back to the center aisles. */
export function guessDepartment(name: string): Department {
  const text = ` ${name.toLowerCase()} `;
  for (const [dept, words] of KEYWORDS) {
    if (words.some((w) => new RegExp(`\\b${w}s?\\b`).test(text))) return dept;
  }
  return 'pantry';
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
  return 'pantry';
}
