// Attaches each app's newest processed (VALID) build to its 1.0 version, if that version isn't in review.
// Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');
(async () => {
  for (const bundle of ['com.hoodleague.junk', 'com.tweltz1.totetrack']) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.versionString.startsWith('1.0'));
    await step(`${app.attributes.name} ${v.attributes.appStoreState}: newest build`, async () => {
      if (['WAITING_FOR_REVIEW', 'IN_REVIEW', 'READY_FOR_SALE'].includes(v.attributes.appStoreState)) return 'left alone (in review or live)';
      let b;
      for (let i = 0; i < 40; i++) {
        b = (await api(`/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=1`)).data[0];
        if (b.attributes.processingState !== 'PROCESSING') break;
        await new Promise((r) => setTimeout(r, 30000));
      }
      if (b.attributes.processingState !== 'VALID') return `FAIL newest build ${b.attributes.version} is ${b.attributes.processingState}`;
      const cur = (await api(`/v1/appStoreVersions/${v.id}/build`)).data;
      if (cur?.id === b.id) return `already build ${b.attributes.version}`;
      if (b.attributes.usesNonExemptEncryption == null) {
        await api(`/v1/builds/${b.id}`, { method: 'PATCH', body: { data: { type: 'builds', id: b.id, attributes: { usesNonExemptEncryption: false } } } }).catch(() => {});
      }
      await api(`/v1/appStoreVersions/${v.id}/relationships/build`, { method: 'PATCH', body: { data: { type: 'builds', id: b.id } } });
      return `build ${cur?.attributes?.version} -> ${b.attributes.version}`;
    });
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
