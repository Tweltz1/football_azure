// Fills the App Store listings for Hood League FF, Hood Games and Hood Protocol (all were empty): listing
// text, support/privacy links, category, subtitle, copyright, content rights, age rating answers and the App
// Review contact + notes. Does NOT attach a build or submit anything. Prints set/failed only.
// Env: KEY_ID, ISSUER_ID, KEY_P8, APP_REVIEW_FIRST_NAME, APP_REVIEW_LAST_NAME, APP_REVIEW_PHONE, APP_REVIEW_EMAIL.
const { api, step } = require('../curbsy-store/asc');

const COPYRIGHT = '2026 Weltzcraft Studios';
const contact = {
  contactFirstName: (process.env.APP_REVIEW_FIRST_NAME || '').trim(),
  contactLastName: (process.env.APP_REVIEW_LAST_NAME || '').trim(),
  contactPhone: (process.env.APP_REVIEW_PHONE || '').trim(),
  contactEmail: (process.env.APP_REVIEW_EMAIL || '').trim(),
};

// Frequency answers: NONE, INFREQUENT_OR_MILD, FREQUENT_OR_INTENSE. Yes/no answers: true/false.
const QUIET = {
  alcoholTobaccoOrDrugUseOrReferences: 'NONE', contests: 'NONE', gamblingSimulated: 'NONE', gunsOrOtherWeapons: 'NONE',
  medicalOrTreatmentInformation: 'NONE', profanityOrCrudeHumor: 'NONE', sexualContentGraphicAndNudity: 'NONE',
  sexualContentOrNudity: 'NONE', horrorOrFearThemes: 'NONE', matureOrSuggestiveThemes: 'NONE',
  violenceCartoonOrFantasy: 'NONE', violenceRealisticProlongedGraphicOrSadistic: 'NONE', violenceRealistic: 'NONE',
  advertising: false, gambling: false, healthOrWellnessTopics: false, lootBox: false, messagingAndChat: false,
  parentalControls: false, ageAssurance: false, socialMedia: false, unrestrictedWebAccess: false, userGeneratedContent: false,
};

