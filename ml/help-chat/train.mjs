// Trains the Help chat models and writes talkshops/public/help-chat-model.json.
//   node ml/help-chat/train.mjs        (downloads CLINC150 once into ml/help-chat/.cache, then runs eval.mjs)
//
// Two small softmax regressions over the words, word pairs and 4-letter pieces of a question (help-chat-features.js):
//   gate:   is this a Talk Shops question ("help"), a car repair question ("repair": belongs in How-to), or neither ("other")?
//   picker: which Help answer (talkshops/public/help-content.js) fits best?
// Training data: hand-written ways to ask each Help question (data.mjs); Mechanics Stack Exchange question titles
// already shipped with How-to (talkshops/public/se, CC BY-SA) for "repair"; CLINC150 (Larson et al. 2019, CC BY 3.0)
// for "other". No shop or customer data.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ASK, OTHER, REPAIR } from './data.mjs'; // data.mjs folds its MORE batch into ASK

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const require = createRequire(import.meta.url);
const { features } = require(join(root, 'talkshops/public/help-chat-features.js'));

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261110);

const cache = join(here, '.cache', 'clinc150.json');
if (!existsSync(cache)) {
  mkdirSync(dirname(cache), { recursive: true });
  const res = await fetch('https://raw.githubusercontent.com/clinc/oos-eval/master/data/data_full.json');
  if (!res.ok) throw new Error('CLINC150 download failed: ' + res.status);
  writeFileSync(cache, await res.text());
}
const clinc = JSON.parse(readFileSync(cache, 'utf8'));
// CLINC intents about fixing a car count as repair questions; ones that read like Talk Shops questions are left out.
const CAR = new Set(['oil_change_how', 'oil_change_when', 'tire_pressure', 'tire_change', 'jump_start', 'mpg', 'gas_type', 'last_maintenance']);
const SKIP = new Set(['schedule_maintenance', 'change_language', 'reset_settings', 'change_user_name', 'user_name', 'text', 'make_call', 'pay_bill', 'bill_due', 'bill_balance', 'cancel', 'sync_device', 'reminder', 'reminder_update', 'what_can_i_ask_you', 'order_status', 'application_status', 'translate', 'update_playlist', 'calendar_update', 'todo_list_update', 'shopping_list_update', 'change_accent', 'change_ai_name', 'change_speed', 'change_volume', 'pin_change', 'account_blocked', 'freeze_account', 'report_fraud', 'damaged_card', 'new_card', 'replacement_card_duration', 'card_declined', 'expiration_date']);

const HELP = Object.keys(ASK).filter((k) => k !== 'repair' && k !== 'other');
const typo = (s) => {
  const ws = s.split(' '); const i = Math.floor(rng() * ws.length); const w = ws[i];
  if (w.length < 5) return s;
  const j = 1 + Math.floor(rng() * (w.length - 2));
  ws[i] = rng() < 0.5 ? w.slice(0, j) + w.slice(j + 1) : w.slice(0, j) + w[j + 1] + w[j] + w.slice(j + 2);
  return ws.join(' ');
};
const help = [];
for (const q of HELP) {
  for (let r = 0; r < 3; r++) help.push({ text: q, y: q });
  for (const p of ASK[q]) { help.push({ text: p, y: q }); help.push({ text: typo(p), y: q }); }
}
const repair = [], other = [];
const se = JSON.parse(readFileSync(join(root, 'talkshops/public/se/index.json'), 'utf8')).map((r) => r[1]);
for (const t of se.filter((_, i) => i % Number(process.env.SE_EVERY ?? 3) === 0)) repair.push(t);
for (const t of REPAIR) for (let r = 0; r < 3; r++) repair.push(t);
[...clinc.train, ...clinc.oos_train].forEach(([t, intent], i) => {
  if (SKIP.has(intent)) return;
  if (CAR.has(intent)) repair.push(t);
  else if (i % Number(process.env.CLINC_EVERY ?? 3) === 0) other.push(t);
});
for (const t of OTHER) for (let r = 0; r < 3; r++) other.push(t);

