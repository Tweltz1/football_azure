// Layout check for the guest pages of hood-league.com (Hood League front door, Hood Games hub,
// Games Night, Card Table, Hood Quest, Draft Games). Opens each page at phone and desktop sizes
// and fails if a page scrolls sideways, throws a script error, header buttons/links overlap each
// other, the phone-style join pages stretch across a laptop screen, or the front door leaves a
// card alone on its own row.
//
// Usage: node scripts/layout-check.js [base-url]
//   With no base URL it serves ./build (run `npm run build` first) with a single-page-app fallback.
// Needs the playwright package.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const PAGES = ['/', '/hood-games', '/games-night', '/cards', '/dnd', '/dnd/play', '/games'];
const SIZES = [
  ['phone', devices['iPhone 13']],
  ['small phone', { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }],
  ['tablet', { viewport: { width: 820, height: 1180 } }],
  ['laptop', { viewport: { width: 1366, height: 860 } }],
];

function serveBuild() {
  const root = path.join(__dirname, '..', 'build');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

(async () => {
  let server = null;
  let base = process.argv[2];
  if (!base) { server = await serveBuild(); base = `http://127.0.0.1:${server.address().port}`; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch();
  const problems = [];
  for (const [size, opts] of SIZES) {
    const ctx = await browser.newContext(opts);
    for (const pagePath of PAGES) {
      const page = await ctx.newPage();
      const where = `${pagePath} (${size})`;
      page.on('pageerror', (e) => problems.push(`${where}: script error: ${e.message}`));
      await page.goto(base + pagePath, { waitUntil: 'load' });
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => {
        const out = { overflow: document.documentElement.scrollWidth - window.innerWidth, overlaps: [], wideColumn: 0, loneCard: false };
        const visible = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const label = (el) => (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30);
        // Header controls must not sit on top of each other.
        const header = document.querySelector('.top-nav');
        if (header) {
          const els = [...header.querySelectorAll('a, button')].filter(visible).filter((el) => !el.querySelector('a, button'));
          // Text that spills out of its own link or button runs into its neighbours.
          els.forEach((el) => { if (el.scrollWidth > el.clientWidth + 2) out.overlaps.push(`${label(el)} spills out of its box`); });
          for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            const a = els[i].getBoundingClientRect(); const b = els[j].getBoundingClientRect();
            const x = Math.min(a.right, b.right) - Math.max(a.left, b.left); const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (x > 2 && y > 2) out.overlaps.push(`${label(els[i])} / ${label(els[j])}`);
          }
        }
        // Phone-style pages keep a phone-width column on big screens.
        const lcp = document.querySelector('.lcp:not(.lch)');
        if (lcp) {
          const widths = [...lcp.querySelectorAll('input')].filter(visible).map((i) => i.getBoundingClientRect().width);
          if (widths.length) out.wideColumn = Math.round(Math.max(...widths));
        }
        // Front door: no card left alone on a row when there is room for two.
        const cards = [...document.querySelectorAll('.front-door-card')].filter(visible);
        if (cards.length > 1) {
          const rows = {};
          cards.forEach((c) => { const t = Math.round(c.getBoundingClientRect().top); rows[t] = (rows[t] || 0) + 1; });
          const counts = Object.values(rows);
          out.loneCard = Math.max(...counts) > 1 && counts.some((n) => n === 1);
        }
        return out;
      });
      if (r.overflow > 0) problems.push(`${where}: page scrolls sideways by ${r.overflow}px`);
      r.overlaps.forEach((o) => problems.push(`${where}: header items overlap: ${o}`));
      if (r.wideColumn > 640) problems.push(`${where}: form stretches ${r.wideColumn}px wide (should stay phone width)`);
      if (r.loneCard) problems.push(`${where}: a front door card sits alone on its row`);
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  if (server) server.close();
  if (problems.length) { console.error([...new Set(problems)].join('\n')); process.exit(1); }
  console.log(`Layout OK: ${PAGES.length} pages x ${SIZES.length} sizes`);
})().catch((e) => { console.error(e); process.exit(1); });
