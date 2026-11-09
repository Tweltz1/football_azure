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
