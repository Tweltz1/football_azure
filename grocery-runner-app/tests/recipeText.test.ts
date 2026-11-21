import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIngredient, parsePastedText, parsePhotoText, parseRecipeLines, parseRecipePage } from '../src/lib/recipeText';

// Name, amount and pantry only; notes are checked in their own test.
const item = (line: string) => {
  const r = parseIngredient(line);
  if (r) delete r.note;
  return r;
};

test('keeps describing words with the name and the rest as a note', () => {
  assert.deepEqual(parseIngredient('3 boneless, skinless chicken breasts'), { item: 'boneless skinless chicken breasts', amount: '3', pantry: false });
  assert.equal(parseIngredient('1 small yellow onion ((diced))')?.note, 'diced');
  assert.equal(parseIngredient('2 (15-oz.) cans white beans, drained and rinsed')?.note, 'drained and rinsed');
  assert.equal(parseIngredient('2 cups shredded cheddar cheese, divided')?.note, 'shredded, divided');
  assert.equal(parseIngredient('4 tbsp unsalted butter or margarine, softened')?.note, 'softened, or margarine');
});

test('splits amounts, units and preparation from the thing to buy', () => {
  assert.deepEqual(item('2 cups shredded cheddar cheese, divided'), { item: 'cheddar cheese', amount: '2 cups', pantry: false });
  assert.deepEqual(item('1 (14 oz) can diced tomatoes, drained'), { item: 'diced tomatoes', amount: '1 (14 oz) can', pantry: false });
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

test('recipe-site buttons around the ingredient list are not shopping items', () => {
  // Text read from a screenshot of a typical recipe-blog card (unit toggle, scale buttons, cook mode).
  const r = parsePastedText(`Chicken Noodle Soup
Servings: 6
Ingredients 1x 2x 3x
US Customary
Metric
Cook Mode
Prevent your screen from going dark
2 tablespoons butter
1 onion, diced
3 stalks celery, sliced
1 teaspoon celery seed
1 tablespoon chicken bouillon paste
1 lb boneless skinless chicken breasts
1 (14.5 oz) can diced tomatoes
1/2 teaspoon crushed red pepper
Instructions
Melt the butter.`);
  assert.deepEqual(
    r.items.map((i) => i.item),
    ['butter', 'onion', 'celery', 'celery seed', 'chicken bouillon paste', 'boneless skinless chicken breasts', 'diced tomatoes', 'crushed red pepper'],
  );
  assert.equal(r.items.find((i) => i.item === 'crushed red pepper')?.pantry, true);
});

test('the Ingredients heading is found even with the unit toggle on the same line', () => {
  const r = parsePastedText('Ingredients US Customary | Metric\nsalt and pepper\n2 carrots');
  assert.deepEqual(r.items.map((i) => i.item), ['salt and pepper', 'carrots']);
});

test('reads step times written the ways recipe sites write them', async () => {
  const { stepMinutes } = await import('../src/lib/recipeText');
  assert.equal(stepMinutes('Cook for 1 hr 15 mins, stirring occasionally'), 75);
  assert.equal(stepMinutes('Cover and cook for 10 to 15 more minutes'), 15);
  assert.equal(stepMinutes('Microwave the butter for about 40 seconds'), 1);
  assert.equal(stepMinutes('Fry for 10 mins until golden'), 10);
  assert.equal(stepMinutes('Serve right away'), 0);
});

test('UK pack sizes and dangling "and" from prep words', () => {
  assert.deepEqual(item('2 x 400g tins plum tomatoes'), { item: 'plum tomatoes', amount: '2 x 400g tins', pantry: false });
  assert.equal(parseIngredient('2 carrots trimmed and finely chopped')?.item, 'carrots');
  assert.equal(parseIngredient('1 red chilli deseeded and finely chopped (optional)')?.item, 'red chilli');
});

test('Food Network healthy dinners: lines that used to come through wrong', () => {
  const p = (l: string) => parseIngredient(l);
  const item = (l: string) => p(l)?.item;
  assert.equal(item('1 pound peeled and deveined jumbo shrimp'), 'jumbo shrimp');
  assert.equal(item('1 1/2 pounds large peeled, deveined shrimp (leave the tail sections on)'), 'shrimp');
  assert.equal(item('2 cups chopped cooked boneless, skinless chicken breast (about 9 ounces)'), 'boneless skinless chicken breast');
  assert.equal(item('6 ounces fully-cooked chorizo, casings removed, chopped'), 'chorizo');
  assert.equal(item('3 tablespoons well-drained capers'), 'capers');
  assert.equal(item('1/2 cup chopped drained water-packed artichoke quarters (about 10 pieces)'), 'artichoke quarters');
  assert.deepEqual(p('Juice of 1/2 lemon, plus slices for serving'), { item: 'lemon', amount: '1/2', pantry: false, note: 'juice, plus slices for serving' });
  assert.equal(item('Zest of 1 lemon plus 2 tablespoons juice'), 'lemon');
  assert.deepEqual(p('1/4 cup plus 3 tablespoons olive oil'), { item: 'olive oil', amount: '1/4 cup plus 3 tablespoons', pantry: true });
  assert.equal(p('1 packed cup baby spinach')?.amount, '1 packed cup');
  assert.equal(item('1/2 cup loosely packed fresh cilantro'), 'fresh cilantro');
  assert.deepEqual(p('Eight 6-inch corn tortillas, warmed'), { item: 'corn tortillas', amount: 'Eight (6-inch)', pantry: false, note: 'warmed' });
  assert.equal(p('One 1-inch piece fresh ginger, minced')?.amount, 'One 1-inch piece');
  assert.equal(item('1/2-inch knob fresh ginger, peeled and grated'), 'fresh ginger');
  assert.equal(item('1 rib celery, thinly sliced'), 'celery');
  assert.equal(item('2 large ears of corn, kernels removed'), 'corn');
  assert.equal(item('3/4 box (12 ounces) whole-wheat penne'), 'whole-wheat penne');
  assert.equal(item('2 strip steaks (about 1-inch thick)'), 'strip steaks');
  assert.equal(item('1 large carrot (6 ounces) peeled and sliced into strips with a peeler'), 'carrot');
  assert.equal(item('1/2 cup red onion thinly sliced into half moons'), 'red onion');
  assert.equal(item('6 black pitted and chopped olives such as Kalamata (about 1 tablespoon)'), 'black olives');
  assert.equal(item('1/3 cup cubed, peeled butternut squash (about 2 1/2 ounces)'), 'butternut squash');
  assert.equal(item('1 teaspoon finely chopped seeded chipotle with 1/2 teaspoon adobo'), 'chipotle');
  assert.equal(item('1 1/2 tablespoons freshly squeezed lime juice'), 'lime juice');
  // "or": a shared last word stays with the first choice; a whole other thing goes to the note.
  assert.equal(item('1 cup grape or cherry tomatoes, sliced in 1/2 (6 ounces)'), 'grape tomatoes');
  assert.equal(item('1/2 cup low-sodium vegetable or chicken broth'), 'low-sodium vegetable broth');
  assert.equal(item('1 yellow or orange bell pepper, chopped'), 'yellow bell pepper');
  assert.equal(item('10 ounces white button or cremini (baby bella) mushrooms, sliced'), 'white button mushrooms');
  assert.equal(item('1 1/2 cups fresh or frozen corn kernels, thawed if frozen'), 'fresh corn kernels');
  assert.equal(item('3 tablespoons vegetable, canola or other neutral oil'), 'vegetable oil');
  assert.equal(item('Cooking spray or olive oil, for oiling tortillas'), 'cooking spray');
  assert.equal(item('Cooked yam, plantains or rice, for serving'), 'yam');
  assert.equal(item('4 tbsp unsalted butter or margarine, softened'), 'unsalted butter');
  assert.equal(p('Kosher salt freshly ground black pepper')?.item, 'kosher salt and ground black pepper');
});

test('lines naming several things become one item each', () => {
  const names = (lines: string[]) => parseRecipeLines(lines, '', true).items.map((i) => i.item);
  assert.deepEqual(names(['Suggested toppings: chopped fresh cilantro, diced avocado, shredded cheese, lime juice']), [
    'fresh cilantro',
    'avocado',
    'cheese',
    'lime juice',
  ]);
  assert.deepEqual(names(['Lime wedges and cilantro leaves, for serving']), ['lime wedges', 'cilantro leaves']);
  assert.deepEqual(names(['Lemon juice and ground cinnamon for tossing']), ['lemon juice', 'ground cinnamon']);
  assert.deepEqual(names(['Salt and pepper', 'Half and half, for serving']), ['salt and pepper', 'half and half']);
  assert.deepEqual(
    names(['2 scallions, cut into 2-inch lengths, white and green parts separated 2 tablespoons thinly sliced fresh ginger (from about a 3/4-inch piece)']),
    ['scallions', 'fresh ginger'],
  );
  assert.deepEqual(names(['1 tablespoon all-purpose flour, dissolved in 3 tablespoons water']), ['all-purpose flour']);
});
