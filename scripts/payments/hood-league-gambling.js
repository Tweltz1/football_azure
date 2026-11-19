// Hood League FF was turned away because its age rating said "simulated gambling" (individual developers can't
// ship that). The app has no gambling: the auction draft uses pretend budgets and nothing is wagered.
// Sets gamblingSimulated to NONE (and real gambling off), then resubmits the 1.0 version for review.
const { api, step } = require('../curbsy-store/asc');
const one = (type, id) => ({ data: { type, id } });

(async () => {
  const app = (await api('/v1/apps?filter[bundleId]=com.hoodleague.draft')).data[0];
  console.log(`== ${app.attributes.name}`);
  const infos = (await api(`/v1/apps/${app.id}/appInfos`)).data;
  for (const info of infos) {
    const decl = (await api(`/v1/appInfos/${info.id}/ageRatingDeclaration`)).data;
    const a = decl.attributes;
    console.log(`appInfo ${info.attributes.appStoreState || info.attributes.state}: gamblingSimulated=${a.gamblingSimulated} gambling=${a.gambling} contests=${a.contests} lootBox=${a.lootBox}`);
    if (a.gamblingSimulated === 'NONE' && !a.gambling) continue;
    await step('set no simulated gambling', async () => {
      const attributes = { gamblingSimulated: 'NONE' };
      if ('gambling' in a) attributes.gambling = false;
      await api(`/v1/ageRatingDeclarations/${decl.id}`, { method: 'PATCH', body: { data: { type: 'ageRatingDeclarations', id: decl.id, attributes } } });
      const after = (await api(`/v1/appInfos/${info.id}/ageRatingDeclaration`)).data.attributes;
      return `gamblingSimulated=${after.gamblingSimulated} gambling=${after.gambling}`;
    });
  }

  const versions = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data;
  const v = versions.find((x) => x.attributes.versionString.startsWith('1.0'));
  console.log(`version ${v.attributes.versionString}: ${v.attributes.appStoreState}`);

  await step('resubmit for review', async () => {
    const subs = (await api(`/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=UNRESOLVED_ISSUES,READY_FOR_REVIEW&limit=5`)).data;
    console.log(`open submissions: ${subs.map((s) => s.attributes.state).join(',') || 'none'}`);
    let sub = subs[0];
    if (!sub) sub = (await api('/v1/reviewSubmissions', { method: 'POST', body: { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: one('apps', app.id) } } } })).data;
    const items = (await api(`/v1/reviewSubmissions/${sub.id}/items`)).data;
    console.log(`items: ${items.map((i) => i.attributes.state).join(',') || 'none'}`);
    if (!items.length) {
      await api('/v1/reviewSubmissionItems', { method: 'POST', body: { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: one('reviewSubmissions', sub.id), appStoreVersion: one('appStoreVersions', v.id) } } } });
    }
    await api(`/v1/reviewSubmissions/${sub.id}`, { method: 'PATCH', body: { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } } });
    return (await api(`/v1/reviewSubmissions/${sub.id}`)).data.attributes.state;
  });
  console.log('\nDone.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
