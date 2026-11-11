// Uploads Curbsy's App Store screenshots (6.7-inch iPhone, 1290x2796) from scripts/payments/store-shots/curbsy/
// to the 1.0 version being prepared, when it has none. Env: KEY_ID, ISSUER_ID, KEY_P8.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { api, step } = require('../curbsy-store/asc');

const BUNDLE = 'com.hoodleague.junk';
const DIR = path.join(__dirname, 'store-shots', 'curbsy');
const TYPE = 'APP_IPHONE_67';

(async () => {
  const app = (await api(`/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
  const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION');
  if (!v) { console.log('no version being prepared'); return; }
  const loc = (await api(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data.find((l) => l.attributes.locale === 'en-US');
  const sets = await api(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?include=appScreenshots`);
  let set = sets.data.find((s) => s.attributes.screenshotDisplayType === TYPE);
  if (set && (set.relationships?.appScreenshots?.data || []).length) {
    const failed = (sets.included || []).filter((x) => x.attributes?.assetDeliveryState?.state === 'FAILED');
    if (!failed.length) { console.log('Curbsy already has screenshots; nothing changed.'); return; }
    for (const f of failed) await api(`/v1/appScreenshots/${f.id}`, { method: 'DELETE' });
  }
  if (!set) set = (await api('/v1/appScreenshotSets', { method: 'POST', body: { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: TYPE }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } } })).data;
  for (const name of fs.readdirSync(DIR).filter((f) => /\.(jpg|png)$/.test(f)).sort()) {
    await step(name, async () => {
      const bytes = fs.readFileSync(path.join(DIR, name));
      const made = (await api('/v1/appScreenshots', { method: 'POST', body: { data: { type: 'appScreenshots', attributes: { fileName: name, fileSize: bytes.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } } })).data;
      for (const op of made.attributes.uploadOperations || []) {
        const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
        const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
        if (!res.ok) throw new Error(`upload part answered ${res.status}`);
      }
      const md5 = crypto.createHash('md5').update(bytes).digest('hex');
      await api(`/v1/appScreenshots/${made.id}`, { method: 'PATCH', body: { data: { type: 'appScreenshots', id: made.id, attributes: { uploaded: true, sourceFileChecksum: md5 } } } });
      return 'uploaded';
    });
  }
  await new Promise((r) => setTimeout(r, 20000));
  console.log('Done.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
