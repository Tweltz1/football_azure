// Makes real product photo mockups for the Weltzcraft merch page with Printful's Mockup Generator.
// Reads merch/products.json, prints each logo (served from this public repo at the current commit)
// onto the Printful catalog product, and saves the first mockup to weltzcraft-site/img/merch/<slug>.jpg.
// Env: PRINTFUL_API_TOKEN (required), PRINTFUL_STORE_ID (only for account-level tokens),
//      ASSET_BASE (raw URL base for merch/print, e.g. https://raw.githubusercontent.com/<repo>/<sha>/merch/print),
//      ONLY (optional comma list of slugs).
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.printful.com';
const TOKEN = process.env.PRINTFUL_API_TOKEN;
const STORE = process.env.PRINTFUL_STORE_ID;
const BASE = process.env.ASSET_BASE;
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const OUT = 'weltzcraft-site/img/merch';
if (!TOKEN) { console.log('::warning::PRINTFUL_API_TOKEN is not set, skipping.'); process.exit(0); }
if (!BASE) { console.error('ASSET_BASE is required'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pf(p, opts = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(API + p, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(STORE ? { 'X-PB-Store-Id': STORE } : {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) { const wait = (body?.result?.match?.(/(\d+) seconds/)?.[1] || 30) * 1000; console.log(`rate limited, waiting ${wait / 1000}s`); await sleep(wait); continue; }
    if (!res.ok) throw new Error(`${opts.method || 'GET'} ${p} -> ${res.status} ${JSON.stringify(body).slice(0, 400)}`);
    return body.result;
  }
  throw new Error(`gave up on ${p}`);
}

const cfg = JSON.parse(fs.readFileSync('merch/products.json', 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const catalog = await pf('/products');
console.log(`Printful catalog: ${catalog.length} products`);

const results = [];
for (const item of cfg.items) {
  if (ONLY.length && !ONLY.includes(item.slug)) continue;
  try {
    const re = new RegExp(item.match, 'i');
    const prod = catalog.find(p => re.test(`${p.title} ${p.model} ${p.brand || ''}`) && !p.is_discontinued);
    if (!prod) throw new Error(`no catalog product matches /${item.match}/`);
    const detail = await pf(`/products/${prod.id}`);
    const variants = detail.variants || [];
    let variant;
    for (const c of item.colors) {
      variant = variants.find(v => (v.color || '').toLowerCase() === c.toLowerCase() && (!item.size || v.size === item.size))
        || variants.find(v => (v.color || '').toLowerCase() === c.toLowerCase());
      if (variant) break;
    }
    if (!variant && item.colors.includes('')) variant = variants[0];
    if (!variant) throw new Error(`no color ${item.colors.join('/')} on "${prod.title}". Colors: ${[...new Set(variants.map(v => v.color))].join(', ')}`);

    const pfiles = await pf(`/mockup-generator/printfiles/${prod.id}`);
    const vp = (pfiles.variant_printfiles || []).find(v => v.variant_id === variant.id) || pfiles.variant_printfiles?.[0];
    const placement = item.placements.find(pl => vp?.placements?.[pl]);
    if (!placement) throw new Error(`placements ${item.placements} not offered. Available: ${Object.keys(vp?.placements || pfiles.available_placements || {}).join(', ')}`);
    const printfile = pfiles.printfiles.find(f => f.printfile_id === vp.placements[placement]);
    const AW = printfile.width, AH = printfile.height;

    // Logo size inside the print area, keeping the logo's own aspect ratio.
    const dims = (() => { const b = fs.readFileSync(path.join('merch/print', item.file)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; })();
    let w = Math.round(AW * item.width), h = Math.round(w * dims.h / dims.w);
    if (h > AH * 0.9) { h = Math.round(AH * 0.9); w = Math.round(h * dims.w / dims.h); }
    const file = {
      placement,
      image_url: `${BASE}/${item.file}`,
      position: { area_width: AW, area_height: AH, width: w, height: h, top: Math.round(AH * item.top), left: Math.round((AW - w) / 2) },
    };
    const body = { variant_ids: [variant.id], format: 'jpg', files: [file] };
    if (item.thread_colors) file.options = [{ id: 'thread_colors', value: item.thread_colors }];

    const task = await pf(`/mockup-generator/create-task/${prod.id}`, { method: 'POST', body: JSON.stringify(body) });
    let done;
    for (let i = 0; i < 40; i++) {
      await sleep(4000);
      done = await pf(`/mockup-generator/task?task_key=${encodeURIComponent(task.task_key)}`);
      if (done.status !== 'pending') break;
    }
    if (done.status !== 'completed') throw new Error(`mockup task ${done.status}: ${done.error || ''}`);
    const m = done.mockups[0];
    const img = await fetch(m.mockup_url);
    fs.writeFileSync(path.join(OUT, `${item.slug}.jpg`), Buffer.from(await img.arrayBuffer()));
    console.log(`✓ ${item.slug}: ${prod.title} / ${variant.color} ${variant.size || ''} / ${placement}`);
    results.push({ slug: item.slug, ok: true, product_id: prod.id, product: prod.title, variant_id: variant.id, color: variant.color, placement });
  } catch (e) {
    console.log(`::warning::${item.slug}: ${e.message}`);
    results.push({ slug: item.slug, ok: false, error: e.message });
  }
  await sleep(2500);
}
fs.writeFileSync('merch/mockup-results.json', JSON.stringify(results, null, 2) + '\n');
const ok = results.filter(r => r.ok).length;
console.log(`${ok}/${results.length} mockups made`);
