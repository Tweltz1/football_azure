// Read-only: the state of each subscription group's display name (localization) for ToteTrack and Curbsy.
const { api, step } = require('../curbsy-store/asc');
(async () => {
  for (const bundle of ['com.tweltz1.totetrack', 'com.hoodleague.junk']) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    const g = await api(`/v1/apps/${app.id}/subscriptionGroups?limit=10`);
    for (const grp of g.data) {
      await step(`${bundle} group "${grp.attributes.referenceName}"`, async () => {
        const loc = await api(`/v1/subscriptionGroups/${grp.id}/subscriptionGroupLocalizations`);
        return loc.data.map((l) => `${l.attributes.locale} name="${l.attributes.name}" appName=${l.attributes.customAppName || '-'} state=${l.attributes.state}`).join('; ') || 'NO localizations';
      });
      const subs = await api(`/v1/subscriptionGroups/${grp.id}/subscriptions?limit=10`);
      for (const s of subs.data) {
        await step(`  ${s.attributes.productId}`, async () => {
          const loc = await api(`/v1/subscriptions/${s.id}/subscriptionLocalizations`);
          return `state=${s.attributes.state} locs=${loc.data.map((l) => `${l.attributes.locale}:${l.attributes.state}`).join(',')}`;
        });
      }
    }
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
