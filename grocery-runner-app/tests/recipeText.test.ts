import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIngredient, parsePastedText, parsePhotoText, parseRecipePage } from '../src/lib/recipeText';

const item = (line: string) => parseIngredient(line);

test('splits amounts, units and preparation from the thing to buy', () => {
  assert.deepEqual(item('2 cups shredded cheddar cheese, divided'), { item: 'cheddar cheese', amount: '2 cups', pantry: false });
  assert.deepEqual(item('1 (14 oz) can diced tomatoes, drained'), { item: 'tomatoes', amount: '1 (14 oz) can', pantry: false });
  assert.deepEqual(item('½ teaspoon kosher salt'), { item: 'kosher salt', amount: '1/2 teaspoon', pantry: true });
  assert.deepEqual(item('1 1/2 lbs boneless chicken thighs'), { item: 'boneless chicken thighs', amount: '1 1/2 lbs', pantry: false });
  assert.deepEqual(item('3 cloves garlic, minced'), { item: 'garlic', amount: '3 cloves', pantry: false });
  assert.deepEqual(item('• 1 large yellow onion, finely chopped'), { item: 'yellow onion', amount: '1 large', pantry: false });
  assert.deepEqual(item('4 tbsp unsalted butter or margarine, softened'), { item: 'unsalted butter', amount: '4 tbsp', pantry: false });
  assert.deepEqual(item('Freshly ground black pepper, to taste'), { item: 'ground black pepper', amount: '', pantry: true });
  assert.equal(item('1 cup warm water'), null);
  assert.equal(item('For the sauce:'), null);
});

test('pasted recipe: title, servings, ingredients up to the directions, repeats merged', () => {
  const r = parsePastedText(`Grandma's Chili
Serves 6
Ingredients
1 lb ground beef
1 yellow onion, diced
2 cans kidney beans,
  drained and rinsed
1/2 lb ground beef
Directions
1. Brown the beef in 2 tbsp oil.`);
  assert.equal(r.title, "Grandma's Chili");
  assert.equal(r.servings, 'serves 6');
  assert.deepEqual(
    r.items.map((i) => [i.item, i.amount]),
    [
      ['ground beef', '1 lb + 1/2 lb'],
      ['yellow onion', '1'],
      ['kidney beans', '2 cans'],
    ],
  );
});

test('without an Ingredients heading, lines that start with an amount count', () => {
  const r = parsePastedText('2 eggs\n1 cup milk\nWhisk together and cook on a hot griddle.');
  assert.deepEqual(r.items.map((i) => i.item), ['eggs', 'milk']);
});

test('photo text: two-column cookbook page keeps the ingredient column and finds the title', () => {
  const at = (text: string, x: number, y: number, height = 0.02) => ({ text, x, y, width: 0.3, height });
  const r = parsePhotoText([
    at('Lemon Garlic Salmon', 0.1, 0.05, 0.05),
    at('Serves 4', 0.1, 0.12),
    at('INGREDIENTS', 0.05, 0.2),
    at('Preheat the oven to 400°F and line a pan.', 0.55, 0.2),
    at('4 salmon fillets', 0.05, 0.24),
    at('Place the salmon on the pan with 2 lemons.', 0.55, 0.24),
    at('2 lemons, sliced', 0.05, 0.28),
    at('3 tbsp butter, melted', 0.05, 0.32),
  ]);
  assert.equal(r.title, 'Lemon Garlic Salmon');
  assert.deepEqual(r.items.map((i) => i.item), ['salmon fillets', 'lemons', 'butter']);
});

test('recipe web pages: uses the published schema.org ingredient list', () => {
  const html = `<html><head><title>Best Tacos | Site</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},
{"@type":"Recipe","name":"Best Tacos","recipeYield":["4","4 servings"],
"recipeIngredient":["1 pound ground beef","8 taco shells","1 cup shredded lettuce","Salt &amp; pepper, to taste"]}]}</script>
</head><body>…</body></html>`;
  const r = parseRecipePage(html);
  assert.equal(r.title, 'Best Tacos');
  assert.equal(r.servings, '4');
  assert.deepEqual(r.items.map((i) => [i.item, i.pantry]), [
    ['ground beef', false],
    ['taco shells', false],
    ['lettuce', false],
    ['salt & pepper', false],
  ]);
});