/** Softmax regression with AdaGrad. rows: [{fs, y}]; returns the model as stored in the JSON file. */
function train(name, rows, classes, classWeight, { epochs = 25, minFeature = () => true, lr = 0.3, l2 = 1e-5, minW = 3, dense = false } = {}) {
  const seen = new Map();
  for (const r of rows) for (const f of r.fs) seen.set(f, (seen.get(f) || 0) + 1);
  const vocab = [...seen].filter(([f, n]) => minFeature(f, n)).map(([f]) => f);
  const index = new Map(vocab.map((f, i) => [f, i]));
  const data = rows.map((r) => ({ x: r.fs.map((f) => index.get(f)).filter((i) => i !== undefined), y: r.y, wt: r.wt ?? 1 }));
  const K = classes.length, V = vocab.length;
  console.log(name, 'examples', data.length, 'features', V);
  const w = new Float64Array(V * K), b = new Float64Array(K), g2 = new Float64Array(V * K).fill(1e-6), gb = new Float64Array(K).fill(1e-6);
  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = data.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [data[i], data[j]] = [data[j], data[i]]; }
    for (const { x, y, wt } of data) {
      const z = Float64Array.from(b);
      const scale = 1 / Math.sqrt(x.length || 1);
      for (const i of x) for (let k = 0; k < K; k++) z[k] += w[i * K + k] * scale;
      const m = Math.max(...z); let sum = 0;
      for (let k = 0; k < K; k++) { z[k] = Math.exp(z[k] - m); sum += z[k]; }
      for (let k = 0; k < K; k++) {
        const grad = (z[k] / sum - (k === y ? 1 : 0)) * classWeight[y] * wt;
        gb[k] += grad * grad; b[k] -= lr * grad / Math.sqrt(gb[k]);
        for (const i of x) {
          const at = i * K + k, gr = grad * scale + l2 * w[at];
          g2[at] += gr * gr; w[at] -= lr * gr / Math.sqrt(g2[at]);
        }
      }
    }
  }
  // Weights rounded to 8 bits. Dense: one byte per feature per class, base64. Sparse: per feature [class, weight, ...]
  // with near-zero weights dropped (fine for the 3-class gate; the picker needs every weight to stay well calibrated).
  let max = 0; for (const v of w) max = Math.max(max, Math.abs(v));
  const q = max / 127;
  const bias = Array.from(b, (v) => +v.toFixed(3));
  if (dense) {
    const buf = Buffer.alloc(w.length);
    for (let i = 0; i < w.length; i++) buf.writeInt8(Math.max(-127, Math.min(127, Math.round(w[i] / q))), i);
    return { classes, scale: q, bias, vocab, data: buf.toString('base64') };
  }
  const W = {};
  for (let i = 0; i < V; i++) {
    const pairs = [];
    for (let k = 0; k < K; k++) { const v = Math.round(w[i * K + k] / q); if (Math.abs(v) >= minW) pairs.push(k, v); }
    W[vocab[i]] = pairs.length ? pairs : 0; // kept even when empty: it still counts toward the question's length
  }
  return { classes, scale: q, bias, w: W };
}

const helpRows = help.map((r) => ({ fs: features(r.text), y: r.y }));
const helpFeats = new Set(helpRows.flatMap((r) => r.fs));


// Talk Shops wording that isn't a question still teaches the gate what Talk Shops talk sounds like:
// the Help answers, split into sentences, and the Training narration (talkshops/public/tour/lines.json).
const helpGlobal = {}; globalThis.window = helpGlobal; globalThis.document = { addEventListener() {} };
require(join(root, 'talkshops/public/help-content.js'));
const answers = helpGlobal.TALKSHOPS_HELP.sections.flatMap((s) => s.qs.map(([, a]) => a));
const lines = Object.values(JSON.parse(readFileSync(join(root, 'talkshops/public/tour/lines.json'), 'utf8')));
const talk = [...answers, ...lines].flatMap((t) => t.split(/(?<=[.?!])\s+/)).filter((t) => t.split(' ').length >= 4);

// Gate: Help examples pooled into one class. Whole words from everything; letter pieces and pairs only from Help.
const GATE = ['help', 'repair', 'other'];
const gateRows = [
  ...helpRows.map((r) => ({ fs: r.fs, y: 0 })),
  ...talk.map((t) => ({ fs: features(t), y: 0 })),
  ...repair.map((t) => ({ fs: features(t), y: 1 })),
  ...other.map((t) => ({ fs: features(t), y: 2 })),
];
const n = GATE.map((_, k) => gateRows.filter((r) => r.y === k).length);
const helpBoost = Number(process.env.GATE_HELP ?? 1.5);
const gateWeight = n.map((c, k) => (k === 0 ? helpBoost : 1) * Math.max(1, (Math.max(...n) / c) / 2));
console.log('gate classes', n.join('/'), 'weights', gateWeight.map((v) => v.toFixed(2)).join('/'));
const gate = train('gate', gateRows, GATE, gateWeight,
  { minFeature: (f, c) => helpFeats.has(f) || (f.startsWith('w:') && c >= Number(process.env.MIN_WORD ?? 2)) || (f.startsWith('c:') && c >= Number(process.env.MIN_PIECE ?? 6)), epochs: 15 });

// In this chat most questions are about Talk Shops, so lean the gate toward "help" when the words say little.
gate.bias[0] += Number(process.env.GATE_PRIOR ?? 1);

// Picker: only Help examples, so it only knows Help words and stays small.
// The picker also reads each Help answer (whole, at a lower weight): people ask using the answer's words too.
const qaByQ = Object.fromEntries(helpGlobal.TALKSHOPS_HELP.sections.flatMap((s) => s.qs));
const answerRows = Number(process.env.ANSWER_WT ?? 0.5) > 0 ? HELP.map((q) => ({ fs: features(qaByQ[q]), y: HELP.indexOf(q), wt: Number(process.env.ANSWER_WT ?? 0.5) })) : [];
const picker = train('picker', [...helpRows.map((r) => ({ fs: r.fs, y: HELP.indexOf(r.y) })), ...answerRows], HELP, HELP.map(() => 1), { epochs: 40, dense: true, minFeature: (f, c) => !f.startsWith('c:') || c >= 2 });

const model = { version: new Date().toISOString().slice(0, 10), gate, picker };
writeFileSync(join(root, 'talkshops/public/help-chat-model.json'), JSON.stringify(model));
console.log('wrote help-chat-model.json');
execFileSync(process.execPath, [join(here, 'eval.mjs')], { stdio: 'inherit' });
