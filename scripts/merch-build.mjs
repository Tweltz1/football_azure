// Builds the Weltzcraft merch from merch/products.json (every product x color x logo):
//   node scripts/merch-build.mjs plan      -> merch/plan.json (Printful catalog product, sizes, print area per product+color)
//   python3 scripts/merch_place.py          -> merch/print/placed/<slug>.png
//   node scripts/merch-build.mjs mockups   -> weltzcraft-site/img/merch/<slug>.jpg (real Printful mockups; skips unchanged)
//   node scripts/merch-build.mjs create    -> Printful store products + weltzcraft-site/merch-catalog.json (skips unchanged)
// Env: PRINTFUL_API_TOKEN, optional PRINTFUL_STORE_ID, ASSET_BASE (raw URL of merch/print at a pushed commit), ONLY (slug prefix filter).
import fs from 'node:fs';
import crypto from 'node:crypto';

const API = 'https://api.printful.com';
const TOKEN = process.env.PRINTFUL_API_TOKEN;
const STORE = process.env.PRINTFUL_STORE_ID;
const BASE = process.env.ASSET_BASE;
const ONLY = (process.env.ONLY || '').trim();
const MODE = process.argv[2];
if (!TOKEN) { console.log('::warning::PRINTFUL_API_TOKEN is not set, skipping.'); process.exit(0); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pf(p, opts = {}, okStatuses = []) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(API + p, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(STORE ? { 'X-PB-Store-Id': STORE } : {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) { const s = Number(String(body?.result || '').match(/(\d+) seconds/)?.[1] || 30); console.log(`rate limited ${s}s`); await sleep((s + 1) * 1000); continue; }
    if (okStatuses.includes(res.status)) return { status: res.status, ...body };
    if (!res.ok) throw new Error(`${opts.method || 'GET'} ${p} -> ${res.status} ${JSON.stringify(body).slice(0, 400)}`);
    return body.result;
  }
  throw new Error(`gave up on ${p}`);
}
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const cfg = readJson('merch/products.json');
const upcharge = size => ({ '2XL': 2, '3XL': 3, '4XL': 4 }[size] || 0);
const hashFile = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12);
function* combos() {
  for (const prod of cfg.products) for (const color of prod.colors) for (const lk of Object.keys(cfg.logos)) {
    const slug = `${prod.key}-${color.key}-${lk}`;
    if (ONLY && !slug.startsWith(ONLY)) continue;
    yield { prod, color, lk, slug, pc: `${prod.key}-${color.key}` };
  }
}

if (MODE === 'plan') {
  const catalog = await pf('/products');
  const plan = {};
  for (const prod of cfg.products) {
    const re = new RegExp(prod.match, 'i');
    const cat = catalog.find(p => re.test(`${p.title} ${p.model} ${p.brand || ''}`) && !p.is_discontinued);
    if (!cat) { console.log(`::warning::${prod.key}: no catalog product /${prod.match}/`); continue; }
    const variants = (await pf(`/products/${cat.id}`)).variants || [];
    const pfiles = await pf(`/mockup-generator/printfiles/${cat.id}`);
    for (const color of prod.colors) {
      let name = color.printful.find(c => c && variants.some(v => (v.color || '').toLowerCase() === c.toLowerCase()));
      if (!name && color.printful.includes('')) name = variants[0]?.color;
      const ofColor = variants.filter(v => (v.color || '').toLowerCase() === String(name).toLowerCase());
      let chosen = prod.sizes ? prod.sizes.map(s => ofColor.find(v => v.size === s)).filter(Boolean)
        : prod.size ? ofColor.filter(v => v.size === prod.size) : ofColor;
      chosen = chosen.length ? chosen : ofColor.slice(0, 1);
      if (!chosen.length) { console.log(`::warning::${prod.key}-${color.key}: no variants. Colors: ${[...new Set(variants.map(v => v.color))].join(', ')}`); continue; }
      const vp = pfiles.variant_printfiles.find(v => v.variant_id === chosen[0].id) || pfiles.variant_printfiles[0];
      const placement = prod.placements.find(pl => vp.placements[pl]);
      const pfile = pfiles.printfiles.find(f => f.printfile_id === vp.placements[placement]);
      plan[`${prod.key}-${color.key}`] = {
        product_id: cat.id, product: cat.title, color: name, placement, area: { w: pfile.width, h: pfile.height },
        variants: chosen.map(v => ({ id: v.id, size: v.size })),
      };
      console.log(`${prod.key}-${color.key}: ${cat.title} / ${name} / ${placement} ${pfile.width}x${pfile.height} / ${chosen.map(v => v.size).join(',')}`);
    }
    await sleep(800);
  }
  fs.writeFileSync('merch/plan.json', JSON.stringify(plan, null, 2) + '\n');
}

