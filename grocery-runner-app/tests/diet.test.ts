import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dietsOf, matchesFilters } from '../src/lib/diet';
import { parseRecipePage } from '../src/lib/recipeText';
import { SUGGESTED } from '../src/lib/recipes';

const diets = (...names: string[]) => dietsOf(names.map((item) => ({ item })));

test('diet labels come from the ingredients, minding look-alikes', () => {
  assert.deepEqual(diets('chickpeas', 'coconut milk', 'basmati rice', 'vegetable broth'), ['gluten-free', 'dairy-free', 'vegetarian']);
  assert.deepEqual(diets('corn tortillas', 'peanut butter', 'tamari'), ['gluten-free', 'dairy-free', 'vegetarian']);
  assert.deepEqual(diets('flour tortillas', 'chicken broth'), ['dairy-free']);
  assert.deepEqual(diets('unsalted butter', 'hamburger buns'), ['vegetarian']);
  assert.deepEqual(diets('soy sauce'), ['dairy-free', 'vegetarian']);
  assert.deepEqual(diets('parmesan cheese', 'bacon'), ['gluten-free']);
  assert.deepEqual(diets(), []);
});

const ids = (keys: string[]) => SUGGESTED.filter((r) => matchesFilters(r, keys)).map((r) => r.id);

test('every filter has real choices in the suggested recipes', () => {
  for (const key of ['quick', 'healthy', 'family', 'vegetarian', 'gluten-free', 'dairy-free', 'one pot', 'slow cooker', 'grill', 'breakfast']) {
    assert.ok(ids([key]).length >= 3, key);
  }
});

test('filters combine: every chip that is on must match', () => {
  const veggieGfDf = ids(['vegetarian', 'gluten-free', 'dairy-free']);
  assert.ok(veggieGfDf.includes('s-curry') && veggieGfDf.includes('s-lentilsoup'));
  assert.ok(!veggieGfDf.includes('s-macncheese') && !veggieGfDf.includes('s-tacos'));
  assert.ok(ids(['quick', 'family']).every((id) => (SUGGESTED.find((r) => r.id === id)!.minutes ?? 99) <= 30));
});

test('recipe links keep the page picture', () => {
  const ld = (image: string) =>
    `<script type="application/ld+json">{"@type":"Recipe","name":"Soup","image":${image},"recipeIngredient":["2 carrots"]}</script>`;
  assert.equal(parseRecipePage(ld('"https://x.test/a.jpg"')).imageUrl, 'https://x.test/a.jpg');
  assert.equal(parseRecipePage(ld('[{"@type":"ImageObject","url":"https://x.test/b.jpg"}]')).imageUrl, 'https://x.test/b.jpg');
  assert.equal(
    parseRecipePage(`<meta property="og:image" content="https://x.test/c.jpg">${ld('"http://insecure.test/x.jpg"')}`).imageUrl,
    'https://x.test/c.jpg',
  );
});
