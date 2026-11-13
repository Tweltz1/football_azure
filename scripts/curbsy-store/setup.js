// Fills in Curbsy's App Store Connect setup: Curbsy Plus and the tips, the store page text, age rating,
// review notes, and the build. Safe to run again: each step skips what already exists.
const { api, step } = require('./asc');

const BUNDLE = 'com.hoodleague.junk';
const SITE = 'https://hood-league.com';
const BUILD = process.env.BUILD || '69';

const PLUS = { ref: 'Curbsy Plus Monthly', id: 'com.hoodleague.junk.plus.monthly', price: '4.99', name: 'Curbsy Plus', about: 'Instant alerts, first look, 100-mile search' };
const TIPS = [
  { ref: 'Tip small', id: 'com.hoodleague.junk.tip.small', price: '0.99', name: 'Small tip', about: 'A thank-you that keeps Curbsy free' },
  { ref: 'Tip medium', id: 'com.hoodleague.junk.tip.medium', price: '2.99', name: 'Medium tip', about: 'A thank-you that keeps Curbsy free' },
  { ref: 'Tip large', id: 'com.hoodleague.junk.tip.large', price: '4.99', name: 'Large tip', about: 'A thank-you that keeps Curbsy free' },
];

const DESCRIPTION = `Curbsy is the easy way to give away stuff you don't need and find free stuff near you.

GIVE IT AWAY IN SECONDS
Snap a photo and Curbsy names the item for you, right on your phone. Got a whole pile? One photo can become several items that neighbors claim one by one. Preview your post before it goes live.

FIND FREE STUFF NEARBY
Browse what's up for grabs around you, search for what you need, and sort by closest or newest. Save a search to see new matches.

"I'M ON MY WAY"
Tap once to hold an item while you drive over. The poster sees you're coming and about how long you'll be. If you turn around, it goes back up for the next person.

PRIVATE BY DESIGN
Your address is never shown. Neighbors only see how far away an item is. The exact spot is shared only with someone on the way or someone you've written back to. Porch pickup means nobody has to meet.

SAFER FOR EVERYONE
Listings and photos are checked for things that aren't allowed. Report or block anyone in a tap, and a person reviews reports within 24 hours.

CURBSY PLUS (OPTIONAL)
Everything above is free. Curbsy Plus adds instant alerts the moment a match is posted, up to 10 saved searches, a 30-minute early look at new listings, search up to 100 miles, and no sponsor cards. $4.99 a month, charged to your Apple ID. It renews each month unless you cancel at least 24 hours before the period ends, in Settings > your name > Subscriptions.

Terms of Use: ${SITE}/junk-terms.html
Privacy Policy: ${SITE}/junk-privacy.html`;

const NOTES = `Curbsy is a free-stuff marketplace. Browsing works without an account. To post or message, use Sign in with Apple or Google (no demo account needed).

Listings show near the device's location, so the feed may be empty where you are: tap + to post a test item and it appears in Browse and in Me.

"I'm on my way" (on another person's listing) uses location in the background only during that trip, to check the person is heading to the item. iOS shows the blue location indicator, and tracking stops when the trip ends, is cancelled, or the item is picked up. The poster sees only distance, never location.

User content safety (1.2): Terms must be accepted before posting or messaging; listings and chats are filtered for banned items and words; photos are checked on the device; every listing and chat has Report and Block; reports are reviewed within 24 hours and repeat offenders are banned. Contact: Me > Contact Curbsy.

Curbsy Plus ($4.99/month) is in Me > Curbsy Plus card. Tips are in Me > Support Curbsy with a tip. Restore purchases is in Me. Account deletion is in Me > Delete my account.`;

const one = (type, id) => ({ data: { type, id } });

async function territories() {
  const out = [];
  let next = '/v1/territories?limit=200';
  while (next) { const r = await api(next); out.push(...r.data.map((t) => t.id)); next = r.links?.next || null; }
  return out;
}

