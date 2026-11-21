import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanLink, hasRecipeData, isoMinutes, isRoundup, parseCollectionPage, parseRecipePage } from '../src/lib/recipeText';

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

test('reads steps from the page, with the minutes each one mentions', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Recipe',
    name: 'Soup',
    prepTime: 'PT10M',
    cookTime: 'PT30M',
    recipeIngredient: ['1 onion'],
    recipeInstructions: [
      { '@type': 'HowToSection', name: 'Soup', itemListElement: [{ '@type': 'HowToStep', text: 'Cook the onion for 5-7 minutes.' }, { '@type': 'HowToStep', text: 'Simmer 1 hour.' }] },
      { '@type': 'HowToStep', text: 'Serve.' },
    ],
  })}</script>`;
  const r = parseRecipePage(html);
  assert.deepEqual(r.steps, [
    { text: 'Cook the onion for 5-7 minutes.', minutes: 7 },
    { text: 'Simmer 1 hour.', minutes: 60 },
    { text: 'Serve.', minutes: 0 },
  ]);
  assert.equal(r.minutes, 40);
});

test('a roundup page lists the recipes it links to, not menu links', () => {
  // Shaped like Food Network's "100 Healthy Dinners" page: menus, then slides with "Get the recipe" buttons.
  const html = `<meta property="og:title" content="100 Healthy Dinners in 40 Minutes or Less | Food Network">
    <script type="application/ld+json">{"@type":"Article","mainEntity":{"@type":"ItemList","itemListElement":[{"@type":"ListItem","position":1,"item":{"@type":"Thing","name":"Ideas"}}]}}</script>
    <header><nav><a href="//www.foodnetwork.com/recipes/dinner">Dinner</a><a href="//www.foodnetwork.com/recipes/main-dish/healthy-main-dishes">Healthy</a></nav></header>
    <div class="slide"><a href="//www.foodnetwork.com/recipes/herbed-lentils-with-spinach-and-tomatoes-recipe-1953138" title="Herbed Lentils with Spinach and Tomatoes" class="slide-cta"> get the recipe </a></div>
    <p>Try our <a href="https://www.foodnetwork.com/recipes/quick-and-healthy-turkey-chili-recipe-2120199">Quick and Healthy Turkey Chili</a>.</p>
    <div class="slide"><a href="//www.foodnetwork.com/recipes/ellie-krieger/pasta-puttanesca-recipe-1945199" title="Pasta Puttanesca" class="slide-cta">Get the Recipe</a></div>
    <div class="slide"><a href="//www.foodnetwork.com/recipes/ellie-krieger/pasta-puttanesca-recipe-1945199" title="Pasta Puttanesca" class="slide-cta">Get the Recipe</a></div>
    <footer><a href="/recipes/food-network-kitchen/some-footer-recipe-123">Footer</a></footer>`;
  assert.equal(hasRecipeData(html), false);
  const c = parseCollectionPage(html, 'https://www.foodnetwork.com/healthy/packages/healthy-every-week/quick-and-simple/healthy-dinners-in-40-minutes-or-less');
  assert.equal(c?.title, '100 Healthy Dinners in 40 Minutes or Less');
  assert.deepEqual(c?.recipes, [
    { url: 'https://www.foodnetwork.com/recipes/herbed-lentils-with-spinach-and-tomatoes-recipe-1953138', title: 'Herbed Lentils with Spinach and Tomatoes' },
    { url: 'https://www.foodnetwork.com/recipes/ellie-krieger/pasta-puttanesca-recipe-1945199', title: 'Pasta Puttanesca' },
  ]);
  // The page's own text is never read as an ingredient list.
  assert.ok(!parseRecipePage(html).items.some((i) => i.item === 'dinner'));
});

test('a roundup with a schema.org ItemList of recipe pages, or plain blog links', () => {
  const list = `<title>25 Easy Soups - Site</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[
    {"@type":"ListItem","position":1,"url":"https://www.site.com/recipe/1/chicken-noodle-soup/","name":"Chicken Noodle Soup"},
    {"@type":"ListItem","position":2,"item":{"@id":"https://www.site.com/recipe/2/lentil-soup/","name":"Lentil Soup"}},
    {"@type":"ListItem","position":3,"url":"https://other.com/recipe/3/elsewhere/"}]}</script>`;
  assert.deepEqual(parseCollectionPage(list, 'https://www.site.com/gallery/easy-soups/')?.recipes, [
    { url: 'https://www.site.com/recipe/1/chicken-noodle-soup', title: 'Chicken Noodle Soup' },
    { url: 'https://www.site.com/recipe/2/lentil-soup', title: 'Lentil Soup' },
  ]);
  const blog = `<h1>12 Weeknight Pastas</h1><article><h2><a href="https://blog.com/creamy-tomato-pasta/">1. Creamy Tomato Pasta</a></h2>
    <a href="https://blog.com/category/pasta/">Pasta</a><a href="https://blog.com/one-pot-lemon-orzo/">Get the recipe</a><h2>One-Pot Lemon Orzo</h2></article>`;
  const b = parseCollectionPage(blog, 'https://blog.com/weeknight-pastas/');
  assert.deepEqual(b?.recipes.map((r) => r.url), ['https://blog.com/creamy-tomato-pasta', 'https://blog.com/one-pot-lemon-orzo']);
  assert.equal(b?.recipes[1].title, 'One pot lemon orzo');
  // One recipe page is not a collection.
  assert.equal(hasRecipeData('<script type="application/ld+json">{"@type":"Recipe","recipeIngredient":["1 egg"]}</script>'), true);
  assert.equal(parseCollectionPage('<a href="/a-b-c">x</a>', 'https://x.com/'), null);
});

test('a roundup that features one recipe is still a roundup; a recipe page with a few related links is not', () => {
  const links = Array.from({ length: 9 }, (_, n) => `<a href="https://blog.com/dish-number-${n}/">Get the recipe</a>`).join('');
  const own = '<script type="application/ld+json">{"@type":"Recipe","name":"Broccoli Pasta","recipeIngredient":["8 oz pasta"]}</script>';
  const roundup = `<meta property="og:title" content="Healthy Dinner Recipes">${own}<article>${links}</article>`;
  assert.equal(isRoundup(roundup, parseCollectionPage(roundup, 'https://blog.com/healthy-dinner-recipes/')!), true);
  const single = `<meta property="og:title" content="Broccoli Pasta">${own}<article>${links}</article>`;
  assert.equal(isRoundup(single, parseCollectionPage(single, 'https://blog.com/broccoli-pasta/')!), false);
  // WP Recipe Maker's stylesheet names alone don't make a page a recipe.
  assert.equal(hasRecipeData('<style>.wprm-recipe-ingredient{color:red}</style>'), false);
});
