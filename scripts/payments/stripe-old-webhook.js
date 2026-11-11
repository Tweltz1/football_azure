// Deletes the Stripe webhook endpoint that still points at the OLD shared Supabase project's Talk Shops route.
// Talk Shops moved to its own project (evpcfkasnbpoajkpltch); Tyler OK'd removing this on 2026-11-11.
// Only touches endpoints on the old project ref with exactly that path. Env: STRIPE_SECRET_KEY.
const KEY = process.env.STRIPE_SECRET_KEY || '';
const OLD = 'nkwedlskhnojseeroezm.supabase.co';
const PATH = '/functions/v1/api/shop/stripe-webhook';

async function call(path, method = 'GET') {
  const res = await fetch('https://api.stripe.com/v1/' + path, { method, headers: { Authorization: 'Bearer ' + KEY } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data?.error?.code || data?.error?.type || ''}`.trim());
  return data;
}

(async () => {
  if (!KEY) { console.log('FAIL the Stripe key is not set.'); process.exit(1); }
  console.log(`Mode: ${/_live_/.test(KEY) ? 'live' : 'test'}`);
  const list = (await call('webhook_endpoints?limit=100')).data || [];
  const old = list.filter((w) => { try { const u = new URL(w.url); return u.hostname === OLD && u.pathname === PATH; } catch (e) { return false; } });
  console.log(`Endpoints: ${list.length}, on the old project: ${old.length}`);
  for (const w of old) {
    const r = await call('webhook_endpoints/' + encodeURIComponent(w.id), 'DELETE');
    console.log(`Deleted one (made ${new Date(w.created * 1000).toISOString().slice(0, 16)}Z): ${r.deleted ? 'yes' : 'NO'}`);
  }
  console.log(`Endpoints left: ${((await call('webhook_endpoints?limit=100')).data || []).length}`);
  console.log('Done.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
