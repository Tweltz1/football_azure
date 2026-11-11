import { readFileSync } from 'node:fs';
const R = new URL('../../../', import.meta.url).pathname;
const { classifyText, autoTopic } = await import(R + 'supabase/functions/_shared/smsTopicModel.ts');
const test = JSON.parse(readFileSync('/tmp/talkshops-sim-test.json', 'utf8'));
let right = 0, auto = 0, autoWrong = 0, answerable = 0;
for (const t of test) {
  if (classifyText(t.text).topic === t.topic) right++;
  if (['status', 'hours', 'link'].includes(t.topic)) answerable++;
  const a = autoTopic(t.text); if (a !== 'review') { if (a === t.topic) auto++; else autoWrong++; }
}
console.log(`sorted right ${(100 * right / test.length).toFixed(1)}%, auto-answered ${auto}/${answerable} (${(100 * auto / answerable).toFixed(0)}%), wrong auto ${autoWrong}`);
