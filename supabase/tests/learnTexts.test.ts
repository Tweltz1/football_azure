import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnRow, outcomeOf, scrubText } from '../functions/_shared/learnTexts.ts';

test('saved texts lose names, contact details, numbers and addresses', () => {
  const cases: [string, RegExp][] = [
    ['Hi this is Mike Johnson, is my Camry ready? Call 715-555-1234', /Mike|Johnson|715|555|1234/],
    ['Hey any update on the Jeep? Thanks, Sarah', /Sarah/],
    ['Send it to bob.smith@gmail.com or https://x.co/abc', /bob|gmail|x\.co/],
    ['My VIN is 1HGCM82633A004352 and plate ABC1234', /1HGCM|ABC1234/],
    ['Dropping it at 123 Main St tomorrow', /123|Main/],
    ['Did Steve finish my brakes?', /Steve/],
    ['Mike here. is it ready', /Mike/],
    ['RO 10452 status?', /10452/],
  ];
  for (const [text, leak] of cases) assert.doesNotMatch(scrubText(text), leak, text);
  assert.equal(scrubText('Is my Honda ready?'), 'Is my Honda ready?');
});

test('what staff did with the suggestion', () => {
  const s = 'You can see the latest recorded repair status here: https://talkshops.app/?c=abc';
  assert.equal(outcomeOf(s, [s]), 'used');
  assert.equal(outcomeOf('You can see the latest repair status here: https://talkshops.app/?c=abc, almost done!', [s]), 'edited');
  assert.equal(outcomeOf('Should be ready by 3, I will text you', [s]), 'own');
  assert.equal(learnRow('[x]', 'ok', [s]), null);
  assert.equal(learnRow('Any update on my car?', s, [s])?.topic, 'status');
});
