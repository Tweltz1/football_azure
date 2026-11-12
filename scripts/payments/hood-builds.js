// Attaches the newest processed TestFlight build to the 1.0 version being prepared for Hood League, Hood
// Games and Hood Protocol (the builds with Sign in with Apple and Delete account), answering the export
// compliance question (standard HTTPS only) when it is blank. Submits nothing. Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');

const APPS = ['com.hoodleague.draft', 'com.hoodleague.games', 'com.tweltz1.hoodprotocol'];

(async () => {
  for (const bundle of APPS) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    console.log(`\n== ${app.attributes.name} (Apple ID ${app.id})`);
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION');
    if (!v) { console.log('no version being prepared'); continue; }
    await step('attach newest build', async () => {
      const b = (await api(`/v1/builds?filter[app]=${app.id}&filter[processingState]=VALID&filter[expired]=false&sort=-uploadedDate&limit=1`)).data[0];
      if (!b) return 'no processed build yet';
      if (b.attributes.usesNonExemptEncryption === null) {
        await api(`/v1/builds/${b.id}`, { method: 'PATCH', body: { data: { type: 'builds', id: b.id, attributes: { usesNonExemptEncryption: false } } } });
      }
      const cur = await api(`/v1/appStoreVersions/${v.id}/build`).catch(() => null);
      if (cur?.data?.id === b.id) return `build ${b.attributes.version} already attached`;
      await api(`/v1/appStoreVersions/${v.id}/relationships/build`, { method: 'PATCH', body: { data: { type: 'builds', id: b.id } } });
      return `build ${b.attributes.version} (uploaded ${b.attributes.uploadedDate.slice(0, 16)})`;
    });
  }
  console.log('\nDone.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
