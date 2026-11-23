// Preview only: makes Printful mockup photos of the athletic-cap candidates with the Tonal W (m1) on the
// front and "Weltzcraft" on the back where the cap has a back spot. Uses the mockup generator only:
// creates no store products and places no orders. Photos land in merch/scout/photos/.
import fs from 'node:fs';
const TOKEN = process.env.PRINTFUL_API_TOKEN, STORE = process.env.PRINTFUL_STORE_ID;
const BRANCH = process.env.BRANCH || 'claude/project-thread-3fy47d';
const RAW = `https://raw.githubusercontent.com/Tweltz1/football_azure/${BRANCH}/merch/scout`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pf = async (p, opt = {}, tries = 0) => {
  const r = await fetch('https://api.printful.com' + p, { ...opt, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(STORE ? { 'X-PB-Store-Id': STORE } : {}) } });
  const b = await r.json();
  if (r.status === 429 && tries < 6) { const s = +((JSON.stringify(b).match(/after (\d+) sec/) || [])[1] || 60); console.log(`  wait ${s}s (rate limit)`); await sleep((s + 2) * 1000); return pf(p, opt, tries + 1); }
  if (!r.ok) throw new Error(p + ' ' + r.status + JSON.stringify(b).slice(0, 300));
  return b.result;
};
const LIGHT = /white|bone|ecru|grey|gray|khaki|silver|sand/i;
const CANDS = [
  { key: 'surf', id: 1574, colors: ['Black', 'Navy', 'Bone', 'Petrol Blue', 'Army', 'Khaki'] },
  { key: 'ua', id: 755, colors: ['Black', 'Navy', 'White', 'Grey', 'Royal Blue', 'Red'] },
  { key: 'flexfit', id: 140, colors: ['Black', 'Dark Navy', 'White', 'Grey', 'Olive'] },
  { key: 'visor', id: 265, colors: ['Black', 'Navy', 'White'] },
  { key: 'lowpro', id: 864, colors: ['Black', 'Dark Navy', 'Dark Green', 'Khaki', 'Red', 'White'] },
];
fs.mkdirSync('merch/scout/photos', { recursive: true });
const fit = (area, aspect, wf, hf) => {
  let w = area.w * wf, h = w / aspect;
  if (h > area.h * hf) { h = area.h * hf; w = h * aspect; }
  return { area_width: area.w, area_height: area.h, width: Math.round(w), height: Math.round(h), top: Math.round((area.h - h) / 2), left: Math.round((area.w - w) / 2) };
};
for (const c of CANDS) {
  const d = await pf(`/products/${c.id}`);
  const pfiles = await pf(`/mockup-generator/printfiles/${c.id}`);
  for (const color of c.colors) {
    const v = d.variants.find(x => x.color === color);
    if (!v) { console.log(`skip ${c.key} ${color}: no variant`); continue; }
    const vp = pfiles.variant_printfiles.find(x => x.variant_id === v.id);
    const places = Object.keys(vp.placements);
    const front = ['embroidery_front', 'front_dtf_hat', 'front', 'default'].find(p => places.includes(p)) || places[0];
    const area = p => { const f = pfiles.printfiles.find(x => x.printfile_id === vp.placements[p]); return { w: f.width, h: f.height }; };
    const slug0 = `${c.key}-${color.toLowerCase().replace(/[^a-z]+/g, '')}`;
    if (fs.existsSync(`merch/scout/photos/${slug0}~1.jpg`)) { console.log(`have ${slug0}`); continue; }
    const ink = LIGHT.test(color) ? 'navy' : 'white';
    const files = [{ placement: front, image_url: `${RAW}/m1-${ink}.png`, position: fit(area(front), 828 / 588, 0.6, 0.8) }];
    if (places.includes('embroidery_back')) files.push({ placement: 'embroidery_back', image_url: `${RAW}/back-${ink}.png`, position: fit(area('embroidery_back'), 2058 / 309, 0.95, 0.4) });
    console.log(`${c.key} ${color}: v${v.id} $${v.price} places ${places.join(',')} -> ${files.map(f => f.placement).join('+')}`);
    try {
      const task = await pf(`/mockup-generator/create-task/${c.id}`, { method: 'POST', body: JSON.stringify({ variant_ids: [v.id], format: 'jpg', files }) });
      let done;
      for (let i = 0; i < 45; i++) { await sleep(4000); done = await pf(`/mockup-generator/task?task_key=${encodeURIComponent(task.task_key)}`); if (done.status !== 'pending') break; }
      if (done.status !== 'completed') throw new Error(`task ${done.status} ${done.error || ''}`);
      const urls = [];
      for (const m of done.mockups) { urls.push(m.mockup_url); for (const e of m.extra || []) urls.push(e.url); }
      const slug = `${c.key}-${color.toLowerCase().replace(/[^a-z]+/g, '')}`;
      for (const [i, u] of urls.slice(0, 4).entries()) fs.writeFileSync(`merch/scout/photos/${slug}~${i + 1}.jpg`, Buffer.from(await (await fetch(u)).arrayBuffer()));
      console.log(`✓ ${slug} (${Math.min(urls.length, 4)} photos)`);
    } catch (e) { console.log(`::warning::${c.key} ${color}: ${e.message}`); }
    await sleep(2500);
  }
}