async function setUpPlus(app, lands) {
  let groups = await api(`/v1/apps/${app.id}/subscriptionGroups?include=subscriptions&limit=50`);
  let group = groups.data.find((g) => g.attributes.referenceName === 'Curbsy Plus');
  await step('Plus group', async () => {
    if (group) return 'already there';
    group = (await api('/v1/subscriptionGroups', { method: 'POST', body: { data: { type: 'subscriptionGroups', attributes: { referenceName: 'Curbsy Plus' }, relationships: { app: one('apps', app.id) } } } })).data;
    return 'created';
  });
  if (!group) return;
  await step('Plus group name', async () => {
    const loc = await api(`/v1/subscriptionGroups/${group.id}/subscriptionGroupLocalizations`);
    if (loc.data.some((l) => l.attributes.locale === 'en-US')) return 'already there';
    await api('/v1/subscriptionGroupLocalizations', { method: 'POST', body: { data: { type: 'subscriptionGroupLocalizations', attributes: { name: 'Curbsy Plus', locale: 'en-US' }, relationships: { subscriptionGroup: one('subscriptionGroups', group.id) } } } });
    return 'created';
  });
  let sub = (await api(`/v1/subscriptionGroups/${group.id}/subscriptions?limit=50`)).data.find((s) => s.attributes.productId === PLUS.id);
  await step('Plus subscription', async () => {
    if (sub) return `already there (${sub.attributes.state})`;
    sub = (await api('/v1/subscriptions', { method: 'POST', body: { data: { type: 'subscriptions', attributes: { name: PLUS.ref, productId: PLUS.id, subscriptionPeriod: 'ONE_MONTH', familySharable: false, groupLevel: 1 }, relationships: { group: one('subscriptionGroups', group.id) } } } })).data;
    return 'created';
  });
  if (!sub) return;
  await step('Plus name and description', async () => {
    const loc = await api(`/v1/subscriptions/${sub.id}/subscriptionLocalizations`);
    if (loc.data.some((l) => l.attributes.locale === 'en-US')) return 'already there';
    await api('/v1/subscriptionLocalizations', { method: 'POST', body: { data: { type: 'subscriptionLocalizations', attributes: { name: PLUS.name, description: PLUS.about, locale: 'en-US' }, relationships: { subscription: one('subscriptions', sub.id) } } } });
    return 'created';
  });
  await step('Plus countries', async () => {
    const has = await api(`/v1/subscriptions/${sub.id}/subscriptionAvailability`).catch(() => null);
    if (has && has.data) return 'already there';
    await api('/v1/subscriptionAvailabilities', { method: 'POST', body: { data: { type: 'subscriptionAvailabilities', attributes: { availableInNewTerritories: true }, relationships: { subscription: one('subscriptions', sub.id), availableTerritories: { data: lands.map((id) => ({ type: 'territories', id })) } } } } });
    return `${lands.length} countries`;
  });
  await step('Plus prices', async () => {
    const have = new Set();
    let next = `/v1/subscriptions/${sub.id}/prices?include=territory&limit=200`;
    while (next) { const r = await api(next); for (const p of r.data) have.add(p.relationships?.territory?.data?.id); next = r.links?.next || null; }
    const us = (await api(`/v1/subscriptions/${sub.id}/pricePoints?filter[territory]=USA&limit=200`)).data.find((p) => p.attributes.customerPrice === PLUS.price);
    if (!us) throw new Error(`no ${PLUS.price} price point`);
    const points = [{ land: 'USA', id: us.id }];
    next = `/v1/subscriptionPricePoints/${us.id}/equalizations?include=territory&limit=200`;
    while (next) { const r = await api(next); for (const p of r.data) points.push({ land: p.relationships?.territory?.data?.id, id: p.id }); next = r.links?.next || null; }
    let made = 0, failed = 0, firstError = '';
    for (const p of points) {
      if (!p.land || have.has(p.land)) continue;
      try {
        await api('/v1/subscriptionPrices', { method: 'POST', body: { data: { type: 'subscriptionPrices', attributes: { preserveCurrentPrice: false }, relationships: { subscription: one('subscriptions', sub.id), subscriptionPricePoint: one('subscriptionPricePoints', p.id) } } } });
        made += 1;
      } catch (error) { failed += 1; firstError = firstError || error.message; }
    }
    if (failed) throw new Error(`${made} set, ${failed} failed: ${firstError}`);
    return `${made} set, ${have.size} already there`;
  });
}

