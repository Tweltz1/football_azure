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
