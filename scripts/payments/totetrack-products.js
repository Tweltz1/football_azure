// Creates ToteTrack Pro in App Store Connect: one subscription group with a monthly and a yearly plan,
// their names, countries and prices. Safe to run again: each step skips what already exists.
// Product ids and prices match totetrack-app/src/lib/pro.tsx. Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');

const BUNDLE = 'com.tweltz1.totetrack';
const GROUP = 'ToteTrack Pro';
const PLANS = [
  { ref: 'ToteTrack Pro Yearly', id: 'com.tweltz1.totetrack.pro.yearly', period: 'ONE_YEAR', price: '14.99', name: 'ToteTrack Pro (Yearly)', about: 'Unlimited totes and Snap to add' },
  { ref: 'ToteTrack Pro Monthly', id: 'com.tweltz1.totetrack.pro.monthly', period: 'ONE_MONTH', price: '1.99', name: 'ToteTrack Pro (Monthly)', about: 'Unlimited totes and Snap to add' },
];

const one = (type, id) => ({ data: { type, id } });

async function territories() {
  const out = [];
  let next = '/v1/territories?limit=200';
  while (next) { const r = await api(next); out.push(...r.data.map((t) => t.id)); next = r.links?.next || null; }
  return out;
}

async function setUpPlan(group, lands, plan) {
  let sub = (await api(`/v1/subscriptionGroups/${group.id}/subscriptions?limit=50`)).data.find((s) => s.attributes.productId === plan.id);
  await step(plan.ref, async () => {
    if (sub) return `already there (${sub.attributes.state})`;
    // Both plans unlock the same thing, so they share level 1 (switching between them is a crossgrade).
    sub = (await api('/v1/subscriptions', { method: 'POST', body: { data: { type: 'subscriptions', attributes: { name: plan.ref, productId: plan.id, subscriptionPeriod: plan.period, familySharable: false, groupLevel: 1 }, relationships: { group: one('subscriptionGroups', group.id) } } } })).data;
    return 'created';
  });
  if (!sub) return;
  await step(`${plan.ref} name and description`, async () => {
    const loc = await api(`/v1/subscriptions/${sub.id}/subscriptionLocalizations`);
    if (loc.data.some((l) => l.attributes.locale === 'en-US')) return 'already there';
    await api('/v1/subscriptionLocalizations', { method: 'POST', body: { data: { type: 'subscriptionLocalizations', attributes: { name: plan.name, description: plan.about, locale: 'en-US' }, relationships: { subscription: one('subscriptions', sub.id) } } } });
    return 'created';
  });
  await step(`${plan.ref} countries`, async () => {
    const has = await api(`/v1/subscriptions/${sub.id}/subscriptionAvailability`).catch(() => null);
    if (has && has.data) return 'already there';
    await api('/v1/subscriptionAvailabilities', { method: 'POST', body: { data: { type: 'subscriptionAvailabilities', attributes: { availableInNewTerritories: true }, relationships: { subscription: one('subscriptions', sub.id), availableTerritories: { data: lands.map((id) => ({ type: 'territories', id })) } } } } });
    return `${lands.length} countries`;
  });
  await step(`${plan.ref} prices ($${plan.price} in the US, matched elsewhere)`, async () => {
    const have = new Set();
    let next = `/v1/subscriptions/${sub.id}/prices?include=territory&limit=200`;
    while (next) { const r = await api(next); for (const p of r.data) have.add(p.relationships?.territory?.data?.id); next = r.links?.next || null; }
    const us = (await api(`/v1/subscriptions/${sub.id}/pricePoints?filter[territory]=USA&limit=200`)).data.find((p) => p.attributes.customerPrice === plan.price);
    if (!us) throw new Error(`no ${plan.price} price point`);
    const points = [{ land: 'USA', id: us.id }];
    next = `/v1/subscriptionPricePoints/${us.id}/equalizations?include=territory&limit=200`;
    while (next) { const r = await api(next); for (const p of r.data) points.push({ land: p.relationships?.territory?.data?.id, id: p.id }); next = r.links?.next || null; }
    let made = 0, failed = 0, firstError = '';
    for (const p of points) {
      if (!p.land || have.has(p.land)) continue;
      try {
        await api('/v1/subscriptionPrices', { method: 'POST', body: { data: { type: 'subscriptionPrices', attributes: { preserveCurrentPrice: false }, relationships: { subscription: one('subscriptions', sub.id), subscriptionPricePoint: one('subscriptionPricePoints', p.id) } } } });
        made += 1;
      } catch (error) { failed += 1; firstError = firstError || error.message; }
    }
    if (failed) throw new Error(`${made} set, ${failed} failed: ${firstError}`);
    return `${made} set, ${have.size} already there`;
  });
  await step(`${plan.ref} state now`, async () => (await api(`/v1/subscriptions/${sub.id}`)).data.attributes.state);
}

(async () => {
  const app = (await api(`/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
  if (!app) throw new Error('App not found');
  const lands = await territories();
  let group = (await api(`/v1/apps/${app.id}/subscriptionGroups?limit=50`)).data.find((g) => g.attributes.referenceName === GROUP);
  await step('Pro group', async () => {
    if (group) return 'already there';
    group = (await api('/v1/subscriptionGroups', { method: 'POST', body: { data: { type: 'subscriptionGroups', attributes: { referenceName: GROUP }, relationships: { app: one('apps', app.id) } } } })).data;
    return 'created';
  });
  if (!group) return;
  await step('Pro group name', async () => {
    const loc = await api(`/v1/subscriptionGroups/${group.id}/subscriptionGroupLocalizations`);
    if (loc.data.some((l) => l.attributes.locale === 'en-US')) return 'already there';
    await api('/v1/subscriptionGroupLocalizations', { method: 'POST', body: { data: { type: 'subscriptionGroupLocalizations', attributes: { name: GROUP, locale: 'en-US' }, relationships: { subscriptionGroup: one('subscriptionGroups', group.id) } } } });
    return 'created';
  });
  for (const plan of PLANS) await setUpPlan(group, lands, plan);
  console.log('Done.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
