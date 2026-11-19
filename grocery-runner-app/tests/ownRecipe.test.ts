import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOwnRecipe } from '../src/lib/ownRecipe';

test('builds a recipe from typed ingredients and steps', () => {
  const r = buildOwnRecipe({
    title: 'grandma\'s chicken soup',
    servings: '6',
    ingredients: '2 lb chicken thighs\n\n1 onion, diced\n3 carrots, sliced\n8 cups chicken broth\n',
    steps: [
      { text: 'brown the chicken for 8 minutes', minutes: '' },
      { text: 'Add the onion and carrots.', minutes: '5' },
      { text: 'Pour in the broth and simmer 30 minutes.', minutes: '' },
      { text: '   ', minutes: '3' },
    ],
  });
  assert.equal(r.title, "Grandma's Chicken Soup");
  assert.deepEqual(r.items.map((i) => i.item), ['chicken thighs', 'onion', 'carrots', 'chicken broth']);
  assert.deepEqual(r.steps.map((s) => s.minutes), [8, 5, 30]);
  assert.equal(r.steps[0].text, 'Brown the chicken for 8 minutes');
  assert.equal(r.minutes, 43);
});

test('no steps means no total time, and an empty title gets a name', () => {
  const r = buildOwnRecipe({ title: ' ', servings: '', ingredients: '1 cup rice', steps: [] });
  assert.equal(r.title, 'My recipe');
  assert.equal(r.minutes, undefined);
  assert.equal(r.items.length, 1);
});
