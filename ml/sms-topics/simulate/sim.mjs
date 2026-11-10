// Offline simulation of the learning loop: simulated customers text, simulated staff reply, rows are scrubbed and
// saved like the live app does, then the trainer retrains with them and we score before/after.
import { writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const R = new URL('../../../', import.meta.url).pathname;
const { learnRow } = await import(R + 'supabase/functions/_shared/learnTexts.ts');
const { classifyText, autoTopic } = await import(R + 'supabase/functions/_shared/smsTopicModel.ts');
let s = 99; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; const pick = (a) => a[Math.floor(rnd() * a.length)];
const name = ['Mike', 'Sarah', 'Dave', 'Jen', 'Carlos', 'Amy', 'Tom', 'Lisa'];
const car = ['whip', 'rig', 'ride', 'Tahoe', 'Civic', 'Ram', 'Kia', 'car', 'truck', 'Prius', 'Forester'];
const T = {
  status: ['u done w/ the {c} yet', 'whens pickup', 'how we looking on the {c}', 'yo {c} good?', 'any movement on my {c}', 'still in the bay?', 'think ill have it back tonight',
    'did the {c} get fixed', 'hows my baby doing lol', '{n} here, {c} ready??', 'can i swing by and grab it', 'was it the alternator or what', 'is the work all wrapped up',
    'whats the holdup on my {c}', 'parts show up?', 'r u guys still on my {c}', 'any word on the {c}? thanks {n}', 'is it fixed now', 'when do i get it back', 'all good with the {c}?'],
  hours: ['u open sat', 'whats the latest i can come by today', 'when yall close up', 'r u open on the holiday', 'what time can i come in tmrw morning', 'open sunday??',
    'hey when does the shop close tonight', 'how late is someone there', 'shop hrs?', 'are u guys there till 6'],
  link: ['cant open the link', 'can u text me the quote', 'link aint working', 'need the estimate again', 'where do i click to approve', 'whats the site to see my estimate', 'send that page again pls'],
  approval: ['yeah do it', 'go ahead w the brakes', 'ok fix whatever it needs', 'just do the oil change for now', 'skip the wipers', 'do the struts too', 'ya approve all', 'hold off on tires'],
  review: ['how much', 'ill be there at 5', 'can u call me', 'thx', 'ok', 'is it safe to drive home', 'that price is crazy', 'got a loaner?', 'can my wife pick it up',
    'check engine light back on', 'do u take venmo', 'can u do it cheaper', 'what does a cv axle do', 'k see you then', 'is it done? how much?', 'can i bring my other car in friday',
    'stop', '{n} said it would be 200', 'u guys do tint?', 'need it by 3 or im screwed'],
};
const make = (topic) => pick(T[topic]).replace('{c}', () => pick(car)).replace('{n}', () => pick(name));
const topics = Object.keys(T), weights = { status: 0.45, hours: 0.08, link: 0.07, approval: 0.12, review: 0.28 };
function draw() { let r = rnd(); for (const t of topics) { if ((r -= weights[t]) <= 0) return t; } return 'review'; }
const N = Number(process.argv[2] || 3000), LABEL = Number(process.argv[3] || 0);
const pool = Array.from({ length: N }, () => { const topic = draw(); return { text: make(topic), topic }; });
// Staff: when the suggestion fits, they send it as is 80% of the time; otherwise they write their own.
const rows = [];
for (const m of pool) {
  const guess = classifyText(m.text).topic;
  const fits = guess === m.topic && guess !== 'review';
  const sugg = 'SUGGESTED';
  const reply = fits && rnd() < 0.8 ? sugg : 'Will check and text you back';
  const row = learnRow(m.text, reply, [sugg]);
  if (row) rows.push({ ...row, label: null, truth: m.topic });
}
// Optional: someone labels LABEL rows by hand (the ones staff didn't use).
let labeled = 0;
for (const r of rows) if (labeled < LABEL && r.outcome !== 'used') { r.label = r.truth; labeled++; }
writeFileSync('/tmp/talkshops-sim-rows.json', JSON.stringify(rows.map(({ truth, ...r }) => r)));
const used = rows.filter((r) => r.outcome === 'used').length;
// Score on fresh simulated texts (new draws, same simulated customers) before and after.
const test = Array.from({ length: 1000 }, () => { const topic = draw(); return { text: make(topic), topic }; });
writeFileSync('/tmp/talkshops-sim-test.json', JSON.stringify(test));
console.log(JSON.stringify({ texts: N, saved: rows.length, staffUsed: used, handLabeled: labeled }));
