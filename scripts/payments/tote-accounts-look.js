// Read-only: which ToteTrack accounts have backed-up totes, how they sign in, and how fresh their rows are.
// Emails are masked. Env: SUPABASE_ACCESS_TOKEN.
const REF = 'nkwedlskhnojseeroezm';
const q = `
select u.id, u.email, u.raw_app_meta_data->'providers' as providers, u.created_at, u.last_sign_in_at,
  count(t.*) filter (where not t.deleted) as live, count(t.*) filter (where t.deleted) as deleted,
  to_timestamp(max(t.updated_at)/1000.0) as newest,
  string_agg(case when not t.deleted then t.data->>'name' end, ', ') as names
from auth.users u join public.totetrack_totes t on t.user_id = u.id
group by u.id order by max(t.updated_at) desc limit 15`;
(async () => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
  });
  const rows = await r.json();
  if (!Array.isArray(rows)) { console.log('FAIL', JSON.stringify(rows).slice(0, 300)); return; }
  for (const x of rows) {
    const e = x.email || '';
    const masked = e.replace(/^(.{3}).*(@.*)$/, '$1***$2');
    console.log(`${x.id.slice(0, 8)} ${masked} ${JSON.stringify(x.providers)} created ${x.created_at?.slice(0, 16)} last sign-in ${x.last_sign_in_at?.slice(0, 16)} | live ${x.live} deleted ${x.deleted} newest ${String(x.newest).slice(0, 16)} | ${x.names}`);
  }
})();
