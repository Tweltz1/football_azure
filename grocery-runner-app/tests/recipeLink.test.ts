import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanLink, isoMinutes, parseRecipePage } from '../src/lib/recipeText';

test('cleanLink finds the link in what people paste', () => {
  assert.equal(cleanLink('https://www.allrecipes.com/recipe/123/tacos/'), 'https://www.allrecipes.com/recipe/123/tacos/');
  assert.equal(cleanLink('Best Tacos Ever - check this out https://x.com/r/1).'), 'https://x.com/r/1');
  assert.equal(cleanLink('budgetbytes.com/one-pot-pasta/'), 'https://budgetbytes.com/one-pot-pasta/');
  assert.equal(cleanLink('milk'), null);
  assert.equal(cleanLink('2 lb ground beef'), null);
});

test('isoMinutes reads schema.org durations', () => {
  assert.equal(isoMinutes('PT1H15M'), 75);
  assert.equal(isoMinutes('PT30M'), 30);
  assert.equal(isoMinutes('P0DT0H45M'), 45);
  assert.equal(isoMinutes(undefined), undefined);
});

test('schema.org Recipe inside @graph, with a URL type, raw line breaks and total time', () => {
  const html = `<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"WebPage","name":"x"},
    {"@type":["http://schema.org/Recipe"],"name":"Cajun &amp; Chicken Pasta","totalTime":"PT35M","recipeYield":["4","4 servings"],
     "recipeIngredient":["1 lb chicken breast","8 oz penne pasta","1 cup heavy cream","1 tsp salt
"]}]}</script></html>`;
  const r = parseRecipePage(html);
  assert.equal(r.title, 'Cajun & Chicken Pasta');
  assert.equal(r.minutes, 35);
  assert.deepEqual(r.items.map((i) => i.item), ['chicken breast', 'penne pasta', 'heavy cream', 'salt']);
});

test('microdata and WP Recipe Maker pages without JSON-LD', () => {
  const micro = `<title>Chili | Site</title><ul><li itemprop="recipeIngredient">2 lb ground beef</li><li itemprop="recipeIngredient">1 can <b>kidney beans</b></li></ul>`;
  assert.deepEqual(parseRecipePage(micro).items.map((i) => i.item), ['ground beef', 'kidney beans']);
  const wprm = `<meta property="og:title" content="Banana Bread"><ul><li class="wprm-recipe-ingredient" style="x"><span class="wprm-recipe-ingredient-amount">3</span> <span>ripe bananas</span></li><li class="wprm-recipe-ingredient"><span>2 cups</span> <span>flour</span></li></ul>`;
  const r = parseRecipePage(wprm);
  assert.equal(r.title, 'Banana Bread');
  assert.deepEqual(r.items.map((i) => i.item), ['ripe bananas', 'flour']);
});

test('WP Recipe Maker JSON-LD lines (tastesbetterfromscratch white chicken chili)', () => {
  const lines = [
    '1 Tablespoon olive oil',
    '1 small yellow onion ((diced))',
    '2 garlic cloves ((minced))',
    '2 1/2 cups low-sodium chicken broth',
    '2 4 oz cans green chilies',
    '1 1/2 teaspoons ground cumin',
    '1/2 small lime ((juiced))',
    'salt and ground black pepper ((to taste))',
    '2 15 oz cans great northern beans ((drained and rinsed))',
    '1 cup corn ((frozen, canned or fresh))',
    '2 heaping cups chicken ((cooked and shredded))',
    '1 (14.5 oz) can diced tomatoes (, drained)',
    '1 15-ounce can black beans',
  ];
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Chili', recipeIngredient: lines })}</script>`;
  const got = Object.fromEntries(parseRecipePage(html).items.map((i) => [i.item, i.amount]));
  assert.deepEqual(got, {
    'olive oil': '1 Tablespoon',
    'yellow onion': '1 small',
    'garlic cloves': '2',
    'low-sodium chicken broth': '2 1/2 cups',
    'green chilies': '2 (4 oz) cans',
    'ground cumin': '1 1/2 teaspoons',
    lime: '1/2 small',
    'salt and ground black pepper': '',
    'great northern beans': '2 (15 oz) cans',
    corn: '1 cup',
    chicken: '2 heaping cups',
    'diced tomatoes': '1 (14.5 oz) can',
    'black beans': '1 (15 ounce) can',
  });
});
