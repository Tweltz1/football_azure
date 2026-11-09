// Price-sheet bench, part 2: renders each case (PDF, photo-like JPEG or CSV), reads it with the free reader in a real
// browser (no AI) and scores it against the known answers.
//   node talkshops/bench/run.mjs <outDir> <libDir> [cordParquetDir]
// <libDir> holds node_modules with pdfjs-dist@3.11.174, tesseract.js@5.1.1 and @tesseract.js-data/eng@1.0.0
// (the sandbox can't reach the CDNs, so they are served from disk). Needs Playwright.
// Optional CORD check: <cordParquetDir>/cord.json made by bench/cord_pick.py (receipt photos + item labels, CC BY 4.0).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [outDir, libDir, cordDir] = process.argv.slice(2);
const require = createRequire(path.join(libDir, 'x.js'));
const { chromium } = require('playwright');
const pub = new URL('../public/', import.meta.url).pathname;
const NM = path.join(libDir, 'node_modules/');
const LIBS = [
  ['pdf.js/3.11.174/pdf.min.js', NM + 'pdfjs-dist/build/pdf.min.js'],
  ['pdf.js/3.11.174/pdf.worker.min.js', NM + 'pdfjs-dist/build/pdf.worker.min.js'],
  ['tesseract.js@5.1.1/dist/tesseract.min.js', NM + 'tesseract.js/dist/tesseract.min.js'],
  ['tesseract.js@5.1.1/dist/worker.min.js', NM + 'tesseract.js/dist/worker.min.js'],
  ['tesseract.js-core@5.1.1/', NM + 'tesseract.js-core/'],
  ['eng@1.0.0/4.0.0_best_int/eng.traineddata.gz', NM + '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'],
];
const type = (f) => f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : f.endsWith('.pdf') ? 'application/pdf' : f.endsWith('.jpg') ? 'image/jpeg' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream';

// BENCH_FILTER=regex limits the run to matching "source format layout" (e.g. "photo"), to iterate faster.
const only = process.env.BENCH_FILTER ? new RegExp(process.env.BENCH_FILTER) : null;
const cases = JSON.parse(fs.readFileSync(path.join(outDir, 'cases.json'), 'utf8')).filter((c) => !only || only.test(`${c.source} ${c.formats[0]} ${c.layout}`)).slice(0, Number(process.env.BENCH_MAX) || Infinity);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
await ctx.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, (r) => {
  const u = r.request().url();
  for (const [k, f] of LIBS) if (u.includes(k)) { const file = f.endsWith('/') ? f + u.split(k)[1] : f; return r.fulfill({ body: fs.readFileSync(file), contentType: type(file), headers: { 'access-control-allow-origin': '*' } }); }
  return r.fulfill({ status: 404 });
});
await ctx.route('https://bench.test/**', (r) => {
  const p = new URL(r.request().url()).pathname.slice(1);
  if (p === '') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><script src="/pub/sheet-import.js"></script><script src="/pub/price-rules.js"></script><script src="/pub/price-import.js"></script><script>window.reader=createPriceImport({api:async()=>{throw Error("no AI in the bench")}})</script>' });
  const file = p.startsWith('pub/') ? path.join(pub, p.slice(4)) : path.join(outDir, p);
  return fs.existsSync(file) ? r.fulfill({ body: fs.readFileSync(file), contentType: type(file) }) : r.fulfill({ status: 404 });
});

// ---- Render ----
const render = await ctx.newPage();
for (const c of cases) {
  const fmt = c.formats[0], base = path.join(outDir, c.id);
  if (fmt === 'csv' || fs.existsSync(`${base}.${fmt === 'pdf' ? 'pdf' : 'jpg'}`)) continue;
  await render.goto('file://' + path.resolve(base + '.html'));
  const box = await render.locator('#sheet').boundingBox();
  if (fmt === 'pdf') { await render.pdf({ path: base + '.pdf', width: Math.ceil(box.width) + 'px', height: Math.ceil(box.height) + 2 + 'px', printBackground: true }); continue; }
  const png = await render.locator('#sheet').screenshot();
  const ph = c.photo, W = Math.round(box.width * ph.scale) + 160, H = Math.round(box.height * ph.scale) + 160;
  await render.setContent(`<body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#5a5148;perspective:1400px">
    <img src="data:image/png;base64,${png.toString('base64')}" style="position:absolute;left:80px;top:80px;width:${Math.round(box.width * ph.scale)}px;transform:rotateX(${ph.tilt}deg) rotate(${ph.angle}deg);filter:blur(${ph.blur}px)">
    <div style="position:absolute;inset:0;background:linear-gradient(${Math.round(ph.angle * 20 + 120)}deg,rgba(255,255,240,.25),rgba(0,0,0,${ph.shade}))"></div></body>`);
  await render.setViewportSize({ width: W, height: H });
  await render.screenshot({ path: base + '.jpg', type: 'jpeg', quality: ph.quality });
  await render.setViewportSize({ width: 1000, height: 1400 });
}
await render.close();

