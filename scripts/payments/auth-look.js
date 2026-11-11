// Read-only: which sign-in providers are on for the hobby Supabase project, and whether each has its
// client id and secret. Never prints a secret, only whether it's there (and for Apple, when it expires).
const REF = 'nkwedlskhnojseeroezm';
(async () => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } });
  if (!res.ok) { console.log(`auth config: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); process.exit(1); }
  const a = await res.json();
  for (const p of ['apple', 'google', 'github']) {
    const secret = a[`external_${p}_secret`] || '';
    let exp = '';
    if (p === 'apple' && secret.split('.').length === 3) {
      try { const pl = JSON.parse(Buffer.from(secret.split('.')[1], 'base64url').toString()); exp = ` expires ${new Date(pl.exp * 1000).toISOString()} sub=${pl.sub}`; } catch { exp = ' (not a JWT)'; }
    }
    console.log(`${p}: enabled=${!!a[`external_${p}_enabled`]} client_id=${a[`external_${p}_client_id`] || 'NONE'} secret=${secret ? `set (${secret.length} chars)` : 'MISSING'}${exp}`);
  }
  console.log(`site_url=${a.site_url} redirect allow list=${(a.uri_allow_list || '').split(',').length} entries`);
  console.log(`uri_allow_list: ${a.uri_allow_list}`);
})();
