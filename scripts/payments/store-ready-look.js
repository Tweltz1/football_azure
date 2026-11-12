// Read-only: store readiness of EVERY app in App Store Connect (listing text, screenshots, age rating,
// privacy URL, builds, review state, in-app purchases and subscriptions). Changes nothing.
// Env: KEY_ID, ISSUER_ID, KEY_P8. Prints settings names and yes/no answers only.
const { api, step } = require('../curbsy-store/asc');

(async () => {
  const apps = (await api('/v1/apps?limit=50')).data;
  console.log(`${apps.length} apps in App Store Connect`);
  for (const app of apps) {
    console.log(`\n== ${app.attributes.name} (${app.attributes.bundleId}) contentRights=${app.attributes.contentRightsDeclaration || 'NOT SET'}`);
    const versions = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data;
    console.log(`versions: ${versions.map((x) => `${x.attributes.versionString} ${x.attributes.appStoreState}`).join('; ') || 'NONE'}`);
    const v = versions[0];
    if (v) {
      await step('attached build', async () => {
        const b = await api(`/v1/appStoreVersions/${v.id}/build`).catch(() => null);
        return b?.data ? `${b.data.attributes.version} ${b.data.attributes.processingState}` : 'NONE';
      });
      await step('version text + screenshots', async () => {
        const loc = await api(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
        const out = [];
        for (const l of loc.data) {
          const a = l.attributes;
          out.push(`${a.locale}: description ${(a.description || '').length} chars, promo ${a.promotionalText ? 'yes' : 'no'}, keywords ${(a.keywords || '').length} chars, support ${a.supportUrl || 'NO'}, marketing ${a.marketingUrl || '-'}, whatsNew ${a.whatsNew ? 'yes' : 'no'}`);
          const sets = await api(`/v1/appStoreVersionLocalizations/${l.id}/appScreenshotSets`);
          out.push(`  shots: ${sets.data.map((s) => `${s.attributes.screenshotDisplayType}=${(s.relationships?.appScreenshots?.data || []).length}`).join(', ') || 'NONE'}`);
          const prev = await api(`/v1/appStoreVersionLocalizations/${l.id}/appPreviewSets`).catch(() => ({ data: [] }));
          out.push(`  previews: ${prev.data.length}`);
        }
        return '\n     ' + out.join('\n     ');
      });
      await step('review details', async () => {
        const r = await api(`/v1/appStoreVersions/${v.id}/appStoreReviewDetail`).catch(() => null);
        const a = r?.data?.attributes;
        if (!a) return 'NONE';
        return `contact ${a.contactEmail ? 'yes' : 'NO'}, demo account ${a.demoAccountRequired ? (a.demoAccountName ? 'yes' : 'REQUIRED BUT EMPTY') : 'not required'}, notes ${(a.notes || '').length} chars`;
      });
    }
    await step('app info', async () => {
      const i = await api(`/v1/apps/${app.id}/appInfos?include=primaryCategory`);
      const out = [];
      for (const x of i.data) {
        out.push(`${x.attributes.appStoreState || x.attributes.state} age=${x.attributes.appStoreAgeRating || '?'} category=${x.relationships?.primaryCategory?.data?.id || 'NONE'}`);
        const age = await api(`/v1/appInfos/${x.id}/ageRatingDeclaration`).catch((e) => ({ err: e.message.slice(0, 100) }));
        if (age.err) out.push(`  age rating: ${age.err}`);
        else { const a = age.data?.attributes || {}; const nulls = Object.entries(a).filter(([, val]) => val === null).map(([k]) => k); out.push(`  age rating unanswered: ${nulls.join(',') || 'none'}`); }
        const loc = await api(`/v1/appInfos/${x.id}/appInfoLocalizations`);
        for (const l of loc.data) out.push(`  ${l.attributes.locale}: name "${l.attributes.name}" subtitle "${l.attributes.subtitle || ''}" privacy ${l.attributes.privacyPolicyUrl || 'MISSING'}`);
      }
      return '\n     ' + out.join('\n     ');
    });
    await step('builds', async () => {
      const b = await api(`/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=3&include=preReleaseVersion`);
      const pre = Object.fromEntries((b.included || []).map((x) => [x.id, x.attributes.version]));
      return b.data.map((x) => `${pre[x.relationships?.preReleaseVersion?.data?.id] || '?'}(${x.attributes.version}) ${x.attributes.processingState} exp=${x.attributes.expired} ${x.attributes.uploadedDate?.slice(0, 10)}`).join('; ') || 'NONE';
    });
    await step('review submissions', async () => {
      const r = await api(`/v1/reviewSubmissions?filter[app]=${app.id}&limit=5`);
      return r.data.map((x) => `${x.attributes.state} ${x.attributes.submittedDate?.slice(0, 16) || ''}`).join('; ') || 'none';
    });
    await step('in-app purchases', async () => {
      const r = await api(`/v1/apps/${app.id}/inAppPurchasesV2?limit=20`).catch(() => ({ data: [] }));
      return r.data.map((x) => `${x.attributes.productId} ${x.attributes.state}`).join('; ') || 'none';
    });
    await step('subscriptions', async () => {
      const g = await api(`/v1/apps/${app.id}/subscriptionGroups?limit=10`).catch(() => ({ data: [] }));
      const out = [];
      for (const grp of g.data) {
        const subs = await api(`/v1/subscriptionGroups/${grp.id}/subscriptions?limit=10`);
        out.push(`"${grp.attributes.referenceName}": ${subs.data.map((s) => `${s.attributes.productId} ${s.attributes.state}`).join(', ')}`);
      }
      return out.join('; ') || 'none';
    });
  }
  console.log('\nDone.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
