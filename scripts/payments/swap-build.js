// Pulls each app's 1.0 out of App Review, attaches a newer build, updates review notes, and resubmits
// with its in-app purchases. Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');

const TOTE_NOTES = "ToteTrack needs an account because totes, items, photos and packing lists are saved to it and sync across the user's phones (and are cleared from a phone when signing out). Sign in on the first screen with Apple or Google. Delete account is under the person icon (top left) > Account & backup. Labels can be printed from the print icon (top right) and scanned with the Scan button. NFC stickers are optional and need an NTAG sticker. Swipe a tote or item left to delete it. ToteTrack Pro (auto-renewing subscription) unlocks more than 10 totes and Snap to add; the paywall is at Account & backup or appears when creating an 11th tote.";
const APPS = [
  { bundle: 'com.hoodleague.junk', build: '85' },
  { bundle: 'com.tweltz1.totetrack', build: '77', notes: TOTE_NOTES },
];
const one = (type, id) => ({ data: { type, id } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const a of APPS) {
    const app = (await api(`/v1/apps?filter[bundleId]=${a.bundle}`)).data[0];
    console.log(`\n== ${app.attributes.name}`);
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.versionString.startsWith('1.0'));
    console.log(`version ${v.attributes.versionString} ${v.attributes.appStoreState}`);

    await step('pull out of review', async () => {
      const subs = (await api(`/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=WAITING_FOR_REVIEW,READY_FOR_REVIEW,UNRESOLVED_ISSUES,IN_REVIEW&limit=5`)).data;
      const out = [];
      for (const s of subs) {
        if (s.attributes.state === 'IN_REVIEW') { out.push(`${s.id} IN_REVIEW (left alone)`); continue; }
        if (s.attributes.state === 'WAITING_FOR_REVIEW') {
          await api(`/v1/reviewSubmissions/${s.id}`, { method: 'PATCH', body: { data: { type: 'reviewSubmissions', id: s.id, attributes: { canceled: true } } } });
        }
        let st = s.attributes.state;
        for (let i = 0; i < 24 && ['WAITING_FOR_REVIEW', 'CANCELING'].includes(st); i++) {
          await sleep(5000);
          st = (await api(`/v1/reviewSubmissions/${s.id}`)).data.attributes.state;
        }
        out.push(`${s.id} ${st}`);
      }
      return out.join(', ') || 'nothing in review';
    });
    const vNow = (await api(`/v1/appStoreVersions/${v.id}`)).data.attributes.appStoreState;
    console.log(`version now ${vNow}`);

    await step(`attach build ${a.build}`, async () => {
      const b = (await api(`/v1/builds?filter[app]=${app.id}&filter[version]=${a.build}&limit=5`)).data[0];
      if (!b) throw new Error('build not found');
      if (b.attributes.processingState !== 'VALID') throw new Error(`build ${b.attributes.processingState}`);
      if (b.attributes.usesNonExemptEncryption == null) {
        await api(`/v1/builds/${b.id}`, { method: 'PATCH', body: { data: { type: 'builds', id: b.id, attributes: { usesNonExemptEncryption: false } } } });
      }
      await api(`/v1/appStoreVersions/${v.id}/relationships/build`, { method: 'PATCH', body: one('builds', b.id) });
      const now = await api(`/v1/appStoreVersions/${v.id}/build`);
      return `attached ${now.data.attributes.version}`;
    });

    if (a.notes) {
      await step('review notes', async () => {
        const d = await api(`/v1/appStoreVersions/${v.id}/appStoreReviewDetail`);
        await api(`/v1/appStoreReviewDetails/${d.data.id}`, { method: 'PATCH', body: { data: { type: 'appStoreReviewDetails', id: d.data.id, attributes: { notes: a.notes, demoAccountRequired: false } } } });
        return 'updated';
      });
    }

    // Draft submission with the version first, then the products, then send it.
    let sub;
    await step('draft submission', async () => {
      const open = (await api(`/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES&limit=5`)).data[0];
      sub = open || (await api('/v1/reviewSubmissions', { method: 'POST', body: { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: one('apps', app.id) } } } })).data;
      const items = await api(`/v1/reviewSubmissions/${sub.id}/items?include=appStoreVersion`);
      if (!items.data.some((i) => i.relationships?.appStoreVersion?.data)) {
        await api('/v1/reviewSubmissionItems', { method: 'POST', body: { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: one('reviewSubmissions', sub.id), appStoreVersion: one('appStoreVersions', v.id) } } } });
      }
      return sub.id;
    });
    const g = await api(`/v1/apps/${app.id}/subscriptionGroups?include=subscriptions&limit=50`);
    for (const s of (g.included || []).filter((x) => x.type === 'subscriptions')) {
      console.log(`  ${s.attributes.productId}: ${s.attributes.state}`);
      if (s.attributes.state !== 'READY_TO_SUBMIT' && s.attributes.state !== 'DEVELOPER_ACTION_NEEDED') continue;
      await step(`add ${s.attributes.productId}`, async () => {
        await api('/v1/subscriptionSubmissions', { method: 'POST', body: { data: { type: 'subscriptionSubmissions', relationships: { subscription: one('subscriptions', s.id) } } } });
      });
    }
    for (const p of (await api(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`)).data) {
      console.log(`  ${p.attributes.productId}: ${p.attributes.state}`);
      if (p.attributes.state !== 'READY_TO_SUBMIT' && p.attributes.state !== 'DEVELOPER_ACTION_NEEDED') continue;
      await step(`add ${p.attributes.productId}`, async () => {
        await api('/v1/inAppPurchaseSubmissions', { method: 'POST', body: { data: { type: 'inAppPurchaseSubmissions', relationships: { inAppPurchaseV2: one('inAppPurchases', p.id) } } } });
      });
    }
    await step('items in draft', async () => {
      const items = await api(`/v1/reviewSubmissions/${sub.id}/items?limit=50`);
      return `${items.data.length} items`;
    });
    if (process.env.SWAP_SUBMIT === '0') continue;
    await step('submit', async () => {
      await api(`/v1/reviewSubmissions/${sub.id}`, { method: 'PATCH', body: { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } } });
      return (await api(`/v1/reviewSubmissions/${sub.id}`)).data.attributes.state;
    });
  }
  console.log('\nDone.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
