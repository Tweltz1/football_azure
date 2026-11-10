// Help chat ("Ask Talk Shops"): the trained model must match the Help page and stay careful.
//   node --test talkshops/tests/help-chat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ASK } from '../../ml/help-chat/data.mjs';

const require = createRequire(import.meta.url);
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { addEventListener() {} };
require('../public/help-content.js');
globalThis.HelpChatFeatures = require('../public/help-chat-features.js');
const { classify, decide } = require('../public/help-chat-model-run.js');
const model = JSON.parse(readFileSync(new URL('../public/help-chat-model.json', import.meta.url), 'utf8'));
const helpQs = window.TALKSHOPS_HELP.sections.flatMap((s) => s.qs.map(([q]) => q));

test('every Help question has training examples, and the model knows them all', () => {
  const trained = Object.keys(ASK).filter((k) => k !== 'repair' && k !== 'other');
  const missing = helpQs.filter((q) => !trained.includes(q));
  assert.deepEqual(missing, [], 'New or renamed Help questions: add ways to ask them in ml/help-chat/data.mjs, then run node ml/help-chat/train.mjs');
  assert.deepEqual(trained.filter((q) => !helpQs.includes(q)), [], 'data.mjs has questions that are no longer on the Help page');
  assert.deepEqual([...model.picker.classes].sort(), [...trained].sort(), 'help-chat-model.json is out of date: run node ml/help-chat/train.mjs');
});

test('answers a plain question, sends repair questions to How-to, and declines off-topic ones', () => {
  const run = (q) => decide(classify(model, q));
  assert.deepEqual([run('how do i check in a car').kind, run('how do i check in a car').label], ['answer', 'How do I check in a car?']);
  assert.equal(run('how do i replace the front brake pads on a 2015 f150').kind, 'repair');
  assert.equal(run('what is the weather tomorrow').kind, 'other');
  assert.equal(run('').kind, 'other');
});

test('on questions written apart from the training set, it rarely answers wrong', () => {
  const tests = JSON.parse(readFileSync(new URL('../../ml/help-chat/heldout-fresh.json', import.meta.url), 'utf8'));
  let answered = 0, wrong = 0, helpN = 0, inTop3 = 0;
  for (const [q, want] of tests) {
    const c = classify(model, q), d = decide(c);
    if (d.kind === 'answer') { answered++; if (d.label !== want) wrong++; }
    if (want !== 'repair' && want !== 'other') { helpN++; if (d.kind !== 'repair' && d.kind !== 'other' && c.ranked.slice(0, 3).some((r) => r.label === want)) inTop3++; }
  }
  assert.ok(wrong / answered <= 0.08, `answered ${answered}, wrong ${wrong}`);
  assert.ok(inTop3 / helpN >= 0.85, `right answer offered for ${inTop3} of ${helpN}`);
});