const APPS = [
  {
    bundle: 'com.hoodleague.draft',
    subtitle: 'Fantasy auction draft night',
    privacy: 'https://hood-league.com/privacy.html',
    support: 'https://weltzcraft.com/support/hood-league',
    marketing: 'https://hood-league.com',
    // Age rating was already answered (17+); leave it.
    keywords: 'fantasy football,auction draft,draft board,league,commissioner,start sit,trade,rankings,offline',
    promo: 'Draft night, your way: run a live auction draft on everyone\'s phones, or offline with phones in the same room.',
    description: `Hood League runs fantasy football auction drafts that feel like draft night should.

LIVE AUCTION DRAFTS
- Create a league, invite friends with a link, and draft together on your phones.
- Nominate players, bid in real time and watch budgets and rosters update for everyone.
- Put the draft board on the TV for the room.

DRAFT WITHOUT INTERNET
- Phones in the same room can run the whole draft over Wi-Fi and Bluetooth, no signal needed.

BE READY ON DRAFT DAY
- Rankings, tiers and a private board for your favorite targets.
- Start/Sit and trade help: ask a question and get a straight answer.
- Draft history so you can look back at every pick.

Sign in with Apple, Google or email to save your leagues and profile. Hood League is free with no ads.`,
    notes: 'Sign in with Apple, Google, or sign up with any email address on the first screen. To try a draft: Create > make a league, then open its draft room. Offline drafting between nearby phones needs two devices. Delete account: Profile > Delete account. The app is free with no in-app purchases.',
  },
  {
    bundle: 'com.hoodleague.games',
    subtitle: 'Party games & tabletop quests',
    privacy: 'https://hood-league.com/privacy.html',
    support: 'https://weltzcraft.com/support/hood-games',
    marketing: 'https://hood-league.com/hood-games',
    category: 'GAMES', sub1: 'GAMES_ROLE_PLAYING', sub2: 'GAMES_CARD', secondary: 'ENTERTAINMENT',
    contentRights: 'DOES_NOT_USE_THIRD_PARTY_CONTENT',
    age: {
      violenceCartoonOrFantasy: 'INFREQUENT_OR_MILD', alcoholTobaccoOrDrugUseOrReferences: 'INFREQUENT_OR_MILD',
      horrorOrFearThemes: 'INFREQUENT_OR_MILD', profanityOrCrudeHumor: 'INFREQUENT_OR_MILD', messagingAndChat: true,
    },
    keywords: 'party games,game night,tabletop,rpg,adventure,card games,friends,multiplayer,trivia,dungeon',
    promo: 'Game night in your pocket: party games, AI-narrated tabletop quests and card games for the whole crew.',
    description: `Hood Games is game night for your crew, on the phones you already have.

GAMES NIGHT
- Card table games and party games everyone joins with a room code.
- Put the table on the TV and play from your phones.

HOOD QUEST
- Tabletop adventures with a narrator that runs the story, the fights and the loot.
- Make a hero, team up, and pick up your saved characters next time.

MORE TO PLAY
- Draft mini-games and Fun Run for quick rounds.
- A way into Hood League for fantasy football auction drafts.

Sign in once with Apple, Google or email and your name, characters and scores follow you to every game. Or just play as a guest. Hood Games is free with no ads.`,
    notes: 'Sign in is optional: tap Sign in with Apple or Google on the home screen, or play as a guest. Most games are played by 2+ phones joined to the same room code. Voice chat in Hood Quest only connects players who joined the same private room code. Delete account: home screen, under your name. The app is free with no in-app purchases.',
  },
  {
    bundle: 'com.tweltz1.hoodprotocol',
    subtitle: 'Hidden-role party game',
    privacy: 'https://weltzcraft.com/privacy/hood-protocol',
    support: 'https://weltzcraft.com/support/hood-protocol',
    marketing: 'https://weltzcraft.com',
    category: 'GAMES', sub1: 'GAMES_STRATEGY', sub2: 'GAMES_CARD', secondary: 'ENTERTAINMENT',
    contentRights: 'DOES_NOT_USE_THIRD_PARTY_CONTENT',
    age: {
      alcoholTobaccoOrDrugUseOrReferences: 'FREQUENT_OR_INTENSE', matureOrSuggestiveThemes: 'INFREQUENT_OR_MILD',
      profanityOrCrudeHumor: 'INFREQUENT_OR_MILD',
    },
    keywords: 'social deduction,hidden role,party game,bluff,mafia,werewolf,friends,multiplayer,bots,deduction',
    promo: 'Somebody at the all-nighter is a Narc. Bluff, vote and find the Snitch before the night is over.',
    description: `It's an all-nighter in the basement. Most of the group are Crew, but a few are Narcs, and one of them is the Snitch. Talk, bluff and vote to find them before the night gets too dark.

PLAY ANY WAY
- Solo against bots on one phone.
- Nearby with friends in the same room, no internet needed.
- Online with a 4-letter room code. Empty seats fill with bots.

THE BASEMENT
- Hang out between rounds: video games, beer pong, the couch.
- Unlock new looks for your character as you play and win.
- Climb the leaderboard when you sign in.

Hood Protocol is a game for adults (17+) and includes drug and alcohol references. Free, no ads.`,
    notes: 'Tap Play vs bots on the home screen to play a full game alone; no account needed. Nearby play needs two devices on the same Wi-Fi/Bluetooth; Online uses a 4-letter room code. Sign-in (Apple, Google or email) is optional and only saves wins/unlocks: person icon at the top right. Delete account is on the same screen. Rated 17+ for drug and alcohol references in a fictional party setting. Free, no in-app purchases.',
  },
];

