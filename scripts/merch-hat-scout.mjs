// Read-only: looks through Printful's catalog for performance / athletic caps (dri-fit style) and prints
// colors, print spots, techniques and blank cost for each match. Changes nothing at Printful.
const TOKEN = process.env.PRINTFUL_API_TOKEN, STORE = process.env.PRINTFUL_STORE_ID;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pf = async p => {
  const r = await fetch('https://api.printful.com' + p, { headers: { Authorization: `Bearer ${TOKEN}`, ...(STORE ? { 'X-PB-Store-Id': STORE } : {}) } });
  const b = await r.json();
  if (!r.ok) throw new Error(p + ' ' + r.status + JSON.stringify(b).slice(0, 300));
  return b.result;
};
const all = await pf('/products');
const hats = all.filter(p => /hat|cap|visor/i.test(p.type + ' ' + p.type_name + ' ' + p.title) && !/beanie|bucket/i.test(p.title) && !p.is_discontinued);
console.log(`HATS ${hats.length}`);
for (const h of hats) console.log(`HAT #${h.id} | ${h.title} | ${h.brand || ''} ${h.model || ''} | type ${h.type_name} | techs ${(h.techniques || []).map(t => t.key).join(',')}`);
const KEY = /perform|dri|moisture|wick|cool|sport|athlet|run|golf|lightweight|polyester|nylon|unstructured|featherlight|quick|breath|active|tech|laser|perforat/i;
for (const h of hats) {
  let d;
  try { d = await pf(`/products/${h.id}`); } catch (e) { console.log('ERR', h.id, e.message); continue; }
  const desc = (d.product.description || '').replace(/\s+/g, ' ');
  if (!KEY.test(h.title + ' ' + desc)) continue;
  const colors = [...new Set(d.variants.filter(v => v.in_stock !== false).map(v => v.color))];
  const prices = d.variants.map(v => +v.price);
  const files = (d.product.files || []).map(f => `${f.id}${f.additional_price ? ' +$' + f.additional_price : ''}`).join(', ');
  console.log(`\nCAND #${h.id} ${h.title} (${h.brand} ${h.model})\n  blank $${Math.min(...prices)}-${Math.max(...prices)} | techs ${(d.product.techniques || []).map(t => t.key).join(',')}\n  files: ${files}\n  colors (${colors.length}): ${colors.join(' / ')}\n  desc: ${desc.slice(0, 700)}`);
  await sleep(400);
}
