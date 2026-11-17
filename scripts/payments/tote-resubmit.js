// Resubmits ToteTrack's review submission that has "Unresolved Issues" (the 2.1 Information Needed answer
// is in the review notes). Prints each item's state first, and Apple's exact reason if it refuses.
// Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api } = require('../curbsy-store/asc');
(async () => {
  const app = (await api('/v1/apps?filter[bundleId]=com.tweltz1.totetrack')).data[0];
  const s = (await api(`/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=UNRESOLVED_ISSUES,READY_FOR_REVIEW&limit=5`)).data[0];
  if (!s) { console.log('no open submission'); return; }
  console.log('submission', s.id, s.attributes.state);
  for (const it of (await api(`/v1/reviewSubmissions/${s.id}/items?limit=50`)).data) console.log('  item', it.attributes.state, JSON.stringify(it.relationships ? Object.keys(it.relationships).filter((k) => it.relationships[k].data) : []));
  for (const it of (await api(`/v1/reviewSubmissions/${s.id}/items?limit=50`)).data) {
    if (it.attributes.state !== 'REJECTED') continue;
    try {
      await api(`/v1/reviewSubmissionItems/${it.id}`, { method: 'PATCH', body: { data: { type: 'reviewSubmissionItems', id: it.id, attributes: { resolved: true } } } });
      console.log('  marked rejected item resolved', it.id);
    } catch (e) { console.log('  resolve item REFUSED', (e.body || e.message).replace(/\s+/g, ' ').slice(0, 600)); }
  }
  try {
    await api(`/v1/reviewSubmissions/${s.id}`, { method: 'PATCH', body: { data: { type: 'reviewSubmissions', id: s.id, attributes: { submitted: true } } } });
    const after = (await api(`/v1/reviewSubmissions/${s.id}`)).data.attributes.state;
    console.log('OK resubmitted ->', after);
  } catch (e) { console.log('REFUSED', e.message.slice(0, 200)); const j = (() => { try { return JSON.parse(e.body || ''); } catch { return null; } })(); for (const er of j?.errors || []) for (const list of Object.values(er.meta?.associatedErrors || {})) for (const a of list) console.log('  WHY', a.code, a.detail); }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
