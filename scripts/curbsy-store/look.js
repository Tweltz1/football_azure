// Read-only: prints what is already set up for Curbsy in App Store Connect. Changes nothing.
const { api, step } = require('./asc');

const BUNDLE = 'com.hoodleague.junk';

(async () => {
  const apps = await api(`/v1/apps?filter[bundleId]=${BUNDLE}`);
  const app = apps.data[0];
  if (!app) throw new Error('App not found');
  console.log('App', app.id, app.attributes.name, app.attributes.primaryLocale);

  await step('versions', async () => {
    const v = await api(`/v1/apps/${app.id}/appStoreVersions?limit=5&include=build`);
    for (const x of v.data) console.log('  version', x.id, x.attributes.versionString, x.attributes.appStoreState, x.attributes.appVersionState, 'build:', x.relationships?.build?.data?.id || 'none');
    for (const x of v.data) {
      const loc = await api(`/v1/appStoreVersions/${x.id}/appStoreVersionLocalizations`);
      for (const l of loc.data) console.log('  loc', l.id, l.attributes.locale, 'desc chars:', (l.attributes.description || '').length, 'has terms:', /junk-terms/.test(l.attributes.description || ''), 'support:', l.attributes.supportUrl, 'keywords:', !!l.attributes.keywords);
      for (const l of loc.data) {
        const sets = await api(`/v1/appStoreVersionLocalizations/${l.id}/appScreenshotSets?include=appScreenshots`);
        for (const s of sets.data) console.log('  screenshots', s.attributes.screenshotDisplayType, (s.relationships?.appScreenshots?.data || []).length);
      }
      await step('  review detail', async () => {
        const d = await api(`/v1/appStoreVersions/${x.id}/appStoreReviewDetail`);
        const a = d.data?.attributes || {};
        return `contact ${a.contactFirstName ? 'set' : 'missing'}, phone ${a.contactPhone ? 'set' : 'missing'}, email ${a.contactEmail ? 'set' : 'missing'}, demo required ${a.demoAccountRequired}, notes chars ${(a.notes || '').length}`;
      });
    }
  });
  await step('builds', async () => {
    const b = await api(`/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=4`);
    return b.data.map((x) => `${x.attributes.version}:${x.attributes.processingState}:${x.id}`).join(' ');
  });
  await step('app info', async () => {
    const i = await api(`/v1/apps/${app.id}/appInfos?include=ageRatingDeclaration,primaryCategory`);
    for (const x of i.data) console.log('  info', x.id, x.attributes.appStoreState || x.attributes.state, x.attributes.appStoreAgeRating, 'category:', x.relationships?.primaryCategory?.data?.id);
    for (const x of i.included || []) if (x.type === 'ageRatingDeclarations') console.log('  age', x.id, JSON.stringify(x.attributes));
    for (const x of i.data) {
      const loc = await api(`/v1/appInfos/${x.id}/appInfoLocalizations`);
      for (const l of loc.data) console.log('  infoloc', l.attributes.locale, l.attributes.name, '|', l.attributes.subtitle, '| privacy:', l.attributes.privacyPolicyUrl);
    }
  });
  await step('subscription groups', async () => {
    const g = await api(`/v1/apps/${app.id}/subscriptionGroups?include=subscriptions`);
    for (const x of g.data) console.log('  group', x.id, x.attributes.referenceName);
    for (const x of g.included || []) console.log('  sub', x.id, x.attributes.productId, x.attributes.state, x.attributes.subscriptionPeriod);
    return `${g.data.length} groups`;
  });
  await step('in-app purchases', async () => {
    const p = await api(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`);
    for (const x of p.data) console.log('  iap', x.id, x.attributes.productId, x.attributes.inAppPurchaseType, x.attributes.state);
    return `${p.data.length} products`;
  });
  await step('app price', async () => {
    const s = await api(`/v1/apps/${app.id}/appPriceSchedule?include=baseTerritory`).catch((e) => ({ err: e.message }));
    return s.err ? `none (${s.err.slice(0, 160)})` : `base ${s.data?.relationships?.baseTerritory?.data?.id}`;
  });
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
