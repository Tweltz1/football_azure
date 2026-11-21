// Merch CONCEPTS (not the live store): real Printful mockups + Printful store products for new merch ideas so
// Tyler can see them before anything goes on weltzcraft.com/merch. Nothing here touches merch-catalog.json.
//   node scripts/merch-concepts.mjs discover  -> merch/concepts/catalog.json (candidate blanks: colors, sizes, print areas)
//   python3 scripts/merch_concepts_place.py   -> merch/concepts/placed/<code>-<color>-<placement>.png
//   node scripts/merch-concepts.mjs mockups   -> merch/concepts/mockups/<code>-<color>[-<n>].jpg
//   node scripts/merch-concepts.mjs create    -> Printful store products named "Concept <code> ..." (external_id wcc-...)
// Env: PRINTFUL_API_TOKEN, optional PRINTFUL_STORE_ID, ASSET_BASE (raw URL of merch/concepts at a pushed commit), ONLY.
import fs from 'node:fs';

const API = 'https://api.printful.com';
const TOKEN = process.env.PRINTFUL_API_TOKEN;
const STORE = process.env.PRINTFUL_STORE_ID;
const BASE = process.env.ASSET_BASE;
const ONLY = (process.env.ONLY || '').trim();
const MODE = process.argv[2];
if (!TOKEN) { console.log('::warning::PRINTFUL_API_TOKEN is not set, skipping.'); process.exit(0); }
// Printful calls the thread option for 'embroidery_front' just 'thread_colors'; other spots add their name.
const threadOption = pl => pl === 'embroidery_front' ? 'thread_colors' : pl.replace('embroidery_', 'thread_colors_');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pf(p, opts = {}, okStatuses = []) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(API + p, { ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(STORE ? { 'X-PB-Store-Id': STORE } : {}) } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) { const s = Number(String(body?.result || '').match(/(\d+) seconds/)?.[1] || 30); console.log(`rate limited ${s}s`); await sleep((s + 1) * 1000); continue; }
    if (okStatuses.includes(res.status)) return { status: res.status, ...body };
    if (!res.ok) throw new Error(`${opts.method || 'GET'} ${p} -> ${res.status} ${JSON.stringify(body).slice(0, 400)}`);
    return body.result;
  }
  throw new Error(`gave up on ${p}`);
}
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const DIR = 'merch/concepts';

if (MODE === 'discover-extra') {
  const want = fs.readFileSync(`${DIR}/discover.txt`, 'utf8').split('\n').map(l => l.trim()).filter(Boolean).map(l => new RegExp(l, 'i'));
  const catalog = await pf('/products');
  const hits = catalog.filter(p => !p.is_discontinued && want.some(re => re.test(`${p.title} ${p.model} ${p.brand || ''} ${p.type_name || ''}`)));
  const out = {};
  for (const p of hits.slice(0, 40)) {
    try {
      const full = await pf(`/products/${p.id}`);
      const pfiles = await pf(`/mockup-generator/printfiles/${p.id}`);
      const v0 = pfiles.variant_printfiles[0] || { placements: {} };
      out[p.id] = { title: p.title, type: p.type_name, techniques: (p.techniques || []).map(t => t.key),
        colors: [...new Set(full.variants.map(v => v.color))].map(c => ({ name: c, hex: full.variants.find(v => v.color === c).color_code })),
        sizes: [...new Set(full.variants.map(v => v.size))],
        placements: Object.fromEntries(Object.entries(v0.placements).map(([pl, id]) => { const f = pfiles.printfiles.find(x => x.printfile_id === id); return [pl, f ? `${f.width}x${f.height}` : '?']; })),
        options: (full.product.options || []).map(o => o.id) };
      console.log(`${p.id} ${p.title}`);
    } catch (e) { console.log(`::warning::${p.id}: ${e.message}`); }
    await sleep(600);
  }
  fs.writeFileSync(`${DIR}/catalog-extra.json`, JSON.stringify(out, null, 1) + '\n');
}

if (MODE === 'discover') {
  const want = [/Bella \+ Canvas 3001\b/, /Bella \+ Canvas 3501/, /Comfort Colors 1717/, /ringer/i, /Gildan 18000/, /Gildan 18500/, /6245CM/,
    /6606/, /retro trucker/i, /corduroy/i, /cuffed beanie/i, /1501KC/, /Gildan 2400/, /garment.dyed/i];
  fs.mkdirSync(DIR, { recursive: true });
  const catalog = await pf('/products');
  const hits = catalog.filter(p => !p.is_discontinued && !/kids|youth|toddler|baby|all-over/i.test(p.title) && want.some(re => re.test(`${p.title} ${p.model} ${p.brand || ''}`)));
  const out = {};
  for (const p of hits.slice(0, 60)) {
    try {
      const full = await pf(`/products/${p.id}`);
      const pfiles = await pf(`/mockup-generator/printfiles/${p.id}`);
      const v0 = pfiles.variant_printfiles[0] || { placements: {} };
      out[p.id] = {
        title: p.title, type: p.type, techniques: (p.techniques || []).map(t => t.key),
        colors: [...new Set(full.variants.map(v => v.color))].map(c => ({ name: c, hex: full.variants.find(v => v.color === c).color_code })),
        sizes: [...new Set(full.variants.map(v => v.size))],
        placements: Object.fromEntries(Object.entries(v0.placements).map(([pl, id]) => { const f = pfiles.printfiles.find(x => x.printfile_id === id); return [pl, f ? `${f.width}x${f.height}` : '?']; })),
        options: (full.product.options || []).map(o => o.id),
      };
      console.log(`${p.id} ${p.title} :: ${out[p.id].colors.length} colors :: ${Object.keys(out[p.id].placements).join(',')}`);
    } catch (e) { console.log(`::warning::${p.id}: ${e.message}`); }
    await sleep(700);
  }
  fs.writeFileSync(`${DIR}/catalog.json`, JSON.stringify(out, null, 1) + '\n');
}

