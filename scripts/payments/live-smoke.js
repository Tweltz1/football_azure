// Read-only live check of the Curbsy and ToteTrack backends (shared hobby Supabase project).
// Signed-out calls only: nothing is written. The anon key is the public one from hood-league.com.
const BASE = 'https://nkwedlskhnojseeroezm.supabase.co';
const API = `${BASE}/functions/v1/api`;
const results = [];
const check = async (name, url, opts, expect) => {
  const t = Date.now();
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    const okStatus = expect.status.includes(res.status);
    let extra = '';
    if (okStatus && expect.body) extra = expect.body(text) || '';
    results.push({ name, status: res.status, ms: Date.now() - t, pass: okStatus && !extra.startsWith('FAIL'), note: extra || text.slice(0, 120) });
  } catch (e) {
    results.push({ name, status: 0, ms: Date.now() - t, pass: false, note: String(e).slice(0, 120) });
  }
};
(async () => {
  const page = await (await fetch('https://hood-league.com/')).text();
  const js = page.match(/static\/js\/main[^"]*\.js/)?.[0];
  const bundle = js ? await (await fetch(`https://hood-league.com/${js}`)).text() : '';
  const anon = bundle.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)?.find((k) => Buffer.from(k.split('.')[1], 'base64').toString().includes('"anon"'));
  const H = anon ? { apikey: anon, Authorization: `Bearer ${anon}` } : {};
  const json = (f) => (t) => { try { return f(JSON.parse(t)); } catch { return 'FAIL not JSON'; } };
  await check('API health', `${API}/health`, { headers: H }, { status: [200] });
  await check('Curbsy categories', `${API}/junk/categories`, { headers: H }, { status: [200], body: json((d) => d.categories?.length ? `${d.categories.length} categories` : 'FAIL empty') });
  for (const [city, lat, lng] of [['Des Moines', 41.586, -93.625], ['Chicago', 41.878, -87.63], ['Dallas', 32.777, -96.797]]) {
    await check(`Curbsy browse ${city}`, `${API}/junk/items?lat=${lat}&lng=${lng}&km=40`, { headers: H }, { status: [200], body: json((d) => Array.isArray(d) ? `${d.length} listings` : 'FAIL not a list') });
  }
  await check('Curbsy browse without location is refused', `${API}/junk/items`, { headers: H }, { status: [400] });
  await check('Curbsy bad item id 404s', `${API}/junk/items/not-an-id`, { headers: H }, { status: [404] });
  await check('Curbsy inbox needs sign-in', `${API}/junk/inbox`, { headers: H }, { status: [401] });
  await check('Curbsy account delete needs sign-in', `${API}/junk/account`, { method: 'DELETE', headers: H }, { status: [401] });
  await check('ToteTrack totes hidden from strangers (RLS)', `${BASE}/rest/v1/totetrack_totes?select=*&limit=1`, { headers: H }, { status: [200], body: json((d) => Array.isArray(d) && d.length === 0 ? 'no rows visible signed out' : 'FAIL rows visible signed out') });
  await check('ToteTrack photos hidden from strangers (RLS)', `${BASE}/rest/v1/totetrack_photos?select=name&limit=1`, { headers: H }, { status: [200], body: json((d) => Array.isArray(d) && d.length === 0 ? 'no rows visible signed out' : 'FAIL rows visible signed out') });
  await check('Auth server up', `${BASE}/auth/v1/settings`, { headers: H }, { status: [200], body: json((d) => `providers on: ${Object.entries(d.external || {}).filter(([, v]) => v).map(([k]) => k).join(',')}`) });
  console.log(`anon key found: ${!!anon}`);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} [${r.status}, ${r.ms}ms] ${r.note.replace(/\s+/g, ' ')}`);
  console.log('LIVE_SMOKE_JSON ' + JSON.stringify({ pass: results.filter((r) => r.pass).length, fail: results.filter((r) => !r.pass).length }));
})();