if (MODE === 'mockups') {
  const plan = readJson('merch/plan.json', {});
  const state = readJson('merch/mockups.json', {});
  fs.mkdirSync('weltzcraft-site/img/merch', { recursive: true });
  let made = 0, skipped = 0, failed = 0;
  for (const c of combos()) {
    const p = plan[c.pc]; if (!p) continue;
    const placed = `merch/print/placed/${c.slug}.png`;
    const h = hashFile(placed);
    if (state[c.slug]?.hash === h && fs.existsSync(`weltzcraft-site/img/merch/${c.slug}.webp`)) { skipped++; continue; }
    try {
      const v = p.variants.find(x => x.size === 'M') || p.variants[0];
      const task = await pf(`/mockup-generator/create-task/${p.product_id}`, { method: 'POST', body: JSON.stringify({
        variant_ids: [v.id], format: 'jpg',
        files: [{ placement: p.placement, image_url: `${BASE}/placed/${c.slug}.png`,
          position: { area_width: p.area.w, area_height: p.area.h, width: p.area.w, height: p.area.h, top: 0, left: 0 } }],
      }) });
      let done;
      for (let i = 0; i < 45; i++) { await sleep(4000); done = await pf(`/mockup-generator/task?task_key=${encodeURIComponent(task.task_key)}`); if (done.status !== 'pending') break; }
      if (done.status !== 'completed') throw new Error(`task ${done.status} ${done.error || ''}`);
      const url = done.mockups[0].mockup_url;
      fs.writeFileSync(`weltzcraft-site/img/merch/${c.slug}.jpg`, Buffer.from(await (await fetch(url)).arrayBuffer()));
      state[c.slug] = { hash: h, mockup_url: url };
      made++; console.log(`✓ mockup ${c.slug}`);
      fs.writeFileSync('merch/mockups.json', JSON.stringify(state, null, 2) + '\n');
    } catch (e) { failed++; console.log(`::warning::mockup ${c.slug}: ${e.message}`); }
    await sleep(1500);
  }
  console.log(`mockups: ${made} made, ${skipped} unchanged, ${failed} failed`);
}

if (MODE === 'create') {
  const plan = readJson('merch/plan.json', {});
  const mockups = readJson('merch/mockups.json', {});
  const threads = readJson('merch/threads.json', {});
  const prev = readJson('weltzcraft-site/merch-catalog.json', { items: {} });
  const out = {
    updated: new Date().toISOString(),
    logos: Object.fromEntries(Object.entries(cfg.logos).map(([k, l]) => [k, { name: l.name }])),
    products: cfg.products.map(p => ({ key: p.key, name: p.name, price: p.price, sizes: p.sizes || null,
      colors: p.colors.filter(c => plan[`${p.key}-${c.key}`]).map(c => ({ key: c.key, name: c.name })) })),
    items: { ...(ONLY ? prev.items : {}) },
  };
  let made = 0, kept = 0, failed = 0;
  for (const c of combos()) {
    const p = plan[c.pc]; if (!p) continue;
    const ext = `wc-${c.slug}`;
    const h = hashFile(`merch/print/placed/${c.slug}.png`);
    const old = prev.items?.[c.slug];
    if (old && old.hash === h && old.price === c.prod.price && old.variants?.length === p.variants.length) { out.items[c.slug] = old; kept++; continue; }
    try {
      const existing = await pf(`/store/products/@${ext}`, {}, [404]);
      if (existing && existing.status !== 404) { await pf(`/store/products/@${ext}`, { method: 'DELETE' }); await sleep(1000); }
      const body = {
        sync_product: { name: `${c.prod.name} · ${c.color.name} · ${cfg.logos[c.lk].name}`, external_id: ext,
          ...(mockups[c.slug]?.mockup_url ? { thumbnail: mockups[c.slug].mockup_url } : {}) },
        sync_variants: p.variants.map(v => ({
          external_id: `${ext}-${String(v.size).replace(/[^A-Za-z0-9]+/g, '')}`,
          variant_id: v.id,
          retail_price: (c.prod.price + upcharge(v.size)).toFixed(2),
          files: [{ type: p.placement, url: `${BASE}/placed/${c.slug}.png` }],
          ...(threads[c.slug] ? { options: [{ id: p.placement.replace('embroidery_', 'thread_colors_'), value: threads[c.slug] }] } : {}),
        })),
      };
      try { await pf('/store/products', { method: 'POST', body: JSON.stringify(body) }); }
      catch (e) { if (!body.sync_product.thumbnail) throw e; delete body.sync_product.thumbnail; await pf('/store/products', { method: 'POST', body: JSON.stringify(body) }); }
      const got = await pf(`/store/products/@${ext}`);
      out.items[c.slug] = {
        hash: h, price: c.prod.price,
        variants: got.sync_variants.map(sv => ({ size: (p.variants.find(v => v.id === sv.variant_id) || {}).size || null, id: sv.id, price: Number(sv.retail_price) })),
      };
      made++; console.log(`✓ product ${c.slug}`);
    } catch (e) { failed++; console.log(`::warning::product ${c.slug}: ${e.message}`); }
    await sleep(1200);
  }
  fs.writeFileSync('weltzcraft-site/merch-catalog.json', JSON.stringify(out, null, 1) + '\n');
  console.log(`products: ${made} made, ${kept} unchanged, ${failed} failed`);
}
