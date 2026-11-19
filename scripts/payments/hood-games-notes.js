// Hood Games got "Guideline 2.1 Information Needed": Apple wants purpose, test steps, external services,
// regions and a screen recording in the App Review notes. Writes hood-games-review-notes.txt into the notes.
// With RESUBMIT=1 in resubmit.txt, it also resends the version (cancel the rejected submission, submit fresh).
const fs = require('fs');
const path = require('path');
const { api, step } = require('../curbsy-store/asc');
const one = (type, id) => ({ data: { type, id } });
const NOTES = fs.readFileSync(path.join(__dirname, 'hood-games-review-notes.txt'), 'utf8').trim();
const RESUBMIT = fs.existsSync(path.join(__dirname, 'hood-games-resubmit.txt'));

(async () => {
  const app = (await api('/v1/apps?filter[bundleId]=com.hoodleague.games')).data[0];
  const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.versionString.startsWith('1.0'));
  console.log(`== ${app.attributes.name} ${v.attributes.versionString}: ${v.attributes.appStoreState}`);
  const detail = (await api(`/v1/appStoreVersions/${v.id}/appStoreReviewDetail`)).data;
  await step(`write review notes (${NOTES.length} chars)`, async () => {
    await api(`/v1/appStoreReviewDetails/${detail.id}`, { method: 'PATCH', body: { data: { type: 'appStoreReviewDetails', id: detail.id, attributes: { notes: NOTES } } } });
  });
  const att = await api(`/v1/appStoreReviewDetails/${detail.id}/appStoreReviewAttachments`).catch(() => ({ data: [] }));
  console.log(`review attachments: ${att.data.map((a) => `${a.attributes.fileName} (${a.attributes.assetDeliveryState?.state})`).join(', ') || 'none'}`);
  if (!RESUBMIT) { console.log('Not resubmitting yet (waiting on the screen recording).'); return; }
  if (!att.data.length) { console.log('No recording attached yet; not resubmitting.'); return; }

  const open = (await api(`/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=UNRESOLVED_ISSUES,READY_FOR_REVIEW&limit=5`)).data[0];
  if (open) {
    await step('cancel the rejected submission', async () => {
      await api(`/v1/reviewSubmissions/${open.id}`, { method: 'PATCH', body: { data: { type: 'reviewSubmissions', id: open.id, attributes: { canceled: true } } } });
      for (let i = 0; i < 20; i++) {
        const st = (await api(`/v1/reviewSubmissions/${open.id}`)).data.attributes.state;
        if (!['CANCELING', 'UNRESOLVED_ISSUES'].includes(st)) return st;
        await new Promise((r) => setTimeout(r, 6000));
      }
      return 'still canceling';
    });
  }
  await step('submit in a fresh submission', async () => {
    const sub = (await api('/v1/reviewSubmissions', { method: 'POST', body: { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: one('apps', app.id) } } } })).data;
    await api('/v1/reviewSubmissionItems', { method: 'POST', body: { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: one('reviewSubmissions', sub.id), appStoreVersion: one('appStoreVersions', v.id) } } } });
    await api(`/v1/reviewSubmissions/${sub.id}`, { method: 'PATCH', body: { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } } });
    return (await api(`/v1/reviewSubmissions/${sub.id}`)).data.attributes.state;
  });
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
