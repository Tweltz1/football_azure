// Monthly retrain of the customer text sorter with real (scrubbed) shop texts. Run by
// .github/workflows/sms-sorter-retrain.yml. Keeps the new model only if, on the hand-written test texts, it sorts at
// least as many right, answers at least as many automatically, and sends no wrong automatic reply.
// Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID. Prints counts only, never texts (the build log is public).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const weights = join(root, 'supabase/functions/_shared/smsTopicWeights.ts');
const tmp = (f) => join(tmpdir(), f);
const MIN_ROWS = Number(process.env.MIN_ROWS || 100);

const res = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_ID}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "select text, topic, outcome, label from public.talkshops_learn_texts where created_at > now() - interval '12 months'" }),
});
if (!res.ok) { console.log('Could not read the learning table:', res.status); process.exit(1); }
const rows = await res.json();
const usable = rows.filter((r) => r.label || r.outcome === 'used');
console.log(`learning rows ${rows.length}, usable ${usable.length} (need ${MIN_ROWS})`);
if (usable.length < MIN_ROWS) { console.log('Not enough real texts yet; keeping the current model.'); process.exit(0); }
writeFileSync(tmp('learn-rows.json'), JSON.stringify(rows));

const evalTo = (file) => { execFileSync(process.execPath, [join(here, 'eval.mjs')], { env: { ...process.env, EVAL_JSON: file }, stdio: 'ignore' }); return JSON.parse(readFileSync(file, 'utf8'))['heldout-fresh.json']; };
const before = evalTo(tmp('before.json'));
copyFileSync(weights, tmp('weights-before.ts'));
execFileSync(process.execPath, [join(here, 'train.mjs')], { env: { ...process.env, LEARN_ROWS: tmp('learn-rows.json') }, stdio: ['ignore', 'ignore', 'inherit'] });
const after = evalTo(tmp('after.json'));
console.log('before', JSON.stringify(before), 'after', JSON.stringify(after));
if (after.wrong > 0 || after.right < before.right || after.answered < before.answered) {
  copyFileSync(tmp('weights-before.ts'), weights);
  console.log('New model is not better; keeping the current one.');
  process.exit(0);
}
writeFileSync(join(tmpdir(), 'sorter-improved'), '1');
console.log('New model is at least as good; it will be published.');
