// Checks every old and new app page address after the move to weltzcraft.com/<app>/:
// old addresses must 301 to the new one (and end on a 200), new pages must answer 200, every link on the new
// pages must work, and the links built into the apps must work. Prints a table; exits 1 on any failure.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const W = 'https://weltzcraft.com', H = 'https://hood-league.com';
const ITEM = '00000000-0000-4000-8000-000000000000';
const moved = [
  [W + '/apps/curbsy', W + '/curbsy/'], [W + '/apps/totetrack', W + '/totetrack/'], [W + '/apps/shop-stride', W + '/shopstride/'],
  [W + '/apps/hood-games', W + '/games/'], [W + '/apps/hood-protocol', W + '/hoodprotocol/'],
  [W + '/privacy/curbsy', W + '/curbsy/privacy'], [W + '/privacy/totetrack', W + '/totetrack/privacy'], [W + '/privacy/shop-stride', W + '/shopstride/privacy'],
  [W + '/privacy/hood-protocol', W + '/hoodprotocol/privacy'], [W + '/privacy/backseat-view', W + '/backseatview/privacy'],
  [W + '/support/curbsy', W + '/curbsy/support'], [W + '/support/totetrack', W + '/totetrack/support'], [W + '/support/shop-stride', W + '/shopstride/support'],
  [W + '/support/hood-games', W + '/games/support'], [W + '/support/hood-protocol', W + '/hoodprotocol/support'],
  [H + '/junk-privacy.html', W + '/curbsy/privacy'], [H + '/junk-support.html', W + '/curbsy/support'], [H + '/junk-terms.html', W + '/curbsy/terms'],
  [H + '/curbsy.html', W + '/curbsy/'], [H + '/curbsy.html?item=' + ITEM, W + '/curbsy/?item=' + ITEM],
];
const pages = ['/curbsy/', '/curbsy/privacy', '/curbsy/support', '/curbsy/terms', '/totetrack/', '/totetrack/privacy', '/totetrack/support',
  '/shopstride/', '/shopstride/privacy', '/shopstride/support', '/shopstride/stores/', '/games/', '/games/privacy', '/games/support',
  '/hoodprotocol/', '/hoodprotocol/privacy', '/hoodprotocol/support', '/backseatview/privacy', '/', '/privacy', '/apps/hood-league', '/apps/talk-shops',
  '/support/hood-league', '/sitemap.xml'].map((p) => W + p);
// Links built into the apps (next builds) and App Store Connect URLs.
const inApp = ['https://apps.apple.com/account/subscriptions', 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/', W + '/curbsy/', W + '/totetrack/support', W + '/curbsy/terms', W + '/curbsy/privacy', W + '/curbsy/?item=' + ITEM, W + '/totetrack/privacy', W + '/shopstride/privacy',
  W + '/shopstride/stores/', W, H + '/privacy.html', H + '/terms.html', H + '/hood-games', H + '/junk', H + '/stores/', H + '/'];
const results = []; let bad = 0;
const row = (ok, what, url, detail) => { results.push(`${ok ? 'OK  ' : 'FAIL'} ${what.padEnd(9)} ${url}  ${detail}`); if (!ok) bad++; };

async function hop(url) {
  const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA } });
  return { status: r.status, location: r.headers.get('location') ? new URL(r.headers.get('location'), url).href : null, headers: r.headers, res: r };
}
async function follow(url, max = 6) {
  const chain = []; let u = url;
  for (let i = 0; i < max; i++) {
    const h = await hop(u); chain.push(h.status);
    if (h.status >= 300 && h.status < 400 && h.location) { u = h.location; continue; }
    return { final: u, status: h.status, chain, h };
  }
  return { final: u, status: 0, chain };
}
const norm = (u) => u.replace(/\/$/, '');

for (const [from, to] of moved) {
  try {
    const first = await hop(from);
    const end = await follow(from);
    const ok = first.status === 301 && norm(end.final) === norm(to) && end.status === 200;
    row(ok, 'forward', from, `${first.status} -> ${end.final} (${end.chain.join('>')})${ok ? '' : ' expected 301 to ' + to}`);
  } catch (e) { row(false, 'forward', from, e.message); }
}
const links = new Set();
for (const url of pages) {
  try {
    const end = await follow(url);
    row(end.status === 200, 'page', url, `${end.chain.join('>')}${end.final !== url ? ' -> ' + end.final : ''}`);
    if (end.status !== 200 || url.endsWith('.xml')) continue;
    const html = await (await fetch(end.final, { headers: { 'User-Agent': UA } })).text();
    for (const m of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
      const raw = m[1].replace(/&amp;/g, '&');
      if (/^(mailto|tel|javascript|data):/.test(raw) || raw.includes('/cdn-cgi/l/email-protection')) continue; // Cloudflare hides emails
      if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\/?$/.test(raw)) continue; // preconnect hints, not links
      links.add(new URL(raw, end.final).href);
    }
    const loc = html.match(/rel="canonical" href="([^"]+)"/);
    if (loc && norm(loc[1]) !== norm(end.final)) row(false, 'canonical', url, `says ${loc[1]}`);
  } catch (e) { row(false, 'page', url, e.message); }
}
for (const url of ['/curbsy/terms', '/curbsy/privacy', '/curbsy/support', '/totetrack/privacy']) {
  const h = await hop(W + url);
  const csp = h.headers.get('content-security-policy') || '', xfo = h.headers.get('x-frame-options') || '';
  const framed = url === '/curbsy/terms' || url === '/curbsy/privacy';
  const ok = framed ? (csp.includes('capacitor://localhost') && !xfo) : (/DENY/i.test(xfo) || csp.includes("'none'"));
  row(ok, 'framing', W + url, `x-frame-options=${xfo || '-'} csp=${csp || '-'}`);
}
for (const url of [...links].sort()) {
  if (/^https:\/\/(apps\.apple\.com|www\.apple\.com)/.test(url)) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA } }); row(r.status < 400, 'link', url, String(r.status)); } catch (e) { row(false, 'link', url, e.message); }
    continue;
  }
  if (/^https:\/\/talkshops\.app/.test(url)) { // Cloudflare bot check blocks GitHub's machines; not part of this move
    const r = await fetch(url, { headers: { 'User-Agent': UA } }).catch(() => null);
    results.push(`SKIP link      ${url}  ${r ? r.status : 'no answer'} (talkshops.app blocks automated checks)`); continue;
  }
  try { const end = await follow(url); row(end.status === 200, 'link', url, `${end.chain.join('>')}${end.final !== url ? ' -> ' + end.final : ''}`); }
  catch (e) { row(false, 'link', url, e.message); }
}
for (const url of inApp) {
  try { const end = await follow(url); row(end.status === 200, 'in-app', url, `${end.chain.join('>')}${end.final !== url ? ' -> ' + end.final : ''}`); }
  catch (e) { row(false, 'in-app', url, e.message); }
}
console.log(results.join('\n'));
console.log(`\n${results.length} checks, ${bad} failed`);
process.exit(bad ? 1 : 0);
