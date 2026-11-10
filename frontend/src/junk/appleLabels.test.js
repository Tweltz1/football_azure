import { fromAppleLabels } from './appleLabels';

test('picks the item over the scene and maps it to a category', () => {
  const d = fromAppleLabels([
    { label: 'outdoor', confidence: 0.9 }, { label: 'grass', confidence: 0.8 },
    { label: 'furniture', confidence: 0.75 }, { label: 'chair', confidence: 0.72 }, { label: 'wood_processed', confidence: 0.5 },
  ]);
  expect(d.title).toBe('Chair');
  expect(d.category).toBe('furniture');
  expect(d.confident).toBe(true);
  expect(d.tags).toEqual(expect.arrayContaining(['chair', 'furniture']));
});

test('a trash can is not "Furniture" even when Vision scores furniture higher', () => {
  const d = fromAppleLabels([
    { label: 'structure', confidence: 0.9 }, { label: 'wall', confidence: 0.8 }, { label: 'furniture', confidence: 0.62 },
    { label: 'container', confidence: 0.5 }, { label: 'trash_can', confidence: 0.31 }, { label: 'floor', confidence: 0.3 },
  ]);
  expect(d.title).toBe('Trash can');
  expect(d.category).toBe('home');
});

test('a watch on a wrist is a watch, not a person photo', () => {
  const d = fromAppleLabels([
    { label: 'people', confidence: 0.8 }, { label: 'adult', confidence: 0.7 }, { label: 'hand', confidence: 0.6 },
    { label: 'wearable', confidence: 0.5 }, { label: 'wristwatch', confidence: 0.45 }, { label: 'furniture', confidence: 0.2 },
  ]);
  expect(d.title).toBe('Watch');
  expect(d.category).toBe('electronics');
  expect(d.person).toBe(false);
});

test('only broad labels: no title, category from the hint', () => {
  const d = fromAppleLabels([{ label: 'furniture', confidence: 0.7 }, { label: 'indoor', confidence: 0.9 }]);
  expect(d.title).toBe('');
  expect(d.category).toBe('furniture');
  expect(d.confident).toBe(false);
});

test('underscored labels become readable titles', () => {
  const d = fromAppleLabels([{ label: 'washing_machine', confidence: 0.6 }]);
  expect(d.title).toBe('Washing machine');
  expect(d.category).toBe('appliances');
});

test('unsure guesses leave the title empty; unknown items are Other', () => {
  expect(fromAppleLabels([{ label: 'bicycle', confidence: 0.1 }])).toBeNull();
  const odd = fromAppleLabels([{ label: 'accordion', confidence: 0.8 }]);
  expect(odd.title).toBe('Accordion');
  expect(odd.category).toBe('other');
});

test('people only are flagged and nothing usable gives null', () => {
  expect(fromAppleLabels([{ label: 'adult', confidence: 0.9 }]).person).toBe(true);
  expect(fromAppleLabels([{ label: 'sky', confidence: 0.9 }])).toBeNull();
  expect(fromAppleLabels(null)).toBeNull();
});

test('the detector finds separate items worth listing, grouped by kind', () => {
  const { spottedItems, spottedTitle } = require('./appleLabels');
  const s = spottedItems([
    { label: 'chair', confidence: 0.8, box: { x: 0, y: 0, w: 0.3, h: 0.5 } },
    { label: 'chair', confidence: 0.6, box: { x: 0.4, y: 0, w: 0.3, h: 0.5 } },
    { label: 'person', confidence: 0.95, box: { x: 0, y: 0, w: 1, h: 1 } },
    { label: 'tv', confidence: 0.7, box: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 } },
    { label: 'potted plant', confidence: 0.2, box: { x: 0, y: 0, w: 0.1, h: 0.1 } },
  ]);
  expect(s.map((x) => [x.title, x.category, x.count])).toEqual([['Chair', 'furniture', 2], ['TV', 'electronics', 1]]);
  expect(spottedTitle(s[0])).toBe('2 Chairs');
  expect(spottedTitle(s[1])).toBe('TV');
  expect(spottedItems(null)).toEqual([]);
});

