import { fromAppleLabels } from './appleLabels';

test('picks the item over the scene and maps it to a category', () => {
  const d = fromAppleLabels([
    { label: 'outdoor', confidence: 0.9 }, { label: 'grass', confidence: 0.8 },
    { label: 'chair', confidence: 0.72 }, { label: 'furniture', confidence: 0.7 }, { label: 'wood_processed', confidence: 0.5 },
  ]);
  expect(d.title).toBe('Chair');
  expect(d.category).toBe('furniture');
  expect(d.confident).toBe(true);
  expect(d.tags).toEqual(expect.arrayContaining(['chair', 'furniture']));
});

test('underscored labels become readable titles', () => {
  const d = fromAppleLabels([{ label: 'washing_machine', confidence: 0.6 }]);
  expect(d.title).toBe('Washing machine');
  expect(d.category).toBe('appliances');
});

test('unsure or unknown guesses are not confident', () => {
  expect(fromAppleLabels([{ label: 'bicycle', confidence: 0.2 }]).confident).toBe(false);
  const odd = fromAppleLabels([{ label: 'accordion', confidence: 0.8 }]);
  expect(odd.category).toBe('other');
  expect(odd.confident).toBe(false);
});

test('photos of people are flagged and nothing usable gives null', () => {
  expect(fromAppleLabels([{ label: 'adult', confidence: 0.9 }, { label: 'sofa', confidence: 0.5 }]).person).toBe(true);
  expect(fromAppleLabels([{ label: 'sky', confidence: 0.9 }])).toBeNull();
  expect(fromAppleLabels(null)).toBeNull();
});
