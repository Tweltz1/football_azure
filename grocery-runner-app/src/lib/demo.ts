import { Department, ItemLocation, ListItem, Store } from './types';

/**
 * Sample list for the App Store screenshots. Only used when the build sets EXPO_PUBLIC_DEMO=1
 * (.github/workflows/grocery-runner-store.yml); normal builds never see it.
 */
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

/** The screens the screenshot build walks through, one every DEMO_DWELL_MS. */
export const DEMO_DWELL_MS = 20000;
export const DEMO_ITEM_ID = 'demo-item-03';
export const DEMO_TOUR = ['/', '/route', '/recipes', '/recipe/s-tacos', `/item/${DEMO_ITEM_ID}`, '/stores', '/store'];

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
