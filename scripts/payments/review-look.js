// Read-only: each app's review submissions, their item counts, version state, attached build and product states.
const { api } = require('../curbsy-store/asc');
(async () => {
  for (const bundle of ['com.hoodleague.junk', 'com.tweltz1.totetrack']) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.versionString.startsWith('1.0'));
    const b = await api(`/v1/appStoreVersions/${v.id}/build`);
    console.log(`\n== ${app.attributes.name}: version ${v.attributes.appStoreState}, build ${b.data?.attributes?.version}`);
    for (const s of (await api(`/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=WAITING_FOR_REVIEW,IN_REVIEW,READY_FOR_REVIEW,UNRESOLVED_ISSUES&limit=5`)).data) {
      const items = await api(`/v1/reviewSubmissions/${s.id}/items?limit=50`);
      console.log(`submission ${s.attributes.state}: ${items.data.length} items`);
    }
    const g = await api(`/v1/apps/${app.id}/subscriptionGroups?include=subscriptions&limit=50`);
    for (const s of (g.included || []).filter((x) => x.type === 'subscriptions')) console.log(`  ${s.attributes.productId}: ${s.attributes.state}`);
    for (const p of (await api(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`)).data) console.log(`  ${p.attributes.productId}: ${p.attributes.state}`);
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
