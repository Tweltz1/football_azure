import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoTopic, classifyText } from '../functions/_shared/smsTopicModel.ts';
import { smsTopic } from '../functions/_shared/shopSms.ts';

test('trained sorter answers everyday customer texts the exact phrases missed', () => {
  for (const [text, topic] of [['Hey any update on the Jeep?', 'status'], ['what time do yall close today', 'hours'], ['I lost the estimate link, can you resend it', 'link']]) {
    assert.equal(smsTopic(text), topic, text);
  }
  assert.equal(classifyText('Yes go ahead with the front brakes').topic, 'approval');
});

test('anything a person should see stays with staff', () => {
  for (const text of ['Is my car ready and is it safe to drive?', 'Is it done? How much do I owe?', 'Can I pick it up at 4:30', 'Go ahead with the brakes',
    'thanks!', 'My check engine light came back on', 'Can I bring it in Friday', 'Is it ready? Also can you check my wipers', 'x'.repeat(200)]) {
    assert.equal(autoTopic(text), 'review', text);
  }
});

test('car questions are marked tech for a How-to shortcut, and are never answered automatically', () => {
  for (const text of ['Why does my car shake when I brake on the highway?', 'what does code P0300 mean', 'my car shakes at idle, why?']) {
    assert.equal(classifyText(text).topic, 'tech', text);
    assert.equal(autoTopic(text), 'review', text);
  }
  assert.equal(classifyText('Any update on the Civic?').topic, 'status');
});
