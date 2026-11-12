// Adds bundle IDs to the hobby Supabase project's Apple client IDs, so identity tokens from Apple's own
// sign-in sheet in those apps are accepted. Additive only.
const REF = 'nkwedlskhnojseeroezm';
const ADD = ['com.hoodleague.draft', 'com.hoodleague.games', 'com.tweltz1.hoodprotocol'];
const url = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
const H = { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
(async () => {
  const a = await (await fetch(url, { headers: H })).json();
  const ids = String(a.external_apple_client_id || '').split(',').map((s) => s.trim()).filter(Boolean);
  const next = [...ids, ...ADD.filter((x) => !ids.includes(x))];
  if (next.length === ids.length) { console.log(`Apple client IDs already: ${ids.join(',')}`); return; }
  const res = await fetch(url, { method: 'PATCH', headers: H, body: JSON.stringify({ external_apple_enabled: true, external_apple_client_id: next.join(',') }) });
  console.log(`PATCH ${res.status}`);
  const b = await (await fetch(url, { headers: H })).json();
  console.log(`Apple client IDs now: ${b.external_apple_client_id}`);
})();
