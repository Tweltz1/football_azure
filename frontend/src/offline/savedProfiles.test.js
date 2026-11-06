import { chooseSavedUser, chosenUser, savedProfileFor, savedProfiles, saveProfileCopy } from './storage';

beforeEach(() => window.localStorage.clear());

test('keeps one profile copy per account and loads the chosen one', () => {
  saveProfileCopy({ userId: 'a', userDetails: 'Tyler' }, { userId: 'a', favoritePlayerIds: ['1'], playerNotes: { 1: 'stud' } });
  saveProfileCopy({ userId: 'b', userDetails: 'Sam' }, { userId: 'b', favoritePlayerIds: ['2'] });
  saveProfileCopy({ userId: 'g', userDetails: 'Guest', guest: true }, { userId: 'g' });

  expect(savedProfileFor('a').playerNotes[1]).toBe('stud');
  expect(savedProfileFor('b').favoritePlayerIds).toEqual(['2']);
  expect(savedProfileFor('g')).toBeNull();
  expect(savedProfiles().map(({ user }) => user.userId).sort()).toEqual(['a', 'b']);

  expect(chosenUser()).toBeNull();
  expect(chooseSavedUser('a')).toEqual({ userId: 'a', userDetails: 'Tyler' });
  expect(chosenUser().userId).toBe('a');
  expect(chooseSavedUser('nobody')).toBeNull();
});