(async () => {
  for (const a of APPS) {
    const app = (await api(`/v1/apps?filter[bundleId]=${a.bundle}`)).data[0];
    if (!app) { console.log(`\n${a.bundle}: app not found`); continue; }
    console.log(`\n== ${app.attributes.name}`);
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION');
    if (!v) { console.log('no version being prepared; skipped'); continue; }

    if (a.contentRights) await step('content rights', () => api(`/v1/apps/${app.id}`, { method: 'PATCH', body: { data: { type: 'apps', id: app.id, attributes: { contentRightsDeclaration: a.contentRights } } } }).then(() => 'set'));
    await step('copyright', () => api(`/v1/appStoreVersions/${v.id}`, { method: 'PATCH', body: { data: { type: 'appStoreVersions', id: v.id, attributes: { copyright: COPYRIGHT } } } }).then(() => 'set'));

    await step('listing text + links', async () => {
      const loc = (await api(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data.find((l) => l.attributes.locale === 'en-US');
      const attributes = { description: a.description, keywords: a.keywords, promotionalText: a.promo, supportUrl: a.support, marketingUrl: a.marketing };
      if (attributes.keywords.length > 100) throw new Error(`keywords too long (${attributes.keywords.length})`);
      await api(`/v1/appStoreVersionLocalizations/${loc.id}`, { method: 'PATCH', body: { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes } } });
      return `set (description ${a.description.length} chars, keywords ${a.keywords.length})`;
    });

    const info = (await api(`/v1/apps/${app.id}/appInfos`)).data.find((x) => (x.attributes.appStoreState || x.attributes.state) !== 'READY_FOR_DISTRIBUTION') || null;
    if (!info) { console.log('no editable app info'); continue; }
    await step('subtitle + privacy link', async () => {
      const loc = (await api(`/v1/appInfos/${info.id}/appInfoLocalizations`)).data.find((l) => l.attributes.locale === 'en-US');
      await api(`/v1/appInfoLocalizations/${loc.id}`, { method: 'PATCH', body: { data: { type: 'appInfoLocalizations', id: loc.id, attributes: { subtitle: a.subtitle, privacyPolicyUrl: a.privacy } } } });
      return 'set';
    });
    if (a.category) await step('category', async () => {
      const rel = (id) => (id ? { data: { type: 'appCategories', id } } : undefined);
      const relationships = { primaryCategory: rel(a.category), primarySubcategoryOne: rel(a.sub1), primarySubcategoryTwo: rel(a.sub2), secondaryCategory: rel(a.secondary) };
      await api(`/v1/appInfos/${info.id}`, { method: 'PATCH', body: { data: { type: 'appInfos', id: info.id, relationships } } });
      return `${a.category} / ${a.sub1} / ${a.sub2}, secondary ${a.secondary}`;
    });
    if (a.age) await step('age rating answers', async () => {
      const decl = await api(`/v1/appInfos/${info.id}/ageRatingDeclaration`);
      const id = decl.data.id;
      const known = decl.data.attributes;
      const attributes = Object.fromEntries(Object.entries({ ...QUIET, ...a.age }).filter(([k]) => k in known));
      await api(`/v1/ageRatingDeclarations/${id}`, { method: 'PATCH', body: { data: { type: 'ageRatingDeclarations', id, attributes } } });
      const after = (await api(`/v1/appInfos/${info.id}/ageRatingDeclaration`)).data.attributes;
      const open = Object.entries(after).filter(([, x]) => x === null).map(([k]) => k);
      return `set ${Object.keys(attributes).length}; still blank: ${open.join(',') || 'none'}`;
    });

    await step('App Review contact + notes', async () => {
      const missing = Object.entries(contact).filter(([, x]) => !x).map(([k]) => k);
      const attributes = { ...(missing.length ? {} : contact), demoAccountRequired: false, notes: a.notes };
      const d = await api(`/v1/appStoreVersions/${v.id}/appStoreReviewDetail`).catch(() => null);
      if (d && d.data) await api(`/v1/appStoreReviewDetails/${d.data.id}`, { method: 'PATCH', body: { data: { type: 'appStoreReviewDetails', id: d.data.id, attributes } } });
      else await api('/v1/appStoreReviewDetails', { method: 'POST', body: { data: { type: 'appStoreReviewDetails', attributes, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } } });
      return missing.length ? `notes set; contact secrets missing: ${missing.join(',')}` : 'contact + notes set';
    });
  }
  console.log('\nDone.');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
