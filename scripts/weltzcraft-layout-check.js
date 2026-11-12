// Layout check for weltzcraft.com (weltzcraft-site/). Serves the folder locally and, at phone,
// tablet and desktop widths, fails if a page scrolls sideways, throws a script error, or a top
// menu link wraps onto two lines or runs into the logo / "Start a project" button.
// Run: node scripts/weltzcraft-layout-check.js   (needs the playwright package)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'weltzcraft-site');
const PAGES = ['index.html', 'merch.html', 'build.html'];
const WIDTHS = [375, 768, 1024, 1100, 1180, 1280, 1366, 1440, 1920];
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const problems = [];
  for (const page of PAGES) {
    for (const width of WIDTHS) {
      const tab = await browser.newPage({ viewport: { width, height: 800 } });
      tab.on('pageerror', (e) => problems.push(`${page} @${width}: script error: ${e.message}`));
      await tab.goto(base + page, { waitUntil: 'load' });
      const r = await tab.evaluate(() => {
        const out = { overflow: document.documentElement.scrollWidth - window.innerWidth, wrapped: [], overlap: false };
        const nav = document.querySelector('#site-nav');
        const menu = document.querySelector('.menu-btn');
        if (!nav || (menu && getComputedStyle(menu).display !== 'none')) return out; // phone menu
        const links = [...nav.querySelectorAll('a')].filter((a) => a.offsetParent);
        const lineH = Math.min(...links.map((a) => a.getBoundingClientRect().height));
        out.wrapped = links.filter((a) => a.getBoundingClientRect().height > lineH * 1.5).map((a) => a.textContent.trim());
        const n = nav.getBoundingClientRect();
        const act = document.querySelector('.top-act');
        const brand = document.querySelector('.brand');
        out.overlap = (act && n.right > act.getBoundingClientRect().left + 1) || (brand && n.left < brand.getBoundingClientRect().right - 1);
        return out;
      });
      if (r.overflow > 0) problems.push(`${page} @${width}: page scrolls sideways by ${r.overflow}px`);
      if (r.wrapped.length) problems.push(`${page} @${width}: menu links wrap: ${r.wrapped.join(', ')}`);
      if (r.overlap) problems.push(`${page} @${width}: menu runs into the logo or the Start a project button`);
      await tab.close();
    }
  }
  await browser.close();
  server.close();
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`Layout OK: ${PAGES.length} pages x ${WIDTHS.length} widths`);
})().catch((e) => { console.error(e); process.exit(1); });
