// Renames Backseat View to "Stork View" in App Store Connect, trying fallbacks if the name is taken.
const { api } = require('./asc');

const BUNDLE = 'com.tweltz1.backseatview';
const NAMES = ['Stork View', 'Stork View: Baby Monitor', 'Stork View Baby Monitor', 'Stork View - Baby Cam'];

(async () => {
  const app = (await api(`/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
  if (!app) throw new Error('App not found');
  console.log(`App ${app.id}: ${app.attributes.name}`);
  const infos = (await api(`/v1/apps/${app.id}/appInfos?limit=5`)).data;
  for (const i of infos) console.log(`appInfo ${i.id} state=${i.attributes.appStoreState || i.attributes.state}`);
  const info = infos.find((i) => !['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(i.attributes.appStoreState || i.attributes.state)) || infos[0];
  const loc = (await api(`/v1/appInfos/${info.id}/appInfoLocalizations`)).data.find((l) => l.attributes.locale === 'en-US');
  console.log(`Current name: ${loc.attributes.name}`);
  for (const name of NAMES) {
    try {
      await api(`/v1/appInfoLocalizations/${loc.id}`, { method: 'PATCH', body: { data: { type: 'appInfoLocalizations', id: loc.id, attributes: { name } } } });
      console.log(`RESULT OK: renamed to "${name}"`);
      return;
    } catch (e) {
      console.log(`RESULT TAKEN-OR-FAILED "${name}": ${e.message}`);
    }
  }
  process.exitCode = 1;
})().catch((e) => { console.log(`FAIL ${e.message}`); process.exitCode = 1; });
