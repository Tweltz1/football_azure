// Read-only check that every item the merch page sells matches its Printful store product:
// right blank, color, size, print spot, print file, thread colors and price. Changes nothing on Printful.
//   node scripts/merch-audit.mjs      (env: PRINTFUL_API_TOKEN, optional PRINTFUL_STORE_ID)
import fs from 'node:fs';
import crypto from 'node:crypto';

const API = 'https://api.printful.com';
const TOKEN = process.env.PRINTFUL_API_TOKEN;
const STORE = process.env.PRINTFUL_STORE_ID;
if (!TOKEN) { console.log('::error::PRINTFUL_API_TOKEN is not set'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pf(p) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(API + p, { headers: { Authorization: `Bearer ${TOKEN}`, ...(STORE ? { 'X-PB-Store-Id': STORE } : {}) } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) { const s = Number(String(body?.result || '').match(/(\d+) seconds/)?.[1] || 30); await sleep((s + 1) * 1000); continue; }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${p} -> ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
    return body;
  }
  throw new Error(`gave up on ${p}`);
}
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const cfg = read('merch/products.json'), plan = read('merch/plan.json'), threads = read('merch/threads.json'), cat = read('weltzcraft-site/merch-catalog.json');
const upcharge = size => ({ '2XL': 2, '3XL': 3, '4XL': 4 }[size] || 0);
const threadOption = pl => pl === 'embroidery_front' ? 'thread_colors' : pl.replace('embroidery_', 'thread_colors_');
const md5 = f => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const problems = [], notes = [];
const bad = (slug, msg) => { problems.push(`${slug}: ${msg}`); console.log(`✗ ${slug}: ${msg}`); };
let checked = 0, variantsChecked = 0;
const catalogVariantCache = {};
async function catalogVariant(id) { return catalogVariantCache[id] ??= (await pf(`/products/variant/${id}`))?.result || null; }

for (const [slug, item] of Object.entries(cat.items)) {
  const [pk, ck, lk] = slug.split('-');
  const prod = cfg.products.find(p => p.key === pk), color = prod?.colors.find(c => c.key === ck), p = plan[`${pk}-${ck}`];
  if (!prod || !color || !p || !cfg.logos[lk]) { bad(slug, 'on the page but not in products.json / plan.json'); continue; }
  const got = (await pf(`/store/products/@wc-${slug}`))?.result;
  if (!got) { bad(slug, 'NO Printful store product'); continue; }
  checked++;
  const wantName = `${prod.name} · ${color.name} · ${cfg.logos[lk].name}`;
  if (got.sync_product.name !== wantName) bad(slug, `Printful name "${got.sync_product.name}" vs "${wantName}"`);
  if (got.sync_variants.length !== item.variants.length) bad(slug, `${got.sync_variants.length} Printful variants vs ${item.variants.length} on the page`);
  const wantSizes = prod.sizes || null;
  if (wantSizes) { const have = item.variants.map(v => v.size); const miss = wantSizes.filter(s => !have.includes(s)); if (miss.length) notes.push(`${slug}: size ${miss.join(', ')} not offered by Printful in this color`); }
  const placedFile = `merch/print/placed/${slug}.png`;
  const localMd5 = fs.existsSync(placedFile) ? md5(placedFile) : null;
  if (!localMd5) bad(slug, 'no placed print file in the repo');
  for (const v of item.variants) {
    const sv = got.sync_variants.find(x => x.id === v.id);
    if (!sv) { bad(slug, `size ${v.size}: page variant id ${v.id} is not in the Printful product`); continue; }
    variantsChecked++;
    const pv = p.variants.find(x => x.id === sv.variant_id);
    if (!pv) bad(slug, `size ${v.size}: Printful blank variant ${sv.variant_id} is not in the plan for ${pk}-${ck}`);
    else if (String(pv.size) !== String(v.size)) bad(slug, `page says size ${v.size} but the Printful variant is size ${pv.size}`);
    if (sv.product && sv.product.product_id !== p.product_id) bad(slug, `size ${v.size}: blank product ${sv.product.product_id} vs planned ${p.product_id} (${p.product})`);
    // The blank itself: color and size as Printful's own catalog names them.
    const cv = await catalogVariant(sv.variant_id);
    const cvv = cv?.variant;
    if (!cvv) bad(slug, `size ${v.size}: Printful catalog variant ${sv.variant_id} not found`);
    else {
      if (norm(cvv.color) !== norm(p.color)) bad(slug, `size ${v.size}: blank color "${cvv.color}" vs planned "${p.color}"`);
      if (!color.printful.some(c => norm(c) === norm(cvv.color)) && !color.printful.includes('')) bad(slug, `size ${v.size}: blank color "${cvv.color}" is not one of ${JSON.stringify(color.printful)}`);
      if (String(cvv.size) !== String(v.size)) bad(slug, `size ${v.size}: blank size is "${cvv.size}"`);
      if (cvv.in_stock === false) notes.push(`${slug} ${v.size || ''}: Printful says this blank is out of stock right now`);
      if (cv.product?.is_discontinued) bad(slug, 'Printful has discontinued this blank');
    }
    const wantPrice = prod.price + upcharge(v.size);
    if (Number(sv.retail_price) !== wantPrice || v.price !== wantPrice) bad(slug, `size ${v.size}: price page $${v.price} / Printful $${sv.retail_price} / should be $${wantPrice}`);
    if (sv.synced === false) bad(slug, `size ${v.size}: Printful marks the variant as not synced`);
    const files = (sv.files || []).filter(f => f.type !== 'preview');
    const main = files.find(f => f.type === p.placement);
    if (!main) bad(slug, `size ${v.size}: no print file on "${p.placement}" (has ${files.map(f => f.type).join(', ') || 'none'})`);
    else {
      if (!String(main.filename || main.url || '').includes(`${slug}.png`)) bad(slug, `size ${v.size}: print file is "${main.filename}", expected ${slug}.png`);
      if (main.status && main.status !== 'ok') bad(slug, `size ${v.size}: print file status "${main.status}"`);
      if (localMd5 && main.hash && main.hash !== localMd5) bad(slug, `size ${v.size}: Printful's print file differs from the one in the repo (old artwork?)`);
      if (main.dpi && main.dpi < 120) notes.push(`${slug}: print file is only ${main.dpi} dpi`);
    }
    for (const e of p.extras || []) if (!files.find(f => f.type === e.placement)) bad(slug, `size ${v.size}: missing extra print "${e.placement}"`);
    if (/^embroidery/.test(p.placement)) {
      const opt = (sv.options || []).find(o => o.id === threadOption(p.placement));
      const want = threads[slug];
      const have = Array.isArray(opt?.value) ? opt.value : [];
      if (want && JSON.stringify([...have].sort()) !== JSON.stringify([...want].sort())) bad(slug, `size ${v.size}: thread colors ${JSON.stringify(have)} vs ${JSON.stringify(want)}`);
      if (!want) notes.push(`${slug}: embroidered but no thread colors listed`);
    }
  }
  if (checked % 25 === 0) console.log(`… ${checked} checked`);
  await sleep(250);
}

// Anything still sitting in the Printful store that the page no longer sells (can't be ordered; just clutter).
const stale = [];
for (let offset = 0; ; offset += 100) {
  const r = await pf(`/store/products?limit=100&offset=${offset}`);
  for (const sp of r.result) if (!cat.items[String(sp.external_id || '').replace(/^wc-/, '')]) stale.push(`${sp.external_id} (${sp.name})`);
  if (offset + 100 >= (r.paging?.total || 0)) break;
}
console.log(`\n== Merch audit: ${checked}/${Object.keys(cat.items).length} items and ${variantsChecked} sizes checked against Printful ==`);
console.log(`Problems: ${problems.length}`); problems.forEach(x => console.log('  ' + x));
console.log(`Notes: ${notes.length}`); [...new Set(notes)].forEach(x => console.log('  ' + x));
console.log(`Printful products the page no longer sells: ${stale.length}`); stale.forEach(x => console.log('  ' + x));