async function setUpTip(app, lands, tip, existing) {
  let iap = existing.find((p) => p.attributes.productId === tip.id);
  await step(`${tip.ref}`, async () => {
    if (iap) return `already there (${iap.attributes.state})`;
    iap = (await api('/v2/inAppPurchases', { method: 'POST', body: { data: { type: 'inAppPurchases', attributes: { name: tip.ref, productId: tip.id, inAppPurchaseType: 'CONSUMABLE' }, relationships: { app: one('apps', app.id) } } } })).data;
    return 'created';
  });
  if (!iap) return;
  await step(`${tip.ref} name`, async () => {
    const loc = await api(`/v2/inAppPurchases/${iap.id}/inAppPurchaseLocalizations`);
    if (loc.data.some((l) => l.attributes.locale === 'en-US')) return 'already there';
    await api('/v1/inAppPurchaseLocalizations', { method: 'POST', body: { data: { type: 'inAppPurchaseLocalizations', attributes: { name: tip.name, description: tip.about, locale: 'en-US' }, relationships: { inAppPurchaseV2: one('inAppPurchases', iap.id) } } } });
    return 'created';
  });
  await step(`${tip.ref} countries`, async () => {
    const has = await api(`/v2/inAppPurchases/${iap.id}/inAppPurchaseAvailability`).catch(() => null);
    if (has && has.data) return 'already there';
    await api('/v1/inAppPurchaseAvailabilities', { method: 'POST', body: { data: { type: 'inAppPurchaseAvailabilities', attributes: { availableInNewTerritories: true }, relationships: { inAppPurchase: one('inAppPurchases', iap.id), availableTerritories: { data: lands.map((id) => ({ type: 'territories', id })) } } } } });
    return `${lands.length} countries`;
  });
  await step(`${tip.ref} price`, async () => {
    const has = await api(`/v2/inAppPurchases/${iap.id}/iapPriceSchedule?include=manualPrices`).catch(() => null);
    if (has && (has.included || []).length) return 'already there';
    const us = (await api(`/v2/inAppPurchases/${iap.id}/pricePoints?filter[territory]=USA&limit=200`)).data.find((p) => p.attributes.customerPrice === tip.price);
    if (!us) throw new Error(`no ${tip.price} price point`);
    await api('/v1/inAppPurchasePriceSchedules', { method: 'POST', body: {
      data: { type: 'inAppPurchasePriceSchedules', relationships: { inAppPurchase: one('inAppPurchases', iap.id), baseTerritory: one('territories', 'USA'), manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${p1}' }] } } },
      included: [{ type: 'inAppPurchasePrices', id: '${p1}', attributes: { startDate: null }, relationships: { inAppPurchaseV2: one('inAppPurchases', iap.id), inAppPurchasePricePoint: one('inAppPurchasePricePoints', us.id) } }],
    } });
    return `$${tip.price}`;
  });
}

async function setUpPage(app) {
  const versions = await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`);
  const version = versions.data.find((v) => v.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION');
  if (!version) { console.log('SKIP store page: no version being prepared'); return; }
  await step('Description, keywords, support link', async () => {
    const loc = (await api(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data.find((l) => l.attributes.locale === 'en-US');
    await api(`/v1/appStoreVersionLocalizations/${loc.id}`, { method: 'PATCH', body: { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: {
      description: DESCRIPTION,
      keywords: 'free stuff,curb alert,giveaway,freebies,free furniture,junk,declutter,donate,reuse,curbside,yard',
      promotionalText: 'Give away what you don\'t need and grab free stuff nearby. Snap a photo, post in seconds, and pick up from the curb.',
      supportUrl: `${SITE}/junk-support.html`,
      marketingUrl: `${SITE}/junk-support.html`,
    } } } });
  });
  const infos = await api(`/v1/apps/${app.id}/appInfos?limit=5`);
  const info = infos.data[0];
  await step('Subtitle and privacy link', async () => {
    const loc = (await api(`/v1/appInfos/${info.id}/appInfoLocalizations`)).data.find((l) => l.attributes.locale === 'en-US');
    await api(`/v1/appInfoLocalizations/${loc.id}`, { method: 'PATCH', body: { data: { type: 'appInfoLocalizations', id: loc.id, attributes: { subtitle: 'Free stuff near you', privacyPolicyUrl: `${SITE}/junk-privacy.html` } } } });
  });
  await step('Categories (Shopping, Lifestyle)', async () => {
    await api(`/v1/appInfos/${info.id}`, { method: 'PATCH', body: { data: { type: 'appInfos', id: info.id, relationships: { primaryCategory: one('appCategories', 'SHOPPING'), secondaryCategory: one('appCategories', 'LIFESTYLE') } } } });
  });
  await step('Age rating answers', async () => {
    const none = Object.fromEntries(['alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'gunsOrOtherWeapons', 'horrorOrFearThemes', 'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation', 'profanityOrCrudeHumor', 'sexualContentGraphicAndNudity', 'sexualContentOrNudity', 'violenceCartoonOrFantasy', 'violenceRealistic', 'violenceRealisticProlongedGraphicOrSadistic'].map((k) => [k, 'NONE']));
    await api(`/v1/ageRatingDeclarations/${info.id}`, { method: 'PATCH', body: { data: { type: 'ageRatingDeclarations', id: info.id, attributes: {
      ...none, messagingAndChat: true, userGeneratedContent: true, advertising: true,
      gambling: false, lootBox: false, unrestrictedWebAccess: false, parentalControls: false, ageAssurance: false, healthOrWellnessTopics: false, socialMedia: false,
    } } } });
    const after = await api(`/v1/apps/${app.id}/appInfos?limit=5`);
    return `rating ${after.data[0].attributes.appStoreAgeRating}`;
  });
  await step(`Build ${BUILD} on the version`, async () => {
    const b = await api(`/v1/builds?filter[app]=${app.id}&filter[version]=${BUILD}&limit=1`);
    if (!b.data[0]) throw new Error('build not found');
    await api(`/v1/appStoreVersions/${version.id}/relationships/build`, { method: 'PATCH', body: one('builds', b.data[0].id) });
  });
  await step('Review notes', async () => {
    const d = await api(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`).catch(() => null);
    const attributes = { notes: NOTES, demoAccountRequired: false };
    if (d && d.data) await api(`/v1/appStoreReviewDetails/${d.data.id}`, { method: 'PATCH', body: { data: { type: 'appStoreReviewDetails', id: d.data.id, attributes } } });
    else await api('/v1/appStoreReviewDetails', { method: 'POST', body: { data: { type: 'appStoreReviewDetails', attributes, relationships: { appStoreVersion: one('appStoreVersions', version.id) } } } });
  });
}

(async () => {
  const app = (await api(`/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
  if (!app) throw new Error('App not found');
  const lands = await territories();
  await setUpPage(app);
  const existing = (await api(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`)).data;
  for (const tip of TIPS) await setUpTip(app, lands, tip, existing);
  await setUpPlus(app, lands);
  console.log('Done.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
