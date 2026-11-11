// Read-only: counts Talk Shops shops by plan, and how many carry Stripe ids that don't exist for the key in
// use (ids left over from test mode would break checkout and Manage billing after the switch to live).
// Changes nothing. Prints counts only: no shop names, ids or emails.
// Env: STRIPE_SECRET_KEY, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_ID.

const { STRIPE_SECRET_KEY: KEY = '', SUPABASE_ACCESS_TOKEN: TOKEN = '', SUPABASE_PROJECT_ID: REF = '' } = process.env;

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, read_only: true }),
  });
  if (!res.ok) throw new Error(`database answered ${res.status}`);
  return res.json();
}

async function stripeHas(path) {
  const res = await fetch('https://api.stripe.com/v1/' + path, { headers: { Authorization: 'Bearer ' + KEY } });
  if (res.status === 404) return false;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { if (data?.error?.code === 'resource_missing') return false; throw new Error(`Stripe answered ${res.status}`); }
  return !data.deleted;
}

(async () => {
  if (!KEY || !TOKEN || !REF) { console.log('FAIL a needed secret is not set.'); process.exit(1); }
  console.log(`Stripe key mode: ${/_live_/.test(KEY) ? 'live' : 'test'}`);
  const groups = await sql(`select coalesce(plan, '(none: older shop, no limits)') as plan, plan_status, count(*)::int as shops,
    count(stripe_customer_id)::int as with_customer, count(stripe_subscription_id)::int as with_subscription,
    count(*) filter (where trial_ends_at > now())::int as trial_running
    from public.repair_shops group by 1, 2 order by 1, 2`);
  console.log('Shops by plan:');
  for (const g of groups) console.log(`  ${g.plan} / ${g.plan_status || '(blank)'}: ${g.shops} shops, ${g.with_customer} with a Stripe customer, ${g.with_subscription} with a subscription, ${g.trial_running} with trial time left`);
  if (!groups.length) console.log('  no shops yet');

  const rows = await sql(`select plan, plan_status, stripe_customer_id, stripe_subscription_id from public.repair_shops
    where stripe_customer_id is not null or stripe_subscription_id is not null`);
  let missingCustomer = 0, missingSub = 0, paidOnMissing = 0;
  for (const r of rows) {
    const c = r.stripe_customer_id ? await stripeHas('customers/' + encodeURIComponent(r.stripe_customer_id)) : true;
    const s = r.stripe_subscription_id ? await stripeHas('subscriptions/' + encodeURIComponent(r.stripe_subscription_id)) : true;
    if (!c) missingCustomer += 1;
    if (!s) missingSub += 1;
    if ((!c || !s) && r.plan && r.plan !== 'trial') paidOnMissing += 1;
  }
  console.log(`Shops with Stripe ids: ${rows.length}`);
  console.log(`  customer not found with this key: ${missingCustomer}`);
  console.log(`  subscription not found with this key: ${missingSub}`);
  console.log(`  of those, shops currently marked as on a paid plan: ${paidOnMissing}`);
  console.log('Done.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
