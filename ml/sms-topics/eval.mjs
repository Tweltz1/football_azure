// Scores the text sorter on heldout.json (hand-written texts it never trained on) and compares automatic
// answers with the old exact-phrase matcher.   node ml/sms-topics/eval.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoTopic, classifyText } from '../../supabase/functions/_shared/smsTopicModel.ts';
import { smsTopic } from '../../supabase/functions/_shared/shopSms.ts';

const here = dirname(fileURLToPath(import.meta.url));
for (const file of ['heldout.json', 'heldout-fresh.json']) {
  console.log('\n== ' + file);
  report(JSON.parse(readFileSync(join(here, file), 'utf8')).texts, classifyText, autoTopic);
}
function report(texts, classify, auto) {
  let right = 0; const confusion = {};
  for (const [text, want] of texts) {
    const got = classify(text).topic;
    if (got === want) right++; else (confusion[want + ' -> ' + got] ??= []).push(text);
  }
  console.log('\nheld-out texts', texts.length, 'sorted right', (100 * right / texts.length).toFixed(1) + '%');
  for (const [k, v] of Object.entries(confusion)) console.log('  ' + k + ':', v.join(' | '));
  for (const [name, fn] of [['old exact phrases', smsTopic], ['trained model', auto]]) {
    let sent = 0, wrong = 0, answerable = 0, answered = 0;
    for (const [text, want] of texts) {
      const t = fn(text);
      if (['status', 'hours', 'link'].includes(want)) answerable++;
      if (t !== 'review') { sent++; if (t !== want) { wrong++; console.log('    wrong auto-reply:', text, '->', t); } else answered++; }
    }
    console.log(`  ${name}: auto-answers ${answered} of ${answerable} answerable texts (${(100 * answered / answerable).toFixed(0)}%), wrong auto-replies ${wrong}`);
  }
}
