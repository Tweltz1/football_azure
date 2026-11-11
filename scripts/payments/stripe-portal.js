// Sets up Stripe's customer portal (the page behind "Manage billing" in Talk Shops) when no settings are
// saved yet, then checks that a portal page can be opened. Safe to run again: it skips what exists.
// Env: STRIPE_SECRET_KEY, and ALLOW_LIVE=1 to let it run with a live key. Prints yes/no answers only.

const KEY = process.env.STRIPE_SECRET_KEY || '';
const SITE = 'https://talkshops.app';

async function call(path, fields) {
  const res = await fetch('https://api.stripe.com/v1/' + path, {
    method: fields ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + KEY, ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: fields ? new URLSearchParams(fields) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data?.error?.code || data?.error?.type || ''}: ${String(data?.error?.message || '').replace(/https?:\/\/\S+/g, '<link>').slice(0, 200)}`);
  return data;
}

const yn = (v) => (v ? 'yes' : 'NO');

(async () => {
  if (!KEY) { console.log('FAIL the Stripe key is not set.'); process.exit(1); }
  const live = /^(sk|rk)_live_/.test(KEY);
  console.log(`Mode: ${live ? 'LIVE' : 'test'}`);
  if (live && process.env.ALLOW_LIVE !== '1') { console.log('Stopping: live key and ALLOW_LIVE is not 1.'); return; }

  let list = (await call('billing_portal/configurations?limit=20')).data || [];
  console.log(`Saved portal settings before: ${list.length}, default ${yn(list.some((c) => c.is_default))}`);
  if (!list.length) {
    const made = await call('billing_portal/configurations', {
      'business_profile[headline]': 'Talk Shops billing',
      'business_profile[privacy_policy_url]': SITE + '/privacy.html',
      'business_profile[terms_of_service_url]': SITE + '/terms.html',
      default_return_url: SITE + '/?plan=portal',
      'features[payment_method_update][enabled]': 'true',
      'features[invoice_history][enabled]': 'true',
      'features[customer_update][enabled]': 'true',
      'features[customer_update][allowed_updates][0]': 'email',
      'features[customer_update][allowed_updates][1]': 'address',
      'features[customer_update][allowed_updates][2]': 'tax_id',
      'features[subscription_cancel][enabled]': 'true',
      'features[subscription_cancel][mode]': 'at_period_end',
      'features[subscription_cancel][cancellation_reason][enabled]': 'true',
      'features[subscription_cancel][cancellation_reason][options][0]': 'too_expensive',
      'features[subscription_cancel][cancellation_reason][options][1]': 'missing_features',
      'features[subscription_cancel][cancellation_reason][options][2]': 'switched_service',
      'features[subscription_cancel][cancellation_reason][options][3]': 'unused',
      'features[subscription_cancel][cancellation_reason][options][4]': 'other',
    });
    console.log(`Created portal settings: default ${yn(made.is_default)}, active ${yn(made.active)}`);
    list = (await call('billing_portal/configurations?limit=20')).data || [];
  }
  const def = list.find((c) => c.is_default);
  console.log(`Saved portal settings now: ${list.length}, default ${yn(!!def)}`);

  // Can a portal page be opened the way Talk Shops does it (no settings id passed)?
  const customer = ((await call('customers?limit=1')).data || [])[0];
  if (!customer) { console.log('No customer yet to test a portal page with.'); return; }
  try {
    await call('billing_portal/sessions', { customer: customer.id, return_url: SITE + '/?plan=portal' });
    console.log('Open a portal page the way Talk Shops does: works');
  } catch (error) {
    console.log(`Open a portal page the way Talk Shops does: FAILS (${error.message})`);
    try {
      await call('billing_portal/sessions', { customer: customer.id, return_url: SITE + '/?plan=portal', configuration: list[0].id });
      console.log('Open a portal page naming the settings: works');
    } catch (again) { console.log(`Open a portal page naming the settings: FAILS (${again.message})`); }
  }
  console.log('Done.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