test('every separate thing in a photo, named from its own part, even kinds the detector does not know', () => {
  const { thingsInPhoto } = require('./appleLabels');
  const things = thingsInPhoto({
    // The detector calls the red tape measure case a suitcase; Apple's label for that part wins.
    objects: [
      { label: 'suitcase', confidence: 0.6, box: { x: 0.55, y: 0.5, w: 0.3, h: 0.3 } },
      { label: 'bottle', confidence: 0.7, box: { x: 0.05, y: 0.1, w: 0.1, h: 0.3 } },
    ],
    regions: [
      { box: { x: 0.56, y: 0.52, w: 0.3, h: 0.28 }, labels: [{ label: 'tape_measure', confidence: 0.5 }, { label: 'tool', confidence: 0.6 }] },
      { box: { x: 0.25, y: 0.55, w: 0.15, h: 0.2 }, labels: [{ label: 'battery', confidence: 0.45 }] },
      { box: { x: 0.4, y: 0.1, w: 0.1, h: 0.1 }, labels: [{ label: 'tool', confidence: 0.4 }] },
      { box: { x: 0.7, y: 0.05, w: 0.1, h: 0.1 }, labels: [{ label: 'wall', confidence: 0.9 }] },
    ],
  });
  expect(things.map((t) => t.title)).toEqual(['Bottle', 'Tool', 'Battery', 'Tape measure']);
  expect(things.find((t) => t.title === 'Tape measure').box.x).toBeCloseTo(0.56);
  expect(things.find((t) => t.title === 'Tool').category).toBe('tools');
});

test('only real name or category changes count as fixes for the learning loop', () => {
  const { wasFixed } = require('./learning');
  const guess = { title: 'Suitcase', category: 'other' };
  expect(wasFixed(guess, 'Tape measure', 'tools')).toBe(true);
  expect(wasFixed(guess, 'suitcase', 'other')).toBe(false);
  expect(wasFixed({ title: 'Battery', category: 'electronics' }, 'Battery 2', 'electronics')).toBe(false);
  expect(wasFixed(guess, 'Suitcase', 'clothing')).toBe(true);
  expect(wasFixed(null, 'Chair', 'furniture')).toBe(false);
  expect(wasFixed(guess, '', 'other')).toBe(false);
});

test('our item namer names a thing when it is sure, and Apple names it otherwise', () => {
  const { thingsInPhoto, namerThing } = require('./appleLabels');
  const guess = (title, category, confidence) => ({ guesses: [{ label: title.toLowerCase(), title, category, item: true, confidence }] });
  expect(namerThing(guess('Clothespin', 'home', 0.82))).toMatchObject({ title: 'Clothespin', category: 'home', source: 'namer' });
  expect(namerThing(guess('Clothespin', 'home', 0.4))).toBeNull();
  expect(namerThing(guess('Thing', 'nonsense', 0.9)).category).toBe('other');
  const things = thingsInPhoto({
    regions: [
      { box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, labels: [{ label: 'tool', confidence: 0.6 }], namer: guess('Pliers', 'tools', 0.91) },
      { box: { x: 0.6, y: 0.1, w: 0.3, h: 0.3 }, labels: [{ label: 'battery', confidence: 0.5 }], namer: guess('Remote control', 'electronics', 0.3) },
    ],
  });
  expect(things.map((t) => t.title)).toEqual(['Pliers', 'Battery']);
  expect(things[0].source).toBe('namer');
});

test('a finished post teaches every changed name, and kept guesses too when pictures are shared', () => {
  const { namesToTeach } = require('./learning');
  const items = [
    { guess: { title: 'Suitcase', category: 'other' }, title: 'Tape measure', category: 'tools' },
    { guess: { title: 'Lamp', category: 'home' }, title: 'Lamp', category: 'home' },
    { guess: null, title: 'Chair', category: 'furniture' },
    { guess: { title: 'Box', category: 'home' }, title: '  ', category: 'home' },
  ];
  expect(namesToTeach(items, false).map((f) => f.title)).toEqual(['Tape measure']);
  expect(namesToTeach(items, true).map((f) => f.title)).toEqual(['Tape measure', 'Lamp']);
});

test('the phone uses your own name for a guess after you give it that name twice', () => {
  const { rememberNames, myName } = require('./learning');
  window.localStorage.clear();
  const fix = { guess: { title: 'Suitcase', category: 'other' }, title: 'Tool chest 2', category: 'tools' };
  rememberNames([fix]);
  expect(myName({ title: 'Suitcase', category: 'other' }).title).toBe('Suitcase');
  rememberNames([fix]);
  const named = myName({ title: 'Suitcase', category: 'other', box: { x: 0, y: 0, w: 1, h: 1 } });
  expect(named).toMatchObject({ title: 'Tool chest', category: 'tools', source: 'you', original: 'Suitcase' });
  expect(myName({ title: 'Lamp', category: 'home' }).title).toBe('Lamp');
  window.localStorage.clear();
});
