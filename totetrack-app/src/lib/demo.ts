import type { PackingList } from './lists';
import { addMonths } from './extras';
import { Item, Tote } from './types';

/**
 * Sample totes for the App Store screenshots. Only used when the build sets EXPO_PUBLIC_DEMO=1
 * (the screenshot workflow does) and the phone has no totes yet; real builds never load them.
 */
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

const HOUR = 60 * 60 * 1000;
let n = 0;
const id = (prefix: string) => `${prefix}0000-demo-4000-8000-${String(++n).padStart(12, '0')}`;
const item = (name: string, qty = 1, extra: Partial<Item> = {}): Item => ({ id: id('1tem'), name, qty, ...extra });

export const DEMO_TOTE_IDS = {
  camping: 'c4a1f9e2-demo-4000-8000-000000000001',
  christmas: 'c4a1f9e2-demo-4000-8000-000000000002',
};

export function demoTotes(now = Date.now()): Tote[] {
  n = 0; // same ids every time, so demoLists can point at the same items
  const tote = (t: Partial<Tote> & Pick<Tote, 'name' | 'location' | 'color' | 'icon' | 'items'>, hoursAgo: number, toteId = id('70te')): Tote => ({
    id: toteId,
    notes: '',
    createdAt: now - 30 * 24 * HOUR,
    updatedAt: now - hoursAgo * HOUR,
    ...t,
  });
  return [
    tote(
      {
        name: 'Camping gear',
        location: 'Garage, Shelf 2',
        color: '#16A34A',
        icon: 'bonfire',
        season: 'Camping',
        notes: 'Tent poles are in the long bag behind this tote.',
        items: [
          item('Tent stakes', 12),
          item('Headlamps', 3, { expires: undefined }),
          item('AA batteries', 8, { expires: addMonths(1) }),
          item('Camp stove', 1, { value: 89 }),
          item('Sleeping bag', 2, { value: 120, out: { to: 'Mike', at: now - 6 * 24 * HOUR } }),
          item('First aid kit', 1, { expires: addMonths(3) }),
          item('Lantern', 1),
          item('Bug spray', 2),
        ],
      },
      1,
      DEMO_TOTE_IDS.camping,
    ),
    tote(
      {
        name: 'Christmas lights',
        location: 'Attic',
        color: '#DC2626',
        icon: 'gift',
        season: 'Christmas',
        moveTo: 'Garage',
        unloadedAt: now - 2 * HOUR,
        items: [item('String lights', 6), item('Extension cords', 3), item('Light clips', 40), item('Tree topper star', 1, { value: 35 })],
      },
      5,
      DEMO_TOTE_IDS.christmas,
    ),
    tote(
      { name: 'Ornaments', location: 'Attic', color: '#D97706', icon: 'star', season: 'Christmas', moveTo: 'Living room', items: [item('Glass ornaments', 24), item('Ornament hooks', 50), item('Garland', 3)] },
      26,
    ),
    tote(
      {
        name: 'Beach day',
        location: 'Garage, Shelf 1',
        color: '#0EA5E9',
        icon: 'sunny',
        season: 'Summer',
        items: [item('Beach towels', 4), item('Sunscreen', 2, { expires: addMonths(6) }), item('Sand toys', 7), item('Umbrella', 1)],
      },
      50,
    ),
    tote(
      { name: 'Kids clothes 4T', location: 'Basement', color: '#8B5CF6', icon: 'shirt', moveTo: 'Kids room', unloadedAt: now - HOUR, items: [item('Winter jackets', 2), item('Rain boots', 1), item('Sweaters', 5)] },
      90,
    ),
    tote(
      { name: 'Tools', location: 'Garage, Workbench', color: '#475569', icon: 'construct', items: [item('Cordless drill', 1, { value: 129 }), item('Stud finder', 1), item('Picture hooks', 30), item('Tape measure', 2)] },
      140,
    ),
  ];
}

export const DEMO_LIST_ID = 'l1570000-demo-4000-8000-000000000001';

/** The screens the screenshot build walks through, one every DEMO_DWELL_MS. */
export const DEMO_DWELL_MS = 20000;
export const DEMO_TOUR = ['/', `/tote/${DEMO_TOTE_IDS.camping}`, '/reminders', `/lists/${DEMO_LIST_ID}`, '/moving', '/print'];

export function demoLists(): PackingList[] {
  const totes = demoTotes();
  const camping = totes.find((t) => t.id === DEMO_TOTE_IDS.camping);
  const beach = totes.find((t) => t.name === 'Beach day');
  const entries = [
    ...(camping?.items.slice(0, 4).map((i, k) => ({ id: `e${i.id}`, toteId: camping.id, itemId: i.id, name: i.name, packed: k < 2 })) ?? []),
    ...(beach?.items.slice(0, 2).map((i) => ({ id: `e${i.id}`, toteId: beach.id, itemId: i.id, name: i.name, packed: false })) ?? []),
  ];
  return [{ id: DEMO_LIST_ID, name: 'Lake weekend', entries, createdAt: Date.now() }];
}
