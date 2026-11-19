import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STEPS, totalMinutes } from '../src/lib/recipeSteps';
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
