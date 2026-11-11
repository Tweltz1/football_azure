// Tries to queue Curbsy's three tips with the version that's waiting for review. Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');
(async () => {
  const app = (await api('/v1/apps?filter[bundleId]=com.hoodleague.junk')).data[0];
  for (const p of (await api(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`)).data.filter((x) => x.attributes.state === 'READY_TO_SUBMIT')) {
    await step(`add ${p.attributes.productId}`, async () => {
      await api('/v1/inAppPurchaseSubmissions', { method: 'POST', body: { data: { type: 'inAppPurchaseSubmissions', relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: p.id } } } } } });
      return (await api(`/v2/inAppPurchases/${p.id}`)).data.attributes.state;
    });
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
