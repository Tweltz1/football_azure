// Uploads the App Store screenshots (6.7-inch iPhone, 1290x2796) for Hood League, Hood Games and Hood
// Protocol to the 1.0 version being prepared, replacing any already there. Pictures come from
// scripts/payments/store-shots/<bundle>/ (made by store-shots/capture-hood.js), and for Hood Protocol from
// $HOOD_PROTOCOL_SHOTS (the hood-protocol-store-shots branch, made in the simulator by hood-protocol.yml).
// Env: KEY_ID, ISSUER_ID, KEY_P8.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { api, step } = require('../curbsy-store/asc');

const TYPE = 'APP_IPHONE_67';
const SOURCES = {
  'com.hoodleague.draft': path.join(__dirname, 'store-shots', 'com.hoodleague.draft'),
  'com.hoodleague.games': path.join(__dirname, 'store-shots', 'com.hoodleague.games'),
  'com.tweltz1.hoodprotocol': process.env.HOOD_PROTOCOL_SHOTS || '',
};

(async () => {
  for (const [bundle, dir] of Object.entries(SOURCES)) {
    const files = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jpg|png)$/.test(f)).sort() : [];
    console.log(`\n== ${bundle}: ${files.length} pictures`);
    if (!files.length) continue;
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION');
    if (!v) { console.log('no version being prepared; skipped'); continue; }
    const loc = (await api(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data.find((l) => l.attributes.locale === 'en-US');
    const sets = await api(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
    let set = sets.data.find((s) => s.attributes.screenshotDisplayType === TYPE);
    if (set) {
      const old = await api(`/v1/appScreenshotSets/${set.id}/appScreenshots`);
      for (const s of old.data) await api(`/v1/appScreenshots/${s.id}`, { method: 'DELETE' });
      if (old.data.length) console.log(`removed ${old.data.length} old pictures`);
    } else {
      set = (await api('/v1/appScreenshotSets', { method: 'POST', body: { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: TYPE }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } } })).data;
    }
    for (const name of files) {
      await step(name, async () => {
        const bytes = fs.readFileSync(path.join(dir, name));
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
  }
  await new Promise((r) => setTimeout(r, 30000));
  // Apple checks each picture after upload; report any it refused.
  for (const bundle of Object.keys(SOURCES)) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION');
    if (!v) continue;
    const loc = (await api(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data.find((l) => l.attributes.locale === 'en-US');
    const sets = await api(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
    for (const s of sets.data) {
      const shots = await api(`/v1/appScreenshotSets/${s.id}/appScreenshots`);
      const states = {};
      for (const x of shots.data) { const st = x.attributes.assetDeliveryState?.state || '?'; states[st] = (states[st] || 0) + 1; }
      console.log(`${bundle} ${s.attributes.screenshotDisplayType}: ${JSON.stringify(states)}`);
    }
  }
  console.log('Done.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
