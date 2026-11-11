// Run from the repo root: node scripts/merch-hat-logos.js (needs Playwright). Writes merch/print/logo-*-hat.{svg,png}; trim the PNGs after.
// Hat-only (embroidery) versions of the logos with small text: bigger, bolder lettering, no hairlines.
const { chromium } = require('playwright'); const fs = require('fs');
const seal = (id, col, inner) => `<svg id="${id}" xmlns="http://www.w3.org/2000/svg" width="1800" height="1800" viewBox="0 0 200 200" style="color:${col}">
<circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" stroke-width="5"/>
<path id="${id}t" d="M35 100 A65 65 0 0 1 165 100" fill="none"/><path id="${id}b" d="M15 100 A85 85 0 0 0 185 100" fill="none"/>
<text font-family="Inter" font-weight="800" font-size="25" letter-spacing="1.5" fill="currentColor"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">WELTZCRAFT</textPath></text>
<text font-family="Inter" font-weight="800" font-size="25" letter-spacing="1.5" fill="currentColor"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${'STUDIOS'}</textPath></text>
${inner}</svg>`;
const W55 = `<polyline points="66,82 83,124 100,98 117,124 134,82" fill="none" stroke="currentColor" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>`;
const W60 = c => `<polyline points="68,74 84,112 100,86 116,112 132,74" fill="none" stroke="${c}" stroke-width="6.5" stroke-linejoin="miter"/><polyline points="68,86 84,124 100,98 116,124 132,86" fill="none" stroke="#facc15" stroke-width="6.5" stroke-linejoin="miter"/><polyline points="68,98 84,136 100,110 116,136 132,98" fill="none" stroke="#ef4444" stroke-width="6.5" stroke-linejoin="miter"/>`;
const stamp = (id, col) => `<svg id="${id}" xmlns="http://www.w3.org/2000/svg" width="1800" height="1800" viewBox="0 0 200 200" style="color:${col}">
<rect x="22" y="20" width="156" height="160" rx="4" fill="none" stroke="currentColor" stroke-width="5"/>
<g transform="translate(38 48) scale(1.12)"><polyline points="0,0 16,46 32,12 48,46 64,0" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="miter"/><path d="M104 9 C102 2 96 -1 90 -1 C80 -1 76 4 76 11 C76 19 83 21 90 23 C98 25 105 28 105 35 C105 43 99 47 90 47 C81 47 75 43 74 36" fill="none" stroke="currentColor" stroke-width="7"/></g>
<path d="M44 124 H156" stroke="currentColor" stroke-width="4"/>
<text x="100" y="160" text-anchor="middle" font-family="Inter" font-weight="800" font-size="24" letter-spacing="1" fill="currentColor">EST 2026</text></svg>`;
const logos = {
  'logo-55-brass-hat': seal('a', '#d4b06a', W55), 'logo-55-darkbrass-hat': seal('b', '#7a5a22', W55),
  'logo-60-light-hat': seal('c', '#e7e5e4', W60('#e7e5e4')), 'logo-60-dark-hat': seal('d', '#111', W60('#111')),
  'logo-44-light-hat': stamp('e', '#e9e1cf'), 'logo-44-dark-hat': stamp('f', '#1a1a1a'),
};
(async () => { const b = await chromium.launch(); const pg = await b.newPage();
  for (const [name, svg] of Object.entries(logos)) {
    fs.writeFileSync(`merch/print/${name}.svg`, svg);
    await pg.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@800&display=block" rel="stylesheet"><style>body{margin:0;background:transparent}</style></head><body>${svg}</body></html>`);
    await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(300);
    console.log(name, await pg.evaluate(() => document.fonts.check('800 20px Inter')));
    await pg.locator('svg').screenshot({ path: `merch/print/${name}.png`, omitBackground: true });
  }
  await b.close(); })();
