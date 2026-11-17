// Points Curbsy's and ToteTrack's App Store privacy, support and marketing URLs at weltzcraft.com
// (ToteTrack's used to point at GitHub). Prints old -> new. Env: KEY_ID, ISSUER_ID, KEY_P8.
const { api, step } = require('../curbsy-store/asc');
const APPS = [
  { bundle: 'com.hoodleague.junk', slug: 'curbsy' },
  { bundle: 'com.tweltz1.totetrack', slug: 'totetrack' },
];
(async () => {
  for (const a of APPS) {
    const app = (await api(`/v1/apps?filter[bundleId]=${a.bundle}`)).data[0];
    const want = { privacy: `https://weltzcraft.com/privacy/${a.slug}`, support: `https://weltzcraft.com/support/${a.slug}` };
    const infos = (await api(`/v1/apps/${app.id}/appInfos`)).data.filter((i) => i.attributes.appStoreState !== 'READY_FOR_SALE');
    for (const info of infos) {
      for (const l of (await api(`/v1/appInfos/${info.id}/appInfoLocalizations`)).data) {
        await step(`${app.attributes.name} ${l.attributes.locale} privacy URL`, async () => {
          const old = l.attributes.privacyPolicyUrl;
          if (old === want.privacy) return `already ${old}`;
          await api(`/v1/appInfoLocalizations/${l.id}`, { method: 'PATCH', body: { data: { type: 'appInfoLocalizations', id: l.id, attributes: { privacyPolicyUrl: want.privacy } } } });
          return `${old} -> ${want.privacy}`;
        });
      }
    }
    const v = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=5`)).data.find((x) => x.attributes.versionString.startsWith('1.0'));
    for (const l of (await api(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data) {
      await step(`${app.attributes.name} ${l.attributes.locale} support URL`, async () => {
        const old = l.attributes.supportUrl;
        const attrs = {};
        if (old !== want.support) attrs.supportUrl = want.support;
        if (!l.attributes.marketingUrl || /github\.com/.test(l.attributes.marketingUrl)) attrs.marketingUrl = 'https://weltzcraft.com';
        if (!Object.keys(attrs).length) return `already ${old}; marketing ${l.attributes.marketingUrl}`;
        await api(`/v1/appStoreVersionLocalizations/${l.id}`, { method: 'PATCH', body: { data: { type: 'appStoreVersionLocalizations', id: l.id, attributes: attrs } } });
        return `support ${old} -> ${attrs.supportUrl || old}; marketing ${l.attributes.marketingUrl} -> ${attrs.marketingUrl || l.attributes.marketingUrl}`;
      });
    }
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
