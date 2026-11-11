// Scores the Help chat model on questions written separately from the training set (heldout.json).
//   node ml/help-chat/eval.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const require = createRequire(import.meta.url);
globalThis.HelpChatFeatures = require(join(root, 'talkshops/public/help-chat-features.js'));
const { classify, decide } = require(join(root, 'talkshops/public/help-chat-model-run.js'));
const model = JSON.parse(readFileSync(join(root, 'talkshops/public/help-chat-model.json'), 'utf8'));
const tests = JSON.parse(readFileSync(join(here, process.argv[2] || 'heldout.json'), 'utf8'));
let top1 = 0, top3 = 0, answered = 0, answeredWrong = 0, routedWrong = 0, helpN = 0;
const wrong = [];
for (const [text, want] of tests) {
  const c = classify(model, text);
  const ranked = c.ranked;
  const d = decide(c);
  const got = d.kind === 'repair' || d.kind === 'other' ? d.kind : ranked[0].label;
  if (got === want) top1++;
  if (want !== 'repair' && want !== 'other') { helpN++; if (d.kind !== 'repair' && d.kind !== 'other' && ranked.slice(0, 3).some((r) => r.label === want)) top3++; }
  if (d.kind === 'answer') { answered++; if (d.label !== want) { answeredWrong++; wrong.push(['ANSWERED WRONG', text, want, d.label, d.p.toFixed(2)]); } }
  else if ((d.kind === 'repair' || d.kind === 'other') && d.kind !== want) { routedWrong++; wrong.push(['ROUTED ' + d.kind, text, want, JSON.stringify(c.gate, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v)]); }
  else if (d.kind === 'choose' && ranked[0].label !== want) wrong.push(['choose (top ' + ranked[0].label + ')', text, want, d.p?.toFixed?.(2)]);
}
for (const w of wrong) console.log(w.join(' | '));
console.log(`right result (answer, How-to or off-topic) first ${(100 * top1 / tests.length).toFixed(1)}% of ${tests.length}; right answer in top 3 Help choices ${(100 * top3 / helpN).toFixed(1)}% of ${helpN}`);
console.log(`answered outright ${answered}, of which WRONG ${answeredWrong}; wrongly sent to How-to/off-topic ${routedWrong}`);