// concepts.json: { items: [{ code, name, product_id, price, sizes, files: { placement: "art-file-base" }, colors: [{ name, tone }] }] }
function* combos(cfg) {
  for (const it of cfg.items) for (const c of it.colors) {
    const ck = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const slug = `${it.code.toLowerCase()}-${ck}`;
    if (ONLY && !slug.startsWith(ONLY.toLowerCase())) continue;
    yield { it, c, slug };
  }
}
async function variantsFor(it, color, cache) {
  if (!cache[it.product_id]) { cache[it.product_id] = (await pf(`/products/${it.product_id}`)).variants; await sleep(500); }
  const ofColor = cache[it.product_id].filter(v => v.color === color);
  const chosen = it.sizes ? it.sizes.map(s => ofColor.find(v => v.size === s)).filter(Boolean) : ofColor;
  return chosen.length ? chosen : ofColor.slice(0, 1);
}

if (MODE === 'mockups' || MODE === 'create') {
  const cfg = readJson(`${DIR}/concepts.json`);
  const plan = readJson(`${DIR}/placed/plan.json`, {}); // slug -> { placement: { file, w, h }, threads? }
  const state = readJson(`${DIR}/mockups.json`, {});
  const cache = {};
  fs.mkdirSync(`${DIR}/mockups`, { recursive: true });
  let ok = 0, failed = 0;
  for (const { it, c, slug } of combos(cfg)) {
    const pl = plan[slug]; if (!pl) { console.log(`::warning::${slug}: no placed files`); continue; }
    try {
      const vs = await variantsFor(it, c.name, cache);
      if (!vs.length) throw new Error(`no variants for color ${c.name}`);
      const placements = Object.entries(pl.files);
      if (MODE === 'mockups') {
        if (state[slug]?.files?.length && state[slug].key === pl.key && state[slug].files.every(f => fs.existsSync(f))) { ok++; continue; }
        const v = vs.find(x => x.size === 'M') || vs.find(x => x.size === 'L') || vs[0];
        const task = await pf(`/mockup-generator/create-task/${it.product_id}`, { method: 'POST', body: JSON.stringify({
          variant_ids: [v.id], format: 'jpg',
          files: placements.map(([placement, f]) => ({ placement, image_url: `${BASE}/placed/${f.file}`,
            position: { area_width: f.w, area_height: f.h, width: f.w, height: f.h, top: 0, left: 0 } })),
        }) });
        let done;
        for (let i = 0; i < 60; i++) { await sleep(4000); done = await pf(`/mockup-generator/task?task_key=${encodeURIComponent(task.task_key)}`); if (done.status !== 'pending') break; }
        if (done.status !== 'completed') throw new Error(`task ${done.status} ${done.error || ''}`);
        // Keep the main photo for each placement (front, back, sleeve...) plus up to 2 extra angles.
        const urls = [];
        for (const m of done.mockups) { urls.push(m.mockup_url); for (const e of (m.extra || []).slice(0, 2)) urls.push(e.url); }
        const files = [];
        for (const [i, u] of urls.slice(0, 4).entries()) {
          const f = `${DIR}/mockups/${slug}${i ? '-' + (i + 1) : ''}.jpg`;
          fs.writeFileSync(f, Buffer.from(await (await fetch(u)).arrayBuffer())); files.push(f);
        }
        state[slug] = { key: pl.key, files, main: urls[0], labels: done.mockups.map(m => m.placement) };
        fs.writeFileSync(`${DIR}/mockups.json`, JSON.stringify(state, null, 1) + '\n');
        console.log(`✓ mockup ${slug} (${files.length})`); ok++;
        await sleep(1500);
      } else {
        const ext = `wcc-${slug}`;
        const existing = await pf(`/store/products/@${ext}`, {}, [404]);
        if (existing && existing.status !== 404) { await pf(`/store/products/@${ext}`, { method: 'DELETE' }); await sleep(800); }
        const body = {
          sync_product: { name: `Concept ${it.code} · ${it.name} · ${c.name}`, external_id: ext, ...(state[slug]?.main ? { thumbnail: state[slug].main } : {}) },
          sync_variants: vs.map(v => ({
            external_id: `${ext}-${String(v.size).replace(/[^A-Za-z0-9]+/g, '')}`, variant_id: v.id, retail_price: Number(it.price).toFixed(2),
            files: placements.map(([placement, f]) => ({ type: placement, url: `${BASE}/placed/${f.file}` })),
            ...(pl.threads ? { options: Object.entries(pl.threads).map(([placement, t]) => ({ id: threadOption(placement), value: t })) } : {}),
          })),
        };
        try { await pf('/store/products', { method: 'POST', body: JSON.stringify(body) }); }
        catch (e) { if (!body.sync_product.thumbnail) throw e; delete body.sync_product.thumbnail; await pf('/store/products', { method: 'POST', body: JSON.stringify(body) }); }
        console.log(`✓ product ${slug}`); ok++;
        await sleep(1200);
      }
    } catch (e) { failed++; console.log(`::warning::${MODE} ${slug}: ${e.message}`); }
  }
  console.log(`${MODE}: ${ok} ok, ${failed} failed`);
}
