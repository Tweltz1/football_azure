// Read-only: asks Stripe whether the Talk Shops account can take money. Changes nothing.
// Env: STRIPE_SECRET_KEY. This repo's logs are public, so only yes/no answers and setting names are
// printed: never the key, the account id, names, emails or amounts.

const KEY = process.env.STRIPE_SECRET_KEY || '';

async function get(path) {
  const res = await fetch('https://api.stripe.com/v1/' + path, { headers: { Authorization: 'Bearer ' + KEY } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data?.error?.code || data?.error?.type || ''}`.trim());
  return data;
}

async function step(name, fn) {
  try {
    const out = await fn();
    console.log(`OK   ${name}${out ? `: ${out}` : ''}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

const yn = (v) => (v ? 'yes' : 'NO');

(async () => {
  if (!KEY) { console.log('FAIL TALKSHOPS_STRIPE_SECRET_KEY is not set.'); process.exit(1); }
  const kind = /^sk_live_/.test(KEY) ? 'live secret key' : /^sk_test_/.test(KEY) ? 'TEST secret key' : /^rk_live_/.test(KEY) ? 'live restricted key'
    : /^rk_test_/.test(KEY) ? 'TEST restricted key' : 'not a Stripe secret key (unknown prefix)';
  console.log(`Key kind: ${kind}`);

  await step('Mode Stripe reports', async () => `livemode ${yn((await get('balance')).livemode)}`);

  await step('Account', async () => {
    const a = await get('account');
    const due = a.requirements?.currently_due || [];
    const later = a.requirements?.eventually_due || [];
    const lines = [
      `can take card payments ${yn(a.charges_enabled)}`,
      `can pay out to the bank ${yn(a.payouts_enabled)}`,
      `sign-up details submitted ${yn(a.details_submitted)}`,
      `card payments capability ${a.capabilities?.card_payments || 'none'}`,
      `country ${a.country || '?'}, currency ${a.default_currency || '?'}, business type ${a.business_type || 'not set'}`,
      `statement name ${a.settings?.payments?.statement_descriptor ? 'set' : 'missing'}`,
      `public business name ${a.business_profile?.name || a.settings?.dashboard?.display_name ? 'set' : 'missing'}`,
      `support email ${a.business_profile?.support_email ? 'set' : 'missing'}, website ${a.business_profile?.url ? 'set' : 'missing'}`,
      `bank accounts on file ${a.external_accounts ? a.external_accounts.total_count ?? (a.external_accounts.data || []).length : 'not shown to this key'}`,
      `payout schedule ${a.settings?.payouts?.schedule?.interval || 'not shown'}`,
      `needed now (${due.length}): ${due.join(', ') || 'nothing'}`,
      `needed later (${later.length}): ${later.join(', ') || 'nothing'}`,
      `disabled reason: ${a.requirements?.disabled_reason || 'none'}`,
    ];
    return '\n     ' + lines.join('\n     ');
  });

  await step('Webhook endpoints', async () => {
    const list = (await get('webhook_endpoints?limit=100')).data || [];
    const lines = list.map((w) => {
      let where = '?';
      try { const u = new URL(w.url); where = u.hostname.replace(/^[a-z0-9]+\./, '<project>.') + u.pathname; } catch (error) { /* keep ? */ }
      return `${where} | ${w.status} | livemode ${yn(w.livemode)} | events: ${(w.enabled_events || []).join(', ')}`;
    });
    return `${list.length}\n     ` + lines.join('\n     ');
  });

  await step('Customer portal ("Manage billing")', async () => {
    const list = (await get('billing_portal/configurations?limit=20')).data || [];
    const def = list.find((c) => c.is_default);
    if (!list.length) return 'NO settings saved yet, so Manage billing would fail';
    const f = (def || list[0]).features || {};
    return `${list.length} saved, default ${yn(!!def)}, active ${yn((def || list[0]).active)}, cancel ${yn(f.subscription_cancel?.enabled)}, `
      + `change card ${yn(f.payment_method_update?.enabled)}, invoices ${yn(f.invoice_history?.enabled)}, switch plan ${yn(f.subscription_update?.enabled)}`;
  });

  await step('Subscriptions so far', async () => {
    const list = (await get('subscriptions?status=all&limit=100')).data || [];
    const by = {};
    for (const s of list) by[s.status] = (by[s.status] || 0) + 1;
    return `${list.length}${list.length ? ' (' + Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') + ')' : ''}`;
  });

  await step('Promo codes', async () => `${((await get('promotion_codes?active=true&limit=100')).data || []).length} active`);
  console.log('Done.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
