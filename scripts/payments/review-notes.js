// Writes the full App Review notes (Guideline 2.1 "Information Needed" answers) on the 1.0 version of
// Curbsy and ToteTrack. Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');

const TOTE = `1. SCREEN RECORDING: attached to this submission (App Review attachment). Recorded on an iPhone with the latest iOS. It starts at app launch and shows sign-in, creating a tote, adding items with Snap to add, printing/scanning a label, ToteTrack Pro, and Delete account.

2. PURPOSE AND AUDIENCE: ToteTrack is for anyone who stores things in bins or boxes (garages, basements, storage units, moving). Each tote gets a QR label; scanning it shows what is inside, and search finds which tote holds an item. It solves "which box is it in?" without opening every bin.

3. HOW TO USE / LOGIN: An account is required so totes sync between phones and are backed up. On the first screen tap Sign in with Apple (or Google); no demo account is needed. Then: tap + to make a tote, open it and tap + or Snap to add to add items (the camera suggests a name on the phone). Print labels from the print icon (top right); scan a label with the Scan button. NFC stickers are optional (NTAG). Swipe a tote or item left to delete it. Packing lists open from the Packing lists button on the home screen. Delete account: person icon (top left) > Account & backup > Delete account; this deletes the account and all its data from our server.

PAID FEATURES: ToteTrack Pro (auto-renewing subscription, monthly or yearly) unlocks more than 10 totes and Snap to add. Open it from Account & backup, or create an 11th tote. Restore Purchases is on the same screen. The sandbox account can buy it.

User-generated content: none is shared between users; each person only sees their own totes.

4. EXTERNAL SERVICES: Supabase (account sign-in, database and photo storage for backup/sync), Sign in with Apple, Google Sign-In, Apple In-App Purchase / StoreKit. Item naming runs on the phone (bundled image model); no AI service is called.

5. REGIONS: The app works the same in every region. There is no region-specific content.

6. REGULATION: Not a regulated industry and no third-party protected material.`;

const CURBSY = `1. SCREEN RECORDING: attached to this submission (App Review attachment). Recorded on an iPhone with the latest iOS. It starts at app launch and shows sign-in, posting an item, browsing, messaging, report and block, Curbsy Plus, a tip, and Delete account.

2. PURPOSE AND AUDIENCE: Curbsy is for people who want to give away free stuff they no longer need, or pick up free stuff nearby, instead of throwing it away. Posters snap a photo, the phone suggests a name, and neighbours can claim it and message the poster to arrange pickup.

3. HOW TO USE / LOGIN: Browsing works without an account. Posting, claiming, messaging and reporting need an account: tap Me and Sign in with Apple (or Google); no demo account is needed. Listings are real posts near the device's location, so there may be few in your area; you can post a test item with Post (+). Delete account: Me > Delete account; this removes the account, its listings and messages.

USER-GENERATED CONTENT: On any listing or chat tap the flag icon to Report it or Block the user (hides all their posts and messages). Reports are reviewed daily; offending posts are removed and users banned.

PAID FEATURES: Curbsy Plus (auto-renewing monthly subscription) lets you search up to 100 miles instead of 25, get instant alerts for saved searches, and see new posts early. Open it from Me, or by widening the search distance past 25 miles. Tips (three consumable in-app purchases) are under Me > Support Curbsy with a tip and unlock nothing; they just support the app. Restore Purchases is in Me.

4. EXTERNAL SERVICES: Supabase (accounts, database, photo storage, messaging), Sign in with Apple, Google Sign-In, Apple In-App Purchase / StoreKit. Item naming runs on the phone with Apple's Vision framework; the app does not call an AI service.

5. REGIONS: The app works the same in every region. Listings shown are those posted near the user.

6. REGULATION: Not a regulated industry and no third-party protected material. Items are free; no money changes hands between users in the app.`;

const APPS = [{ bundle: 'com.tweltz1.totetrack', notes: TOTE }, { bundle: 'com.hoodleague.junk', notes: CURBSY }];
(async () => {
  for (const a of APPS) {
    if (a.notes.length > 4000) throw new Error(`${a.bundle} notes too long: ${a.notes.length}`);
    const app = (await api(`/v1/apps?filter[bundleId]=${a.bundle}`)).data[0];
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.versionString.startsWith('1.0'));
    await step(`${app.attributes.name} ${v.attributes.appStoreState}: review notes (${a.notes.length} chars)`, async () => {
      const d = await api(`/v1/appStoreVersions/${v.id}/appStoreReviewDetail`);
      await api(`/v1/appStoreReviewDetails/${d.data.id}`, { method: 'PATCH', body: { data: { type: 'appStoreReviewDetails', id: d.data.id, attributes: { notes: a.notes } } } });
      const after = (await api(`/v1/appStoreReviewDetails/${d.data.id}`)).data.attributes.notes || '';
      return after === a.notes ? 'saved' : `MISMATCH (${after.length} chars)`;
    });
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
