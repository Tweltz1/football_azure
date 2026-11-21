import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conflictsOf, dietsOf, FILTERS, labelsOf, matchesFilters, PREF_GROUPS, proteinsOf } from '../src/lib/diet';
import { parseRecipePage } from '../src/lib/recipeText';
import { SUGGESTED } from '../src/lib/recipes';

const diets = (...names: string[]) => dietsOf(names.map((item) => ({ item })));

// The three original labels, ignoring the newer ones (vegan, pescatarian, nut-free, egg-free).
const core = (...names: string[]) => diets(...names).filter((d) => ['gluten-free', 'dairy-free', 'vegetarian'].includes(d));

test('diet labels come from the ingredients, minding look-alikes', () => {
  assert.deepEqual(core('chickpeas', 'coconut milk', 'basmati rice', 'vegetable broth'), ['gluten-free', 'dairy-free', 'vegetarian']);
  assert.deepEqual(core('corn tortillas', 'peanut butter', 'tamari'), ['gluten-free', 'dairy-free', 'vegetarian']);
  assert.deepEqual(core('flour tortillas', 'chicken broth'), ['dairy-free']);
  assert.deepEqual(core('unsalted butter', 'hamburger buns'), ['vegetarian']);
  assert.deepEqual(core('soy sauce'), ['dairy-free', 'vegetarian']);
  assert.deepEqual(core('parmesan cheese', 'bacon'), ['gluten-free']);
  assert.deepEqual(diets(), []);
});

test('vegan, pescatarian, nut-free and egg-free', () => {
  assert.ok(diets('chickpeas', 'coconut milk', 'vegetable broth').includes('vegan'));
  assert.ok(!diets('chickpeas', 'honey').includes('vegan'));
  assert.ok(!diets('pasta', 'eggs').includes('vegan') && diets('pasta', 'eggs').includes('vegetarian'));
  assert.ok(!diets('rice', 'mayonnaise').includes('egg-free'));
  assert.ok(diets('eggplant', 'rice').includes('egg-free'));
  assert.ok(diets('salmon fillets', 'asparagus').includes('pescatarian') && !diets('salmon fillets').includes('vegetarian'));
  assert.ok(!diets('raw shrimp', 'chicken broth').includes('pescatarian'));
  assert.ok(!diets('basil pesto').includes('nut-free') && !diets('peanut butter').includes('nut-free') && !diets('almond milk').includes('nut-free'));
  assert.ok(diets('coconut milk', 'nutmeg', 'butternut squash').includes('nut-free'));
  // Broth with no animal named is usually chicken or beef.
  assert.ok(!diets('broth').includes('vegetarian') && diets('mushroom broth').includes('vegan'));
});

test('meats and proteins to leave out', () => {
  const of = (...names: string[]) => proteinsOf(names.map((item) => ({ item })));
  assert.deepEqual(of('boneless chicken breast', 'chickpeas'), ['chicken']);
  assert.deepEqual(of('chuck roast', 'beef broth'), ['beef']);
  assert.deepEqual(of('smoked sausage', 'bacon'), ['pork']);
  assert.deepEqual(of('chicken sausage'), ['chicken']);
  assert.deepEqual(of('turkey bacon'), ['turkey']);
  assert.deepEqual(of('hamburger buns', 'eggplant'), []);
  assert.deepEqual(of('caesar dressing'), ['fish']);
  assert.deepEqual(of('frozen shrimp', 'salmon fillets'), ['fish', 'shellfish']);
  assert.deepEqual(of('pepperoni'), ['beef', 'pork']);
});

const ids = (keys: string[]) => SUGGESTED.filter((r) => matchesFilters(r, keys)).map((r) => r.id);

test('every filter has real choices in the suggested recipes', () => {
  for (const key of ['quick', 'healthy', 'family', 'vegetarian', 'gluten-free', 'dairy-free', 'one pot', 'slow cooker', 'grill', 'breakfast']) {
    assert.ok(ids([key]).length >= 3, key);
  }
});

test('every meal plan preference leaves enough dinners to plan a week', () => {
  const dinners = (keys: string[]) => SUGGESTED.filter((r) => !r.tags?.includes('breakfast') && matchesFilters(r, keys));
  for (const g of PREF_GROUPS) for (const key of g.keys) {
    assert.ok(FILTERS.some((f) => f.key === key), key);
    if (g.title !== 'We like') assert.ok(dinners([key]).length >= 7, `${key}: ${dinners([key]).length}`);
  }
  assert.ok(dinners(['vegan', 'gluten-free']).length >= 5);
  assert.ok(dinners(['no-fish', 'no-chicken', 'no-beef']).length >= 7);
  const noFishChicken = dinners(['no-fish', 'no-chicken']);
  assert.ok(noFishChicken.every((r) => !proteinsOf(r.items).some((p) => p === 'fish' || p === 'chicken')));
});

test('a recipe that breaks a rule says why; taste preferences never do', () => {
  const stirfry = SUGGESTED.find((r) => r.id === 's-stirfry')!;
  assert.deepEqual(conflictsOf(stirfry, ['no-chicken', 'quick', 'vegetarian']), ['boneless chicken breast (no chicken)', 'boneless chicken breast (vegetarian)']);
  assert.deepEqual(conflictsOf(SUGGESTED.find((r) => r.id === 's-curry')!, ['vegan', 'no-fish', 'nut-free', 'slow cooker']), []);
  assert.deepEqual(conflictsOf(SUGGESTED.find((r) => r.id === 's-caesar')!, ['no-fish']), ['Caesar dressing (no fish)']);
});

test('vegan cards say vegan, not vegetarian and dairy-free too', () => {
  const labels = labelsOf(SUGGESTED.find((r) => r.id === 's-lentilsoup')!);
  assert.ok(labels.includes('Vegan') && !labels.includes('Vegetarian') && !labels.includes('Dairy-free'));
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
