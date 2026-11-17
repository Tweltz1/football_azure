// Takes the three Hood apps out of mainland China. New apps sold there must first file China's generative-AI
// and security-assessment forms in App Store Connect (Apple, Nov 2026), and Hood League (Start/Sit chat) and
// Hood Games (Hood Quest narrator) use AI. Every other territory stays on. Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');

const APPS = ['com.hoodleague.draft', 'com.hoodleague.games', 'com.tweltz1.hoodprotocol'];

(async () => {
  for (const bundle of APPS) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    console.log(`\n== ${app.attributes.name}`);
    await step('mainland China off', async () => {
      const av = (await api(`/v1/apps/${app.id}/appAvailabilityV2`)).data;
      let next = `/v2/appAvailabilities/${av.id}/territoryAvailabilities?include=territory&limit=200`;
      while (next) {
        const page = await api(next);
        const chn = page.data.find((t) => t.relationships?.territory?.data?.id === 'CHN');
        if (chn) {
          if (!chn.attributes.available) return 'already off';
          await api(`/v1/territoryAvailabilities/${chn.id}`, { method: 'PATCH', body: { data: { type: 'territoryAvailabilities', id: chn.id, attributes: { available: false } } } });
          return 'turned off';
        }
        next = page.links?.next || null;
      }
      return 'China not in the list';
    });
  }
  console.log('\nDone.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
