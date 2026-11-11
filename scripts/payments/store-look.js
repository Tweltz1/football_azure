// Read-only: prints what App Store Connect has for each app's paid products and what each still needs.
// Changes nothing. Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');

const APPS = ['com.hoodleague.junk', 'com.tweltz1.totetrack'];

(async () => {
  for (const bundle of APPS) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    if (!app) { console.log(`\n${bundle}: app not found`); continue; }
    console.log(`\n== ${app.attributes.name} (${bundle})`);
    await step('versions', async () => {
      const v = await api(`/v1/apps/${app.id}/appStoreVersions?limit=3`);
      return v.data.map((x) => `${x.attributes.versionString} ${x.attributes.appVersionState || x.attributes.appStoreState}`).join('; ');
    });
    await step('review contact', async () => {
      const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=1`)).data[0];
      if (!v) return 'no version';
      const d = await api(`/v1/appStoreVersions/${v.id}/appStoreReviewDetail`).catch(() => null);
      const a = d?.data?.attributes || {};
      return `name ${a.contactFirstName ? 'set' : 'MISSING'}, phone ${a.contactPhone ? 'set' : 'MISSING'}, email ${a.contactEmail ? 'set' : 'MISSING'}`;
    });
    await step('subscriptions', async () => {
      const g = await api(`/v1/apps/${app.id}/subscriptionGroups?include=subscriptions&limit=50`);
      const subs = (g.included || []).filter((x) => x.type === 'subscriptions');
      const lines = [];
      for (const s of subs) {
        const shot = await api(`/v1/subscriptions/${s.id}/appStoreReviewScreenshot`).then((r) => r?.data ? (r.data.attributes?.assetDeliveryState?.state || 'yes') : false).catch(() => false);
        lines.push(`${s.attributes.productId} | ${s.attributes.state} | ${s.attributes.subscriptionPeriod} | level ${s.attributes.groupLevel} | review screenshot ${shot || 'NO'}`);
      }
      return `${subs.length}\n     ` + lines.join('\n     ');
    });
    await step('agreements (Paid Apps active?)', async () => {
      const r = await api(`/v1/apps/${app.id}/appPriceSchedule`).then(() => 'price schedule readable').catch((e) => e.message.slice(0, 160));
      return r;
    });
    await step('one-time purchases', async () => {
      const p = (await api(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`)).data;
      const lines = [];
      for (const x of p) {
        const shot = await api(`/v2/inAppPurchases/${x.id}/appStoreReviewScreenshot`).then((r) => r?.data ? (r.data.attributes?.assetDeliveryState?.state || 'yes') : false).catch(() => false);
        lines.push(`${x.attributes.productId} | ${x.attributes.state} | ${x.attributes.inAppPurchaseType} | review screenshot ${shot || 'NO'}`);
      }
      return `${p.length}\n     ` + lines.join('\n     ');
    });
  }
  console.log('\nDone.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
