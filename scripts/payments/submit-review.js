// Sends the 1.0 version of each app named in SUBMIT_APPS (default: both) to App Review, with its in-app
// purchases. First-time purchases ride along with the version. Prints what Apple says when it refuses.
// Env: KEY_ID, ISSUER_ID, KEY_P8, SUBMIT_APPS or scripts/payments/submit-apps.txt (bundle ids, optional).
const { api, step } = require('../curbsy-store/asc');

const fs = require('fs');
const LIST = require('path').join(__dirname, 'submit-apps.txt');
const APPS = (process.env.SUBMIT_APPS || (fs.existsSync(LIST) ? fs.readFileSync(LIST, 'utf8').replace(/\n/g, ',') : 'com.hoodleague.junk,com.tweltz1.totetrack')).split(',').map((s) => s.trim()).filter(Boolean);
const one = (type, id) => ({ data: { type, id } });

(async () => {
  for (const bundle of APPS) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    if (!app) { console.log(`${bundle}: app not found`); continue; }
    console.log(`\n== ${app.attributes.name}`);
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION');
    if (!v) { console.log('no version being prepared'); continue; }

    // Paid products: queue each one that's ready so it goes in with this version.
    const g = await api(`/v1/apps/${app.id}/subscriptionGroups?include=subscriptions&limit=50`);
    for (const s of (g.included || []).filter((x) => x.type === 'subscriptions' && x.attributes.state === 'READY_TO_SUBMIT')) {
      await step(`add ${s.attributes.productId}`, async () => {
        await api('/v1/subscriptionSubmissions', { method: 'POST', body: { data: { type: 'subscriptionSubmissions', relationships: { subscription: one('subscriptions', s.id) } } } });
      });
    }
    for (const p of (await api(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`)).data.filter((x) => x.attributes.state === 'READY_TO_SUBMIT')) {
      await step(`add ${p.attributes.productId}`, async () => {
        await api('/v1/inAppPurchaseSubmissions', { method: 'POST', body: { data: { type: 'inAppPurchaseSubmissions', relationships: { inAppPurchaseV2: one('inAppPurchases', p.id) } } } });
      });
    }

    await step(`submit ${v.attributes.versionString} for review`, async () => {
      const open = (await api(`/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES&limit=5`)).data[0];
      const sub = open || (await api('/v1/reviewSubmissions', { method: 'POST', body: { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: one('apps', app.id) } } } })).data;
      const items = await api(`/v1/reviewSubmissions/${sub.id}/items`);
      if (!items.data.length) {
        await api('/v1/reviewSubmissionItems', { method: 'POST', body: { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: one('reviewSubmissions', sub.id), appStoreVersion: one('appStoreVersions', v.id) } } } });
      }
      await api(`/v1/reviewSubmissions/${sub.id}`, { method: 'PATCH', body: { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } } });
      const after = await api(`/v1/reviewSubmissions/${sub.id}`);
      return after.data.attributes.state;
    });
  }
  console.log('\nDone.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
