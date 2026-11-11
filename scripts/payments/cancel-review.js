// Pulls Curbsy and ToteTrack out of App Review (keeps the attached builds) so the in-app purchases can be
// added with the version on the website. Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (const bundle of ['com.hoodleague.junk', 'com.tweltz1.totetrack']) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    await step(`${app.attributes.name}: pull out of review`, async () => {
      const subs = (await api(`/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=WAITING_FOR_REVIEW&limit=5`)).data;
      const out = [];
      for (const s of subs) {
        await api(`/v1/reviewSubmissions/${s.id}`, { method: 'PATCH', body: { data: { type: 'reviewSubmissions', id: s.id, attributes: { canceled: true } } } });
        let st = 'CANCELING';
        for (let i = 0; i < 24 && ['WAITING_FOR_REVIEW', 'CANCELING'].includes(st); i++) { await sleep(5000); st = (await api(`/v1/reviewSubmissions/${s.id}`)).data.attributes.state; }
        out.push(st);
      }
      const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.versionString.startsWith('1.0'));
      const b = await api(`/v1/appStoreVersions/${v.id}/build`);
      return `${out.join(',') || 'none'}; version ${v.attributes.appStoreState}, build ${b.data?.attributes?.version}`;
    });
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
