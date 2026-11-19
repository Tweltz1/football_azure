import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mentionedMinutes, STEPS, totalMinutes } from '../src/lib/recipeSteps';
import { SUGGESTED } from '../src/lib/recipes';

test('every suggested recipe has steps, and its time is the steps’ total', () => {
  for (const r of SUGGESTED) {
    const steps = STEPS[r.id.replace(/^s-/, '')];
    assert.ok(steps?.length, `${r.id} has steps`);
    assert.equal(r.minutes, totalMinutes(steps), r.id);
  }
});

test('side steps run alongside the step before them', () => {
  assert.equal(totalMinutes([{ text: 'a', minutes: 3 }, { text: 'rice', minutes: 40, during: true }, { text: 'b', minutes: 10 }]), 40);
  assert.equal(totalMinutes([{ text: 'a', minutes: 15 }, { text: 'pasta', minutes: 11, during: true }, { text: 'b', minutes: 3 }]), 18);
});

// Words that describe an ingredient rather than name it ("boneless chicken breast" is chicken).
const DESCRIBING = new Set(['fresh', 'frozen', 'shredded', 'boneless', 'large', 'small', 'extra', 'firm', 'plain', 'sharp', 'unsalted',
  'ground', 'dried', 'diced', 'raw', 'baby', 'red', 'green', 'yellow', 'white', 'old', 'fashioned', 'long', 'grain', 'smoked', 'all-purpose',
  'great', 'northern', 'yukon', 'gold', 'iceberg', 'rotisserie', 'american', 'mexican', 'italian', 'greek', 'kalamata', 'heavy', 'sweet']);
const stem = (w: string) => w.toLowerCase().replace(/ies$/, '').replace(/(oes|es|s)$/, (m) => (m === 'oes' ? 'o' : '')).replace(/[^a-z-]/g, '');

test('every ingredient of a suggested recipe is used in its steps', () => {
  for (const r of SUGGESTED) {
    const text = STEPS[r.id.replace(/^s-/, '')].map((s) => s.text).join(' ').toLowerCase();
    for (const it of r.items) {
      const words = it.item.toLowerCase().split(/\s+/);
      const head = stem(words[words.length - 1]);
      const first = stem(words.find((w) => !DESCRIBING.has(w)) ?? head);
      assert.ok(text.includes(head) || text.includes(first), `${r.id}: "${it.item}" isn't used in any step`);
    }
  }
});

test('a step’s minutes match the times its text mentions', () => {
  for (const [id, steps] of Object.entries(STEPS)) {
    for (const st of steps) {
      const said = mentionedMinutes(st.text);
      if (!said.length) continue;
      const sum = said.reduce((a, b) => a + b, 0);
      assert.ok(st.minutes >= Math.max(...said) && st.minutes <= Math.ceil(sum), `${id}: "${st.text}" is labeled ${st.minutes} min`);
    }
  }
});

test('mentionedMinutes reads ranges, seconds, hours and per-side times', () => {
  assert.deepEqual(mentionedMinutes('Grill 6 minutes a side, then rest 5 minutes.'), [12, 5]);
  assert.deepEqual(mentionedMinutes('Bake 10 to 12 minutes. Add garlic for 30 seconds.'), [12, 0.5]);
  assert.deepEqual(mentionedMinutes('Cook on low for 8 hours'), [480]);
});
