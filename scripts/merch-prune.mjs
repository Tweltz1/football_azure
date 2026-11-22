// Removes Printful store products the merch page no longer sells (old concepts and retired products), so the
// Printful dashboard only holds what can be ordered. Never touches anything listed in weltzcraft-site/merch-catalog.json.
//   node scripts/merch-prune.mjs            lists what would go
//   CONFIRM=delete node scripts/merch-prune.mjs   deletes them
import fs from 'node:fs';

const API = 'https://api.printful.com';
const TOKEN = process.env.PRINTFUL_API_TOKEN;
const STORE = process.env.PRINTFUL_STORE_ID;
const GO = process.env.CONFIRM === 'delete';
if (!TOKEN) { console.log('::error::PRINTFUL_API_TOKEN is not set'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pf(p, opts = {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(API + p, { ...opts, headers: { Authorization: `Bearer ${TOKEN}`, ...(STORE ? { 'X-PB-Store-Id': STORE } : {}) } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) { const s = Number(String(body?.result || '').match(/(\d+) seconds/)?.[1] || 30); await sleep((s + 1) * 1000); continue; }
    if (!res.ok) throw new Error(`${opts.method || 'GET'} ${p} -> ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
    return body;
  }
  throw new Error(`gave up on ${p}`);
}
const cat = JSON.parse(fs.readFileSync('weltzcraft-site/merch-catalog.json', 'utf8'));
// Only ever our own retired families: concept samples and products that were taken off the page.
const RETIRED = /^(wcc-|wc-(shield|chrome|varsity)-|wc-cord-[a-z]+-v7$)/;
const all = [];
for (let offset = 0; ; offset += 100) {
  const r = await pf(`/store/products?limit=100&offset=${offset}`);
  all.push(...r.result);
  if (offset + 100 >= (r.paging?.total || 0)) break;
}
const gone = all.filter(sp => { const ext = String(sp.external_id || ''); return RETIRED.test(ext) && !cat.items[ext.replace(/^wc-/, '')]; });
console.log(`${all.length} Printful store products, ${Object.keys(cat.items).length} on the page, ${gone.length} retired`);
let n = 0;
for (const sp of gone) {
  if (!GO) { console.log(`would delete ${sp.external_id} (${sp.name})`); continue; }
  await pf(`/store/products/${sp.id}`, { method: 'DELETE' });
  n++; console.log(`deleted ${sp.external_id} (${sp.name})`);
  await sleep(700);
}
console.log(GO ? `Deleted ${n}.` : 'Dry run: nothing deleted.');
