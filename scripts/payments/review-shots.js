// Uploads the App Review screenshot for each paid product (Apple wants a picture of where it's bought in
// the app). Skips products that already have one, and images that aren't there yet.
// Curbsy pictures: scripts/payments/shots/ (the real Curbsy sheets, captured on an iPhone-sized screen).
// ToteTrack picture: 7-pro.png from the totetrack-store-shots branch, fetched by the workflow into TOTE_SHOTS.
// Env: KEY_ID, ISSUER_ID, KEY_P8, TOTE_SHOTS (folder, optional).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { api, step } = require('../curbsy-store/asc');

const HERE = path.join(__dirname, 'shots');
const TOTE = process.env.TOTE_SHOTS || '';
const PRODUCTS = [
  { bundle: 'com.hoodleague.junk', id: 'com.hoodleague.junk.plus.monthly', kind: 'sub', file: path.join(HERE, 'curbsy-plus.jpg') },
  { bundle: 'com.hoodleague.junk', id: 'com.hoodleague.junk.tip.small', kind: 'iap', file: path.join(HERE, 'curbsy-tips.jpg') },
  { bundle: 'com.hoodleague.junk', id: 'com.hoodleague.junk.tip.medium', kind: 'iap', file: path.join(HERE, 'curbsy-tips.jpg') },
  { bundle: 'com.hoodleague.junk', id: 'com.hoodleague.junk.tip.large', kind: 'iap', file: path.join(HERE, 'curbsy-tips.jpg') },
  { bundle: 'com.tweltz1.totetrack', id: 'com.tweltz1.totetrack.pro.monthly', kind: 'sub', file: TOTE && path.join(TOTE, '7-pro.jpg') },
  { bundle: 'com.tweltz1.totetrack', id: 'com.tweltz1.totetrack.pro.yearly', kind: 'sub', file: TOTE && path.join(TOTE, '7-pro.jpg') },
];

const apps = {};
async function product(p) {
  if (!apps[p.bundle]) {
    const app = (await api(`/v1/apps?filter[bundleId]=${p.bundle}`)).data[0];
    const g = await api(`/v1/apps/${app.id}/subscriptionGroups?include=subscriptions&limit=50`);
    const iaps = (await api(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`)).data;
    apps[p.bundle] = { subs: (g.included || []).filter((x) => x.type === 'subscriptions'), iaps };
  }
  const a = apps[p.bundle];
  return (p.kind === 'sub' ? a.subs : a.iaps).find((x) => x.attributes.productId === p.id);
}

async function upload(p, item) {
  const type = p.kind === 'sub' ? 'subscriptionAppStoreReviewScreenshots' : 'inAppPurchaseAppStoreReviewScreenshots';
  const existing = await api(p.kind === 'sub' ? `/v1/subscriptions/${item.id}/appStoreReviewScreenshot` : `/v2/inAppPurchases/${item.id}/appStoreReviewScreenshot`).catch(() => null);
  const state = existing?.data?.attributes?.assetDeliveryState?.state;
  if (existing?.data && state !== 'FAILED') return `already there (${state || 'uploaded'})`;
  if (existing?.data) await api(`/v1/${type}/${existing.data.id}`, { method: 'DELETE' });
  if (!p.file || !fs.existsSync(p.file)) throw new Error('picture not available yet');
  const bytes = fs.readFileSync(p.file);
  const rel = p.kind === 'sub' ? { subscription: { data: { type: 'subscriptions', id: item.id } } } : { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: item.id } } };
  const made = (await api(`/v1/${type}`, { method: 'POST', body: { data: { type, attributes: { fileName: path.basename(p.file), fileSize: bytes.length }, relationships: rel } } })).data;
  for (const op of made.attributes.uploadOperations || []) {
    const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`upload part answered ${res.status}`);
  }
  const md5 = crypto.createHash('md5').update(bytes).digest('hex');
  await api(`/v1/${type}/${made.id}`, { method: 'PATCH', body: { data: { type, id: made.id, attributes: { uploaded: true, sourceFileChecksum: md5 } } } });
  return `uploaded ${path.basename(p.file)}`;
}

(async () => {
  for (const p of PRODUCTS) {
    await step(p.id, async () => {
      const item = await product(p);
      if (!item) throw new Error('product not found');
      return upload(p, item);
    });
  }
  // Apple processes the pictures for a moment before the state moves on.
  await new Promise((r) => setTimeout(r, 20000));
  for (const p of PRODUCTS) {
    await step(`${p.id} state`, async () => {
      const item = await product(p);
      const fresh = await api(p.kind === 'sub' ? `/v1/subscriptions/${item.id}` : `/v2/inAppPurchases/${item.id}`);
      return fresh.data.attributes.state;
    });
  }
  console.log('Done.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
