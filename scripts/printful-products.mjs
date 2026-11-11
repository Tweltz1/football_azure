// Creates the Weltzcraft merch as real products in the Printful store, so paid orders can be sent to Printful.
//   node scripts/printful-products.mjs plan    -> merch/plan.json (catalog product, variants per size, print area size)
//   python3 scripts/merch_place.py              -> merch/print/placed/<slug>.png (logo placed on a full print area)
//   node scripts/printful-products.mjs create  -> (re)creates each product in Printful and writes weltzcraft-site/merch-catalog.json
// Env: PRINTFUL_API_TOKEN, optional PRINTFUL_STORE_ID, ASSET_BASE for create (raw URL of merch/print at a pushed commit).
import fs from 'node:fs';

const API = 'https://api.printful.com';
const TOKEN = process.env.PRINTFUL_API_TOKEN;
const STORE = process.env.PRINTFUL_STORE_ID;
const MODE = process.argv[2];
if (!TOKEN) { console.log('::warning::PRINTFUL_API_TOKEN is not set, skipping.'); process.exit(0); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pf(p, opts = {}, okStatuses = []) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(API + p, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(STORE ? { 'X-PB-Store-Id': STORE } : {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) { await sleep(30000); continue; }
    if (okStatuses.includes(res.status)) return { status: res.status, ...body };
    if (!res.ok) throw new Error(`${opts.method || 'GET'} ${p} -> ${res.status} ${JSON.stringify(body).slice(0, 500)}`);
    return body.result;
  }
  throw new Error(`gave up on ${p}`);
}
const cfg = JSON.parse(fs.readFileSync('merch/products.json', 'utf8'));
const upcharge = size => ({ '2XL': 2, '3XL': 3, '4XL': 4 }[size] || 0);

if (MODE === 'plan') {
  const catalog = await pf('/products');
  const plan = {};
  for (const item of cfg.items) {
    const re = new RegExp(item.match, 'i');
    const prod = catalog.find(p => re.test(`${p.title} ${p.model} ${p.brand || ''}`) && !p.is_discontinued);
    if (!prod) { console.log(`::warning::${item.slug}: no catalog product`); continue; }
    const variants = (await pf(`/products/${prod.id}`)).variants || [];
    let color = item.colors.find(c => variants.some(v => (v.color || '').toLowerCase() === c.toLowerCase()));
    if (color === undefined && item.colors.includes('')) color = variants[0]?.color;
    const ofColor = variants.filter(v => (v.color || '').toLowerCase() === String(color).toLowerCase() && v.in_stock !== false);
    let chosen = ofColor;
    if (item.sizes) chosen = item.sizes.map(s => ofColor.find(v => v.size === s)).filter(Boolean);
    else if (item.size) chosen = ofColor.filter(v => v.size === item.size).slice(0, 1);
    if (!chosen.length) chosen = ofColor.slice(0, 1);
    if (!chosen.length) { console.log(`::warning::${item.slug}: no variants for ${item.colors}`); continue; }
    const pfiles = await pf(`/mockup-generator/printfiles/${prod.id}`);
    const vp = pfiles.variant_printfiles.find(v => v.variant_id === chosen[0].id) || pfiles.variant_printfiles[0];
    const placement = item.placements.find(pl => vp.placements[pl]);
    const printfile = pfiles.printfiles.find(f => f.printfile_id === vp.placements[placement]);
    plan[item.slug] = {
      product_id: prod.id, product: prod.title, color, placement,
      area: { w: printfile.width, h: printfile.height },
      variants: chosen.map(v => ({ id: v.id, size: v.size })),
    };
    console.log(`${item.slug}: ${prod.title} / ${color} / ${placement} ${printfile.width}x${printfile.height} / sizes ${chosen.map(v => v.size).join(',')}`);
    await sleep(800);
  }
  fs.writeFileSync('merch/plan.json', JSON.stringify(plan, null, 2) + '\n');
}

if (MODE === 'create') {
  const BASE = process.env.ASSET_BASE;
  if (!BASE) { console.error('ASSET_BASE is required'); process.exit(1); }
  const plan = JSON.parse(fs.readFileSync('merch/plan.json', 'utf8'));
  const out = { updated: new Date().toISOString(), items: {} };
  for (const item of cfg.items) {
    const p = plan[item.slug];
    if (!p) continue;
    const ext = `wc-${item.slug}`;
    try {
      const existing = await pf(`/store/products/@${ext}`, {}, [404]);
      if (existing && existing.status !== 404) { await pf(`/store/products/@${ext}`, { method: 'DELETE' }); await sleep(1500); }
      const file = { type: p.placement, url: `${BASE}/placed/${item.slug}.png` };
      const body = {
        sync_product: { name: `${item.name} (${item.color_label})`, external_id: ext, thumbnail: `https://weltzcraft.com/img/merch/${item.slug}.webp` },
        sync_variants: p.variants.map(v => ({
          external_id: `${ext}-${String(v.size).replace(/[^A-Za-z0-9]+/g, '')}`,
          variant_id: v.id,
          retail_price: (item.price + upcharge(v.size)).toFixed(2),
          files: [file],
          ...(item.variant_options ? { options: item.variant_options } : {}),
        })),
      };
      await pf('/store/products', { method: 'POST', body: JSON.stringify(body) });
      const made = await pf(`/store/products/@${ext}`);
      out.items[item.slug] = {
        name: item.name, color: item.color_label, price: item.price,
        variants: made.sync_variants.map(sv => {
          const pv = p.variants.find(v => v.id === sv.variant_id) || {};
          return { size: p.variants.length > 1 ? pv.size : null, sync_variant_id: sv.id, price: Number(sv.retail_price) };
        }),
      };
      console.log(`✓ ${item.slug}: ${made.sync_variants.length} variant(s)`);
    } catch (e) {
      console.log(`::warning::${item.slug}: ${e.message}`);
    }
    await sleep(1500);
  }
  fs.writeFileSync('weltzcraft-site/merch-catalog.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`${Object.keys(out.items).length}/${cfg.items.length} products in Printful`);
}
