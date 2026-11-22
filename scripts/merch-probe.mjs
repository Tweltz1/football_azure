// Read-only: for every hat in merch/products.json, list the Printful print spots its blank offers (with the
// extra cost of each) and the base cost of the blank. Prints only; changes nothing at Printful.
import fs from 'node:fs';
const TOKEN = process.env.PRINTFUL_API_TOKEN, STORE = process.env.PRINTFUL_STORE_ID;
const pf = async p => {
  const r = await fetch('https://api.printful.com' + p, { headers: { Authorization: `Bearer ${TOKEN}`, ...(STORE ? { 'X-PB-Store-Id': STORE } : {}) } });
  const b = await r.json();
  if (!r.ok) throw new Error(p + ' ' + r.status + JSON.stringify(b).slice(0, 300));
  return b.result;
};
const cfg = JSON.parse(fs.readFileSync('merch/products.json', 'utf8'));
const plan = JSON.parse(fs.readFileSync('merch/plan.json', 'utf8'));
const seen = new Set();
for (const prod of cfg.products.filter(p => p.type === 'hat' || p.type === 'beanie')) {
  const pl = plan[`${prod.key}-${prod.colors[0].key}`];
  if (!pl) { console.log(prod.key, 'no plan'); continue; }
  const id = pl.product_id;
  const r = await pf(`/products/${id}`);
  const files = (r.product.files || []).map(f => `${f.id}${f.additional_price ? ' +$' + f.additional_price : ''}`).join(', ');
  const v = r.variants.find(x => x.id === pl.variants[0].id) || r.variants[0];
  console.log(`PROBE ${prod.key} (${prod.name}, $${prod.price}) -> #${id} ${r.product.title} | blank $${v.price} | files: ${files}`);
  if (!seen.has(id)) {
    seen.add(id);
    const pfiles = await pf(`/mockup-generator/printfiles/${id}`);
    const vp = pfiles.variant_printfiles.find(x => x.variant_id === v.id) || pfiles.variant_printfiles[0];
    for (const [plc, fid] of Object.entries(vp.placements)) {
      const f = pfiles.printfiles.find(x => x.printfile_id === fid);
      console.log(`   area ${plc}: ${f.width}x${f.height}`);
    }
    const opts = (r.product.options || []).map(o => `${o.id}(${Object.keys(o.values || {}).length})${o.additional_price ? ' +$' + o.additional_price : ''}`).join(', ');
    console.log(`   options: ${opts}`);
    try {
      const t = await pf(`/mockup-generator/templates/${id}`);
      console.log('   mockup placements:', [...new Set((t.templates || []).map(x => x.placement))].join(', '));
    } catch (e) { console.log('   templates err', e.message); }
  }
  await new Promise(res => setTimeout(res, 700));
}
