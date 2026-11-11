import type { CommunityRecipe } from './community';
import { Department, ItemLocation, ListItem, Store } from './types';

/**
 * Sample list for the App Store screenshots. Only used when the build sets EXPO_PUBLIC_DEMO=1
 * (.github/workflows/grocery-runner-store.yml); normal builds never see it.
 */
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

/** The screens the screenshot build walks through, one every DEMO_DWELL_MS. */
export const DEMO_DWELL_MS = 20000;
export const DEMO_ITEM_ID = 'demo-item-03';
export const DEMO_TOUR = ['/', '/route', '/recipes?view=recipes', '/recipe/s-tacos', '/recipes?view=community', '/stores', '/account', `/item/${DEMO_ITEM_ID}`];

export const DEMO_STORE: Store = {
  id: 'custom:Neighborhood Market',
  chain: 'other',
  name: 'Neighborhood Market',
  address: '412 Main St',
  aisleCount: 14,
};

const aisle = (a: string, department: Department): ItemLocation => ({ kind: 'aisle', aisle: a, department, source: 'user' });
const dept = (department: Department): ItemLocation => ({ kind: 'department', department, source: 'user' });

export function demoItems(): ListItem[] {
  const rows: [string, ItemLocation, string?, boolean?][] = [
    ['Bananas', dept('produce')],
    ['Baby spinach', dept('produce')],
    ['Avocados', dept('produce'), '3'],
    ['Sourdough bread', dept('bakery')],
    ['Chicken breast', dept('meat'), '2 lb'],
    ['Pasta', aisle('4', 'pantry')],
    ['Marinara sauce', aisle('4', 'pantry')],
    ['Coffee', aisle('7', 'pantry')],
    ['Peanut butter', aisle('6', 'pantry'), undefined, true],
    ['Greek yogurt', dept('dairy')],
    ['Eggs', dept('dairy'), '1 dozen'],
    ['Frozen peas', aisle('12', 'frozen')],
  ];
  return rows.map(([name, location, amount, checked], k) => ({
    id: `demo-item-${String(k + 1).padStart(2, '0')}`,
    name,
    ...(amount ? { amount } : {}),
    checked: !!checked,
    location,
  }));
}

const it = (item: string, amount = '') => ({ item, amount, pantry: false });
const shared = (n: number, title: string, category: string, emoji: string, author: string, saves: number, minutes: number, items: string[]): CommunityRecipe => ({
  id: `c-demo-${n}`,
  communityId: `demo-${n}`,
  title,
  servings: '4 servings',
  minutes,
  emoji,
  items: items.map((x) => it(x)),
  source: 'community',
  author,
  category,
  authorId: 'demo',
  saves,
  createdAt: '2026-11-01T12:00:00Z',
});

/** Sample shared recipes for the screenshot build's Community tab. */
export function demoCommunity(): CommunityRecipe[] {
  return [
    shared(1, "Grandma's buttermilk pancakes", 'breakfast', '🥞', 'Maria', 128, 25, ['buttermilk', 'flour', 'eggs', 'butter', 'maple syrup', 'blueberries']),
    shared(2, 'Sheet-pan chicken fajitas', 'dinner', '🌯', 'Dev', 96, 35, ['chicken breast', 'bell peppers', 'onion', 'tortillas', 'fajita seasoning', 'sour cream', 'lime']),
    shared(3, 'Lemon herb orzo salad', 'sides', '🥗', 'Priya', 74, 20, ['orzo', 'cucumber', 'cherry tomatoes', 'feta', 'lemon', 'parsley']),
    shared(4, 'No-bake peanut butter bars', 'desserts', '🍫', 'Sam', 61, 15, ['peanut butter', 'graham crackers', 'powdered sugar', 'chocolate chips', 'butter']),
    shared(5, 'Turkey avocado wraps', 'lunch', '🥙', 'Jordan', 42, 10, ['turkey slices', 'avocados', 'tortillas', 'spinach', 'swiss cheese']),
    shared(6, 'Strawberry banana smoothie', 'drinks', '🍓', 'Alex', 37, 5, ['strawberries', 'bananas', 'greek yogurt', 'orange juice']),
  ];
}
