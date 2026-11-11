// Fills in the App Review contact (and ToteTrack's review notes when blank) on the version being prepared
// for Curbsy and ToteTrack, from the APP_REVIEW_* secrets. Prints set/missing only, never the values.
// Env: KEY_ID, ISSUER_ID, KEY_P8, APP_REVIEW_FIRST_NAME, APP_REVIEW_LAST_NAME, APP_REVIEW_PHONE, APP_REVIEW_EMAIL.
const { api, step } = require('../curbsy-store/asc');

const TOTE_NOTES = "Signing in is optional; every feature works without an account. To test backup, tap the person icon at the top left and sign in with Apple or Google. Delete account is on the same screen. Labels can be printed from the print icon (top right) and scanned with the Scan button. NFC stickers are optional and need an NTAG sticker. ToteTrack Pro (auto-renewing subscription) unlocks more than 10 totes and Snap to add; the paywall is at Account & backup or appears when creating an 11th tote.";
const APPS = [{ bundle: 'com.hoodleague.junk' }, { bundle: 'com.tweltz1.totetrack', notes: TOTE_NOTES }];

const contact = {
  contactFirstName: (process.env.APP_REVIEW_FIRST_NAME || '').trim(),
  contactLastName: (process.env.APP_REVIEW_LAST_NAME || '').trim(),
  contactPhone: (process.env.APP_REVIEW_PHONE || '').trim(),
  contactEmail: (process.env.APP_REVIEW_EMAIL || '').trim(),
};

(async () => {
  const missing = Object.entries(contact).filter(([, v]) => !v).map(([k]) => k);
  console.log(`APP_REVIEW_* secrets: ${missing.length ? 'missing ' + missing.join(', ') : 'all set'}`);
  if (missing.length) { console.log('Nothing changed.'); return; }
  for (const a of APPS) {
    const app = (await api(`/v1/apps?filter[bundleId]=${a.bundle}`)).data[0];
    if (!app) { console.log(`${a.bundle}: app not found`); continue; }
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(x.attributes.appStoreState));
    if (!v) { console.log(`${app.attributes.name}: no version being prepared`); continue; }
    await step(`${app.attributes.name} ${v.attributes.versionString} review contact`, async () => {
      const d = await api(`/v1/appStoreVersions/${v.id}/appStoreReviewDetail`).catch(() => null);
      const attributes = { ...contact, demoAccountRequired: false };
      if (a.notes && !(d?.data?.attributes?.notes)) attributes.notes = a.notes;
      if (d && d.data) await api(`/v1/appStoreReviewDetails/${d.data.id}`, { method: 'PATCH', body: { data: { type: 'appStoreReviewDetails', id: d.data.id, attributes } } });
      else await api('/v1/appStoreReviewDetails', { method: 'POST', body: { data: { type: 'appStoreReviewDetails', attributes, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } } });
      return attributes.notes ? 'set, plus review notes' : 'set';
    });
  }
  console.log('Done.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
