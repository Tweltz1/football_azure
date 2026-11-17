// Tries to queue Curbsy's tips and Plus with the version that's waiting for review, and prints Apple's reasons.
// Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api } = require('../curbsy-store/asc');
const why = (e) => { try { const j = JSON.parse(e.body); return j.errors.map((x) => `${x.code}: ${x.detail}` + Object.values(x.meta?.associatedErrors || {}).flat().map((a) => ` | ${a.code}: ${a.detail}`).join('')).join(' ; '); } catch { return e.message; } };
(async () => {
  const app = (await api('/v1/apps?filter[bundleId]=com.hoodleague.junk')).data[0];
  for (const p of (await api(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`)).data.filter((x) => x.attributes.state === 'READY_TO_SUBMIT')) {
    try {
      await api('/v1/inAppPurchaseSubmissions', { method: 'POST', body: { data: { type: 'inAppPurchaseSubmissions', relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: p.id } } } } } });
      console.log('OK', p.attributes.productId, (await api(`/v2/inAppPurchases/${p.id}`)).data.attributes.state);
    } catch (e) { console.log('NO', p.attributes.productId, why(e)); }
  }
  const g = await api(`/v1/apps/${app.id}/subscriptionGroups?include=subscriptions&limit=10`);
  for (const s of (g.included || []).filter((x) => x.type === 'subscriptions' && x.attributes.state === 'READY_TO_SUBMIT')) {
    try {
      await api('/v1/subscriptionSubmissions', { method: 'POST', body: { data: { type: 'subscriptionSubmissions', relationships: { subscription: { data: { type: 'subscriptions', id: s.id } } } } } });
      console.log('OK', s.attributes.productId, (await api(`/v1/subscriptions/${s.id}`)).data.attributes.state);
    } catch (e) { console.log('NO', s.attributes.productId, why(e)); }
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
