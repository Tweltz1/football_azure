// Writes public/auction-values/index.html: a plain HTML page with this week's player rankings and auction
// values, so search engines (and people without an account) can read them. Rebuilt on every build from the
// same player pool the app uses (src/data/playerData.js, refreshed daily by update-player-pool.yml).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async (file) => {
  const text = await readFile(path.join(root, 'src', 'data', file), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
};
const { initialPlayerList, playerPoolMeta } = await load('playerData.js');

// The same estimate as getEstimatedAuctionValue in src/data/strategyUtils.js ($200 budget, 10 teams).
const value = (p) => {
  const rank = Number(p.rank) || 999;
  const pos = p.position === 'DEF' ? 'DST' : p.position;
  let v;
  if (rank <= 5) v = 58; else if (rank <= 10) v = 48; else if (rank <= 20) v = 38; else if (rank <= 40) v = 27;
  else if (rank <= 80) v = 15; else if (rank <= 140) v = 7; else if (rank <= 220) v = 3; else v = 1;
  if (pos === 'QB' && rank > 15) v = Math.max(1, Math.round(v * 0.72));
  if (pos === 'TE' && rank <= 45) v += 4;
  if (pos === 'K' || pos === 'DST') v = Math.min(v, 2);
  return Math.max(1, Math.min(65, Math.round(v)));
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const players = [...initialPlayerList].sort((a, b) => a.rank - b.rank);
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const week = playerPoolMeta.week ? `Week ${playerPoolMeta.week}` : '';
const season = playerPoolMeta.season || '';
const updated = playerPoolMeta.fetchedAt ? new Date(playerPoolMeta.fetchedAt).toISOString().slice(0, 10) : '';
const title = `${season} Fantasy Football Rankings and Auction Values${week ? ` (${week})` : ''} | Hood League`;
const desc = `Free ${season} fantasy football rankings and auction draft values for a $200, 10-team league: top ${Math.min(200, players.length)} overall plus QB, RB, WR, TE, K and DST. Updated daily.`;

const row = (p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(p.position)}</td><td>${esc(p.team)}</td><td>${p.bye || ''}</td><td>$${value(p)}</td></tr>`;
const table = (list, label) => `<table><caption>${esc(label)}</caption><thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Team</th><th>Bye</th><th>Value</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>`;

const top = players.slice(0, 200);
const byPos = POS.map((pos) => {
  const list = players.filter((p) => (p.position === 'DEF' ? 'DST' : p.position) === pos).slice(0, pos === 'K' || pos === 'DST' ? 32 : 60);
  return `<section id="${pos.toLowerCase()}"><h2>${pos} rankings</h2>${table(list, `${pos} rankings and auction values`)}</section>`;
}).join('\n');

const ld = {
  '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc, url: 'https://hood-league.com/auction-values/',
  dateModified: playerPoolMeta.fetchedAt || undefined, publisher: { '@type': 'Organization', name: 'Hood League', url: 'https://hood-league.com' },
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://hood-league.com/auction-values/">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="https://hood-league.com/auction-values/">
<meta property="og:image" content="https://hood-league.com/share.png">
<link rel="icon" href="/icon-192.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
:root{color-scheme:dark}body{margin:0;background:#0f1426;color:#eef2ff;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:20px 16px 48px}a{color:#ffd36e}h1{font-size:30px;line-height:1.2;margin:8px 0}h2{margin:34px 0 8px}
.cta{background:#182041;border:1px solid #2b3768;border-radius:16px;padding:16px;margin:16px 0}.cta a.btn{display:inline-block;margin:6px 8px 0 0;padding:10px 16px;border-radius:12px;background:#ffd36e;color:#1b1f3a;font-weight:700;text-decoration:none}.cta a.ghost{background:transparent;color:#ffd36e;border:2px solid #ffd36e}
nav.pos{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}nav.pos a{padding:6px 12px;border:1px solid #2b3768;border-radius:999px;text-decoration:none}
table{width:100%;border-collapse:collapse;font-size:15px}caption{text-align:left;color:#aab3d6;font-size:13px;padding-bottom:6px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #243061}th{color:#8f9bd0;font-size:13px}td:last-child{color:#ffd36e;font-weight:700}
.muted{color:#aab3d6;font-size:14px}
</style>
</head>
<body>
<main>
<a href="/" style="font-weight:800;text-decoration:none">Hood League</a>
<h1>${esc(season)} fantasy football rankings and auction values${week ? ` · ${esc(week)}` : ''}</h1>
<p class="muted">Updated ${esc(updated)}. Values are for a $200 budget in a 10-team PPR league. Rankings follow Sleeper's player order and update every day.</p>
<div class="cta">
<b>Run your auction draft here.</b> Hood League is a free live auction draft room: everyone bids from their phone, the TV shows the board, and it keeps the budget math for you.
<div><a class="btn" href="/?football=1">Start a league</a><a class="btn ghost" href="/mock-draft">Try a mock draft (no sign-in)</a></div>
</div>
<nav class="pos" aria-label="Positions"><a href="#top">Top 200</a>${POS.map((p) => `<a href="#${p.toLowerCase()}">${p}</a>`).join('')}</nav>
<section id="top"><h2>Top 200 overall</h2>${table(top, 'Overall rankings and auction values')}</section>
${byPos}
<p class="muted">Player data from Sleeper; bye weeks from ESPN. Auction values are Hood League's estimate from rank and position, not a guarantee. <a href="/privacy.html">Privacy</a> · Made by <a href="https://weltzcraft.com">Weltzcraft Studios</a>.</p>
</main>
</body>
</html>
`;
await mkdir(path.join(root, 'public', 'auction-values'), { recursive: true });
await writeFile(path.join(root, 'public', 'auction-values', 'index.html'), html);

const pages = ['/', '/auction-values/', '/mock-draft', '/hood-games', '/games-night', '/cards', '/dnd', '/curbsy.html', '/privacy.html', '/terms.html'];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((p) => `<url><loc>https://hood-league.com${p}</loc></url>`).join('')}</urlset>\n`;
await writeFile(path.join(root, 'public', 'sitemap.xml'), sitemap);
console.log(`auction-values: ${players.length} players, ${updated}`);
