// Adds each app's subscription group to its open App Review draft (Apple wants the group submitted with the
// first subscription). Env: KEY_ID, ISSUER_ID, KEY_P8; bundles from submit-apps.txt.
const fs = require('fs');
const path = require('path');
const { api, step } = require('../curbsy-store/asc');
const APPS = fs.readFileSync(path.join(__dirname, 'submit-apps.txt'), 'utf8').split(/\s+/).filter(Boolean);
(async () => {
  for (const bundle of APPS) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    const g = await api(`/v1/apps/${app.id}/subscriptionGroups?limit=10`);
    for (const grp of g.data) {
      await step(`${bundle} group "${grp.attributes.referenceName}" submission`, async () => {
        const r = await api('/v1/subscriptionGroupSubmissions', { method: 'POST', body: { data: { type: 'subscriptionGroupSubmissions', relationships: { subscriptionGroup: { data: { type: 'subscriptionGroups', id: grp.id } } } } } });
        return `added (${r?.data?.id || 'ok'})`;
      });
    }
    const subs = (await api(`/v1/reviewSubmissions?filter[app]=${app.id}&limit=5`)).data;
    for (const s of subs) {
      await step(`  draft ${s.id} ${s.attributes.state}`, async () => {
        const items = await api(`/v1/reviewSubmissions/${s.id}/items?limit=20`);
        return items.data.map((i) => `${Object.keys(i.relationships || {}).filter((k) => i.relationships[k]?.data).join('/')}:${i.attributes.state}`).join(', ') || 'no items';
      });
    }
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
