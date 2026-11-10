// Price-sheet bench, part 1: makes test sheets with known answers.
//   node talkshops/bench/gen.mjs <outDir> [nyplSample.json] [count]
// Writes <outDir>/cases.json and, per case, an HTML page that run.mjs turns into a PDF, a photo-like JPEG or a CSV.
// Auto shop sheets are generated (made-up shop, realistic services and prices); restaurant menus come from the
// NYPL "What's on the Menu?" data (public domain), sampled by bench/nypl_pick.py.
import fs from 'node:fs';
import path from 'node:path';

const [outDir = 'bench-out', nyplFile, countArg = '200'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
let seed = Number(process.env.BENCH_SEED) || 42; // BENCH_SEED=7 makes a fresh set to check tuning against
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// [name, kind, low, high] — fee = flat-priced service, part = sold by the unit.
const SERVICES = [
  ['Synthetic oil change (up to 5 qt)', 'fee', 59, 109], ['Conventional oil change', 'fee', 35, 59], ['High mileage oil change', 'fee', 55, 89],
  ['Diesel oil change', 'fee', 99, 189], ['Tire rotation', 'fee', 15, 35], ['Tire mount and balance (per tire)', 'fee', 18, 35],
  ['Flat tire repair', 'fee', 20, 40], ['4-wheel alignment', 'fee', 89, 149], ['Front-end alignment', 'fee', 69, 119],
  ['Check engine light diagnosis', 'fee', 89, 179], ['Electrical diagnosis', 'fee', 120, 220], ['Brake inspection', 'fee', 0, 49],
  ['Front brake pads', 'fee', 149, 289], ['Rear brake pads', 'fee', 149, 289], ['Front pads and rotors', 'fee', 329, 559],
  ['Brake fluid flush', 'fee', 89, 149], ['Coolant flush', 'fee', 119, 199], ['Transmission fluid service', 'fee', 149, 289],
  ['Power steering flush', 'fee', 89, 149], ['Fuel system cleaning', 'fee', 99, 179], ['Battery test', 'fee', 0, 25],
  ['Battery replacement', 'fee', 149, 289], ['AC performance check', 'fee', 59, 99], ['AC recharge', 'fee', 149, 249],
  ['State inspection', 'fee', 15, 40], ['Emissions test', 'fee', 25, 50], ['Spark plug replacement (4 cyl)', 'fee', 129, 229],
  ['Serpentine belt replacement', 'fee', 119, 219], ['Timing belt and water pump', 'fee', 599, 1199], ['Headlight restoration', 'fee', 59, 119],
  ['Cabin air filter', 'part', 25, 59], ['Engine air filter', 'part', 22, 49], ['Wiper blades (pair)', 'part', 19, 49],
  ['Headlight bulb', 'part', 15, 45], ['Oil filter', 'part', 8, 19], ['Synthetic oil (per qt)', 'part', 8, 14],
  ['Tire disposal fee', 'fee', 3, 8], ['Shop towels and supplies', 'fee', 5, 25], ['Hazardous waste disposal', 'fee', 3, 15],
  ['TPMS sensor', 'part', 49, 99], ['Valve stem', 'part', 3, 8], ['Multi-point inspection', 'fee', 0, 39],
];
const LABOR_JOBS = ['Front brake pad replacement', 'Rear brake pad replacement', 'Starter replacement', 'Alternator replacement', 'Water pump replacement',
  'Thermostat replacement', 'Radiator replacement', 'Front strut assembly (pair)', 'Wheel bearing replacement', 'Ignition coil replacement',
  'Valve cover gasket', 'Oxygen sensor replacement', 'CV axle replacement', 'Fuel pump replacement'];

const money = (v, style) => {
  const fixed = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (style === 'bare') return fixed;
  if (style === 'whole' && Number.isInteger(v)) return '$' + v.toLocaleString('en-US');
  return '$' + fixed;
};
const price = (lo, hi) => { const v = between(lo, hi); return rnd() < 0.5 ? Math.round(v) - 0.01 + (rnd() < 0.3 ? 0.01 : 0) : Math.round(v * 100) / 100; };

function shopCase(i) {
  const style = pick(['dollar', 'dollar', 'bare', 'whole']);
  const laborRate = Math.round(between(95, 189));
  const rows = []; // { name, priceText, hoursText, truth: [{name, price, kind, hours}] }
  rows.push({ name: pick(['Labor rate', 'Shop labor rate', 'Hourly labor rate', 'Labor']), priceText: money(laborRate, style === 'bare' ? 'dollar' : style) + pick(['/hr', ' per hour', '/hour']), truth: [{ name: 'labor', price: laborRate, kind: 'labor' }] });
  const services = [...SERVICES].sort(() => rnd() - 0.5).slice(0, 8 + Math.floor(rnd() * 22));
  for (const [name, kind, lo, hi] of services) {
    if (lo === 0 && rnd() < 0.5) continue;
    const r = rnd();
    if (r < 0.08) { const a = Math.round(between(lo, hi)), b = a + Math.round(between(10, 60)); rows.push({ name, priceText: `${money(a, 'whole')} - ${money(b, 'whole')}`, truth: [{ name, price: a, kind, check: true }] }); }
    else if (r < 0.14) { const a = Math.round(between(lo, hi)); rows.push({ name, priceText: `${pick(['starting at', 'from', 'Starting at'])} ${money(a, 'whole')}`, truth: [{ name, price: a, kind, check: true }] }); }
    else { const v = price(lo || 9, hi); rows.push({ name, priceText: money(v, style), truth: [{ name, price: v, kind }] }); }
  }
  for (const job of [...LABOR_JOBS].sort(() => rnd() - 0.5).slice(0, Math.floor(rnd() * 5))) {
    const hours = Math.round(between(0.5, 4.5) * 10) / 10;
    rows.push({ name: job, hoursText: `${hours} ${pick(['hr', 'hrs', 'hours'])}`, truth: [{ name: job, price: laborRate, kind: 'labor', hours }] });
  }
  if (rnd() < 0.7) { const pct = pick([5, 6, 8, 10, 12]); rows.push({ name: pick(['Shop supplies', 'Shop supply fee', 'Environmental fee']), priceText: `${pct}%` + pick(['', ' of labor', ' of parts and labor']), truth: [{ name: 'shop supplies', price: pct, kind: 'percent' }] }); }
  const shuffled = [rows[0], ...rows.slice(1).sort(() => rnd() - 0.5)];
  const shop = pick(['Ridgeline', 'Northside', 'Valley', 'Precision', 'Main Street', 'Summit', 'Eagle', 'Riverside', 'Hometown', 'Lakeview']) + ' ' + pick(['Auto Repair', 'Auto Care', 'Automotive', 'Garage', 'Service Center', 'Tire & Auto']);
  return { id: `shop-${i}`, source: 'shop', title: shop, rows: shuffled, layout: pick(['table', 'leaders', 'columns', 'sections', 'cards', 'tableExtra']) };
}

function nyplCase(m) {
  const rows = m.items.map((it) => it.high && it.high > it.price
    ? { name: it.name, priceText: `${money(it.price, 'dollar')}   ${money(it.high, 'dollar')}`, truth: [{ name: it.name, price: it.price }, { name: it.name, price: it.high }] }
    : { name: it.name, priceText: rnd() < 0.5 ? money(it.price, 'dollar') : money(it.price, 'bare'), truth: [{ name: it.name, price: it.price }] });
  return { id: m.id, source: 'menu', title: m.title, rows, layout: pick(['table', 'leaders', 'columns']) };
}

function html(c) {
  const font = pick(['Arial', 'Georgia', 'Verdana', 'Times New Roman', 'Trebuchet MS', 'Courier New']);
  const size = Math.round(between(15, 22));
  const cell = (r) => esc(r.priceText ?? r.hoursText ?? '');
  const head = `<h1 style="text-align:center;margin:0 0 4px">${esc(c.title.toUpperCase())}</h1><p style="text-align:center;margin:0 0 18px">(555) 0${Math.floor(between(10, 99))}-${Math.floor(between(1000, 9999))} · ${Math.floor(between(10, 999))} ${pick(['Main St', 'Oak Ave', 'Route 9', 'Elm St'])}</p>`;
  let body;
  if (c.layout === 'table' || c.layout === 'tableExtra') {
    const extra = c.layout === 'tableExtra';
    body = `<table style="width:100%;border-collapse:collapse">${extra ? '<tr><th align=left>Service</th><th align=left>Category</th><th align=right>Price</th></tr>' : ''}${c.rows.map((r) => `<tr style="border-bottom:1px solid #ccc"><td style="padding:4px 0">${esc(r.name)}</td>${extra ? `<td>${pick(['Maintenance', 'Brakes', 'Tires', 'Engine', 'Electrical', 'Fees'])}</td>` : ''}<td align=right style="white-space:nowrap">${cell(r)}</td></tr>`).join('')}</table>`;
  } else if (c.layout === 'leaders' || c.layout === 'columns') {
    const line = (r) => `<div style="display:flex;gap:6px;margin:5px 0;break-inside:avoid"><span>${esc(r.name)}</span><span style="flex:1;border-bottom:2px dotted #666;margin-bottom:5px"></span><span style="white-space:nowrap">${cell(r)}</span></div>`;
    body = `<div style="${c.layout === 'columns' ? 'columns:2;column-gap:40px' : ''}">${c.rows.map(line).join('')}</div>`;
  } else if (c.layout === 'sections') {
    body = c.rows.map((r) => `<div style="margin:0 0 10px"><b>${esc(r.name)}</b><br>${cell(r)}</div>`).join('');
  } else {
    body = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${c.rows.map((r) => `<div style="border:2px solid #333;border-radius:8px;padding:8px"><div>${esc(r.name)}</div><div style="font-weight:bold;font-size:1.2em">${cell(r)}</div></div>`).join('')}</div>`;
  }
  const bg = pick(['#ffffff', '#fffdf5', '#f6f6f0', '#fff8e8']);
  return `<!doctype html><html><body style="margin:0;background:${bg}"><div id="sheet" style="font-family:'${font}';font-size:${size}px;padding:36px;width:${c.layout === 'columns' || c.layout === 'cards' ? 900 : 720}px;background:${bg};color:#111">${head}${body}</div></body></html>`;
}

const cases = [];
const n = Number(countArg);
for (let i = 0; i < n; i++) cases.push(shopCase(i));
if (nyplFile) for (const m of JSON.parse(fs.readFileSync(nyplFile, 'utf8'))) cases.push(nyplCase(m));
for (const c of cases) {
  c.formats = c.source === 'shop' ? [pick(['pdf', 'pdf', 'photo', 'photo', 'csv'])] : [pick(['pdf', 'photo'])];
  if (c.formats[0] === 'csv' && !c.layout.startsWith('table')) c.formats = ['pdf'];
  c.truth = c.rows.flatMap((r) => r.truth);
  fs.writeFileSync(path.join(outDir, c.id + '.html'), html(c));
  if (c.formats[0] === 'csv') {
    const q = (v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const extra = c.layout === 'tableExtra';
    fs.writeFileSync(path.join(outDir, c.id + '.csv'), [extra ? 'Service,Category,Price' : 'Service,Price', ...c.rows.map((r) => [r.name, ...(extra ? ['Maintenance'] : []), r.priceText ?? r.hoursText].map(q).join(','))].join('\n'));
  }
  c.photo = { angle: between(-6, 6), tilt: between(-8, 8), shade: between(0.1, 0.45), blur: between(0, 0.9), quality: Math.round(between(50, 85)), scale: between(0.75, 1.15) };
  delete c.rows;
}
fs.writeFileSync(path.join(outDir, 'cases.json'), JSON.stringify(cases, null, 1));
console.log(`${cases.length} cases in ${outDir}`);