// ---- Read and score ----
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1);
function score(c, found) {
  const used = new Set();
  let hit = 0, kindOk = 0, kindTotal = 0;
  const misses = [];
  for (const t of c.truth) {
    const tw = words(t.name);
    const i = found.findIndex((f, k) => !used.has(k) && Math.abs(f.rate - t.price) < 0.005 &&
      (t.name === 'labor' ? f.kind === 'labor' && !f.hours : t.name === 'shop supplies' ? f.kind === 'percent' :
        tw.filter((w) => words(f.name).includes(w)).length >= Math.max(1, Math.ceil(tw.length * 0.6))) &&
      (!t.hours || f.hours === t.hours));
    if (i < 0) { misses.push(t); continue; }
    used.add(i); hit++;
    if (t.kind) { kindTotal++; if (found[i].kind === t.kind) kindOk++; }
  }
  return { truth: c.truth.length, found: found.length, hit, kindOk, kindTotal, misses, extra: found.filter((_, k) => !used.has(k)) };
}

const page = await ctx.newPage();
await page.goto('https://bench.test/');
// BENCH_OCR='{"tessedit_pageseg_mode":"6"}' tries other Tesseract settings.
if (process.env.BENCH_OCR) await page.evaluate((p) => { window.PRICE_OCR_PARAMS = p; }, JSON.parse(process.env.BENCH_OCR));
const results = [];
for (const c of cases) {
  const fmt = c.formats[0], file = c.id + '.' + (fmt === 'photo' ? 'jpg' : fmt);
  const t0 = Date.now();
  const out = await page.evaluate(async (file) => {
    const blob = await (await fetch('/' + file)).blob();
    try { return await window.reader.readFiles([new File([blob], file, { type: blob.type })], () => {}, { ai: 'never' }); }
    catch (e) { return { items: [], error: e.message }; }
  }, file);
  results.push({ id: c.id, source: c.source, fmt, layout: c.layout, ms: Date.now() - t0, error: out.error, ...score(c, out.items) });
}

// ---- CORD receipts: does the cleanup help OCR find the printed item names and prices? ----
const cord = [];
if (cordDir && fs.existsSync(path.join(cordDir, 'cord.json'))) {
  const list = JSON.parse(fs.readFileSync(path.join(cordDir, 'cord.json'), 'utf8'));
  await ctx.route('https://bench.test/cord/**', (r) => r.fulfill({ body: fs.readFileSync(path.join(cordDir, path.basename(new URL(r.request().url()).pathname))), contentType: 'image/jpeg' }));
  for (const rcpt of list) {
    const row = { id: rcpt.id, items: rcpt.items.length };
    for (const clean of [false, true]) {
      const text = (await page.evaluate(async ([f, clean]) => {
        const blob = await (await fetch('/cord/' + f)).blob();
        return (await window.reader.ocrText(new File([blob], f, { type: 'image/jpeg' }), clean)).join('\n');
      }, [rcpt.file, clean])).toLowerCase();
      const digits = text.replace(/[^0-9\n]/g, '');
      row[clean ? 'clean' : 'raw'] = rcpt.items.filter((it) => digits.includes(it.price.replace(/\D/g, '')) && words(it.name).some((w) => w.length > 2 && text.includes(w))).length;
    }
    cord.push(row);
  }
}
await browser.close();

// ---- Report ----
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
const group = (key) => {
  const g = {};
  for (const r of results) { const k = key(r); (g[k] ||= { n: 0, truth: 0, found: 0, hit: 0, kindOk: 0, kindTotal: 0, ms: 0 }); const x = g[k]; x.n++; x.truth += r.truth; x.found += r.found; x.hit += r.hit; x.kindOk += r.kindOk; x.kindTotal += r.kindTotal; x.ms += r.ms; }
  return Object.entries(g).sort().map(([k, x]) => `${k.padEnd(22)} sheets ${String(x.n).padStart(4)}  found ${pct(x.hit, x.truth).padStart(6)} of prices  correct ${pct(x.hit, x.found).padStart(6)} of items  type right ${pct(x.kindOk, x.kindTotal).padStart(6)}  ${(x.ms / x.n / 1000).toFixed(1)}s each`).join('\n');
};
const lines = ['By source and format', group((r) => `${r.source} ${r.fmt}`), '', 'By layout', group((r) => `${r.source} ${r.layout}`), '', 'All', group(() => 'all')];
if (cord.length) {
  const tot = cord.reduce((a, r) => ({ items: a.items + r.items, raw: a.raw + r.raw, clean: a.clean + r.clean }), { items: 0, raw: 0, clean: 0 });
  lines.push('', `CORD receipts (${cord.length} photos, ${tot.items} items): OCR finds name and price for ${pct(tot.raw, tot.items)} without cleanup, ${pct(tot.clean, tot.items)} with cleanup`);
}
const report = lines.join('\n');
fs.writeFileSync(path.join(outDir, 'report.txt'), report + '\n');
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ results, cord }, null, 1));
console.log(report);
