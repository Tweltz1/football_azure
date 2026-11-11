// Read-only: checks everything Apple needs before Curbsy and ToteTrack 1.0 can go to App Review.
// Changes nothing. Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');

const APPS = ['com.hoodleague.junk', 'com.tweltz1.totetrack'];
const OPEN = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'WAITING_FOR_REVIEW', 'IN_REVIEW'];

(async () => {
  for (const bundle of APPS) {
    const app = (await api(`/v1/apps?filter[bundleId]=${bundle}`)).data[0];
    if (!app) { console.log(`\n${bundle}: app not found`); continue; }
    console.log(`\n== ${app.attributes.name} (${bundle}) contentRights=${app.attributes.contentRightsDeclaration || 'NOT SET'}`);
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => OPEN.includes(x.attributes.appStoreState));
    if (!v) { console.log('no open version'); continue; }
    console.log(`version ${v.attributes.versionString} ${v.attributes.appStoreState} copyright=${v.attributes.copyright ? 'set' : 'MISSING'} release=${v.attributes.releaseType}`);
    await step('attached build', async () => {
      const b = await api(`/v1/appStoreVersions/${v.id}/build`).catch(() => null);
      if (!b?.data) return 'NONE';
      const a = b.data.attributes;
      return `${a.version} ${a.processingState} expired=${a.expired} nonExemptEncryption=${a.usesNonExemptEncryption}`;
    });
    await step('recent builds', async () => {
      const b = await api(`/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=5&include=preReleaseVersion`);
      const pre = Object.fromEntries((b.included || []).map((x) => [x.id, x.attributes.version]));
      return b.data.map((x) => `${pre[x.relationships?.preReleaseVersion?.data?.id] || '?'}(${x.attributes.version}) ${x.attributes.processingState} exp=${x.attributes.expired} enc=${x.attributes.usesNonExemptEncryption} ${x.attributes.uploadedDate?.slice(0, 10)}`).join('; ');
    });
    await step('version text + screenshots', async () => {
      const loc = await api(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
      const out = [];
      for (const l of loc.data) {
        const a = l.attributes;
        out.push(`${a.locale}: description ${(a.description || '').length} chars, keywords ${a.keywords ? 'yes' : 'NO'}, support ${a.supportUrl || 'NO'}, marketing ${a.marketingUrl || '-'}`);
        const sets = await api(`/v1/appStoreVersionLocalizations/${l.id}/appScreenshotSets?include=appScreenshots`);
        const states = {};
        for (const s of sets.included || []) { const st = s.attributes?.assetDeliveryState?.state || '?'; states[st] = (states[st] || 0) + 1; }
        out.push(`  shots: ${sets.data.map((s) => `${s.attributes.screenshotDisplayType}=${(s.relationships?.appScreenshots?.data || []).length}`).join(', ') || 'NONE'} states ${JSON.stringify(states)}`);
      }
      return '\n     ' + out.join('\n     ');
    });
    await step('app info', async () => {
      const i = await api(`/v1/apps/${app.id}/appInfos?include=primaryCategory`);
      const out = [];
      for (const x of i.data) {
        out.push(`${x.attributes.appStoreState || x.attributes.state} age=${x.attributes.appStoreAgeRating || '?'} category=${x.relationships?.primaryCategory?.data?.id || 'NONE'}`);
        const age = await api(`/v1/appInfos/${x.id}/ageRatingDeclaration`).catch((e) => ({ err: e.message.slice(0, 120) }));
        if (age.err) out.push(`  age rating: ${age.err}`);
        else { const a = age.data?.attributes || {}; const nulls = Object.entries(a).filter(([, val]) => val === null).map(([k]) => k); out.push(`  age rating answers: ${Object.keys(a).length - nulls.length} set, unanswered: ${nulls.join(',') || 'none'}`); }
        const loc = await api(`/v1/appInfos/${x.id}/appInfoLocalizations`);
        for (const l of loc.data) out.push(`  ${l.attributes.locale}: name "${l.attributes.name}" subtitle ${l.attributes.subtitle ? 'yes' : 'no'} privacy ${l.attributes.privacyPolicyUrl || 'MISSING'}`);
      }
      return '\n     ' + out.join('\n     ');
    });
    await step('price', async () => {
      const s = await api(`/v1/apps/${app.id}/appPriceSchedule?include=baseTerritory,manualPrices`).catch((e) => ({ err: e.message.slice(0, 160) }));
      return s.err ? `NONE (${s.err})` : `base ${s.data?.relationships?.baseTerritory?.data?.id}, prices ${(s.included || []).filter((x) => x.type === 'appPrices').length}`;
    });
    await step('availability', async () => {
      const s = await api(`/v1/apps/${app.id}/appAvailabilityV2`).catch((e) => ({ err: e.message.slice(0, 160) }));
      return s.err ? `NONE (${s.err})` : `set, new territories ${s.data?.attributes?.availableInNewTerritories}`;
    });
    await step('review submissions', async () => {
      const r = await api(`/v1/reviewSubmissions?filter[app]=${app.id}&limit=5`);
      return r.data.map((x) => `${x.id} ${x.attributes.state}`).join('; ') || 'none';
    });
  }
  console.log('\nDone.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
