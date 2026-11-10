// Scores the text sorter on heldout.json (hand-written texts it never trained on) and compares automatic
// answers with the old exact-phrase matcher.   node ml/sms-topics/eval.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoTopic, classifyText } from '../../supabase/functions/_shared/smsTopicModel.ts';
import { smsTopic } from '../../supabase/functions/_shared/shopSms.ts';

const here = dirname(fileURLToPath(import.meta.url));
const summary = {};
for (const file of ['heldout.json', 'heldout-fresh.json']) {
  console.log('\n== ' + file);
  summary[file] = report(JSON.parse(readFileSync(join(here, file), 'utf8')).texts, classifyText, autoTopic);
}
// EVAL_JSON=path saves the scores, so the monthly retrain can keep the new model only if it is at least as good.
if (process.env.EVAL_JSON) writeFileSync(process.env.EVAL_JSON, JSON.stringify(summary));
function report(texts, classify, auto) {
  let right = 0; const confusion = {};
  for (const [text, want] of texts) {
    const got = classify(text).topic;
    if (got === want) right++; else (confusion[want + ' -> ' + got] ??= []).push(text);
  }
  console.log('\nheld-out texts', texts.length, 'sorted right', (100 * right / texts.length).toFixed(1) + '%');
  for (const [k, v] of Object.entries(confusion)) console.log('  ' + k + ':', v.join(' | '));
  const out = { texts: texts.length, right };
  for (const [name, fn] of [['live (exact phrases, then model)', smsTopic], ['trained model', auto]]) {
    let sent = 0, wrong = 0, answerable = 0, answered = 0;
    for (const [text, want] of texts) {
      const t = fn(text);
      if (['status', 'hours', 'link'].includes(want)) answerable++;
      if (t !== 'review') { sent++; if (t !== want) { wrong++; console.log('    wrong auto-reply:', text, '->', t); } else answered++; }
    }
    console.log(`  ${name}: auto-answers ${answered} of ${answerable} answerable texts (${(100 * answered / answerable).toFixed(0)}%), wrong auto-replies ${wrong}`);
    if (fn === smsTopic) Object.assign(out, { answered, wrong });
  }
  return out;
}
