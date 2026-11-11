import { DEPARTMENT_LABEL, guessDepartment } from './departments';
import { ListItem, LocationSource } from './types';

/** Who the location came from, in plain words. The shopper's own answers need no note. */
function from(loc: { source: LocationSource; votes?: number }): string {
  switch (loc.source) {
    case 'kroger':
      return 'from Kroger';
    case 'store':
      return 'from the store';
    case 'community':
      return loc.votes && loc.votes > 1 ? `from ${loc.votes} shoppers` : 'from a shopper';
    case 'guess':
      return 'best guess';
    default:
      return '';
  }
}

/**
 * Where an item is, for the screens:
 * - `place`: "Aisle 14", "Produce"
 * - `note`: where that came from ("from 3 shoppers", "best guess"), empty for the shopper's own answer
 * - `text`: both together ("Aisle 14 · from Kroger", "Produce")
 */
export function locationLabel(item: ListItem): { text: string; place: string; note: string; guessed: boolean } {
  const loc = item.location;
  let place: string;
  let note: string;
  let guessed = false;
  if (loc.kind === 'aisle') {
    const aisle = /^\d+$/.test(loc.aisle) ? `Aisle ${loc.aisle}` : loc.aisle;
    place = `${aisle}${loc.side ? (loc.side === 'L' ? ', left' : ', right') : ''}`;
    note = from(loc);
  } else if (loc.kind === 'department') {
    place = DEPARTMENT_LABEL[loc.department];
    note = from(loc);
    guessed = loc.source === 'guess';
  } else {
    place = DEPARTMENT_LABEL[guessDepartment(item.name)];
    note = 'best guess';
    guessed = true;
  }
  return { text: note ? `${place} · ${note}` : place, place, note, guessed };
}
