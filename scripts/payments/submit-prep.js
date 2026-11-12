// Fills in the store settings Curbsy, ToteTrack and the Hood apps 1.0 still lack before App Review: copyright, content
// rights, a free price, and availability in every territory. Only fills what is missing.
// Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');

const APPS = ['com.hoodleague.junk', 'com.tweltz1.totetrack', 'com.hoodleague.draft', 'com.hoodleague.games', 'com.tweltz1.hoodprotocol'];
const COPYRIGHT = `${new Date().getUTCFullYear()} Weltzcraft Studios`;
const one = (type, id) => ({ data: { type, id } });

async function territories() {
  const out = [];
  let next = '/v1/territories?limit=200';
  while (next) { const r = await api(next); out.push(...r.data.map((t) => t.id)); next = r.links?.next || null; }
  return out;
}

(async () => {
  const lands = await territories();
  for (const bundle of APPS) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    if (!app) { console.log(`${bundle}: app not found`); continue; }
    console.log(`\n== ${app.attributes.name}`);
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION');
    await step('copyright', async () => {
      if (!v) return 'no version being prepared';
      if (v.attributes.copyright) return 'already set';
      await api(`/v1/appStoreVersions/${v.id}`, { method: 'PATCH', body: { data: { type: 'appStoreVersions', id: v.id, attributes: { copyright: COPYRIGHT } } } });
      return COPYRIGHT;
    });
    await step('content rights', async () => {
      if (app.attributes.contentRightsDeclaration) return 'already set';
      await api(`/v1/apps/${app.id}`, { method: 'PATCH', body: { data: { type: 'apps', id: app.id, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } } } });
      return 'does not use third-party content';
    });
    await step('price (free)', async () => {
      // A schedule can exist with no price in it, so look for an actual price.
      const has = await api(`/v1/apps/${app.id}/appPriceSchedule?include=manualPrices`).then((r) => (r.included || []).some((x) => x.type === 'appPrices')).catch(() => false);
      if (has) return 'already set';
      let free = null;
      let next = `/v1/apps/${app.id}/appPricePoints?filter[territory]=USA&limit=200`;
      while (next && !free) { const r = await api(next); free = r.data.find((p) => Number(p.attributes.customerPrice) === 0); next = r.links?.next || null; }
      if (!free) throw new Error('no free price point found');
      await api('/v1/appPriceSchedules', { method: 'POST', body: {
        data: { type: 'appPriceSchedules', relationships: { app: one('apps', app.id), baseTerritory: one('territories', 'USA'), manualPrices: { data: [{ type: 'appPrices', id: '${p1}' }] } } },
        included: [{ type: 'appPrices', id: '${p1}', attributes: { startDate: null }, relationships: { appPricePoint: one('appPricePoints', free.id) } }],
      } });
      return 'free';
    });
    await step('availability (all territories)', async () => {
      const has = await api(`/v1/apps/${app.id}/appAvailabilityV2`).then(() => true).catch(() => false);
      if (has) return 'already set';
      const ids = lands.map((t, i) => ({ t, id: `\${t${i}}` }));
      await api('/v2/appAvailabilities', { method: 'POST', body: {
        data: { type: 'appAvailabilities', attributes: { availableInNewTerritories: true }, relationships: { app: one('apps', app.id), territoryAvailabilities: { data: ids.map((x) => ({ type: 'territoryAvailabilities', id: x.id })) } } },
        included: ids.map((x) => ({ type: 'territoryAvailabilities', id: x.id, attributes: { available: true }, relationships: { territory: one('territories', x.t) } })),
      } });
      return `${lands.length} territories`;
    });
  }
  console.log('\nDone.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
