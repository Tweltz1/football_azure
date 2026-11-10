import { DEPARTMENT_LABEL, guessDepartment } from './departments';
import { ListItem, LocationSource } from './types';

const SOURCE: Record<LocationSource, string> = {
  kroger: 'Kroger',
  user: 'you',
  community: 'shoppers',
  store: 'store',
  guess: 'guess',
};

function source(loc: { source: LocationSource; votes?: number }): string {
  if (loc.source === 'community' && loc.votes) return loc.votes === 1 ? '1 shopper' : `${loc.votes} shoppers`;
  return SOURCE[loc.source];
}

/** "Aisle 14 · Kroger", "Produce · guess" */
export function locationLabel(item: ListItem): { text: string; guessed: boolean } {
  const loc = item.location;
  if (loc.kind === 'aisle') {
    const aisle = /^\d+$/.test(loc.aisle) ? `Aisle ${loc.aisle}` : loc.aisle;
    const side = loc.side ? (loc.side === 'L' ? ', left' : ', right') : '';
    return { text: `${aisle}${side} · ${source(loc)}`, guessed: false };
  }
  if (loc.kind === 'department') {
    return { text: `${DEPARTMENT_LABEL[loc.department]} · ${source(loc)}`, guessed: loc.source === 'guess' };
  }
  return { text: `${DEPARTMENT_LABEL[guessDepartment(item.name)]} · guess`, guessed: true };
}
