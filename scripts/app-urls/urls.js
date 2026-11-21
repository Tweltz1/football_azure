// App Store Connect privacy / support / marketing URLs for every app.
// MODE=read (default) prints them. MODE=write sets them from plan.json, but only on metadata Apple still lets
// us edit and never on a version that is waiting for or in review (those are listed as "left for later").
// Env: KEY_ID, ISSUER_ID, KEY_P8 (same API key as the TestFlight uploads).
const fs = require('fs');
const path = require('path');
const { api } = require('./asc');

const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json'), 'utf8'));
const MODE = (process.env.MODE || fs.readFileSync(path.join(__dirname, 'mode.txt'), 'utf8')).trim();
const EDITABLE = new Set(['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY']);
const REVIEW = new Set(['WAITING_FOR_REVIEW', 'IN_REVIEW', 'READY_FOR_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'PROCESSING_FOR_DISTRIBUTION']);
const later = [];
const changed = [];
const failed = [];

async function patch(type, id, attrs, label) {
  if (MODE !== 'write') return;
  try {
    await api(`/v1/${type}/${id}`, { method: 'PATCH', body: { data: { type, id, attributes: attrs } } });
    changed.push(`${label}: ${JSON.stringify(attrs)}`);
  } catch (e) { failed.push(`${label}: ${e.message.slice(0, 300)}`); }
}

(async () => {
  console.log('Mode:', MODE);
  const apps = await api('/v1/apps?limit=50&fields[apps]=name,bundleId');
  for (const app of apps.data) {
    const { name, bundleId } = app.attributes;
    const want = plan[bundleId];
    console.log(`\n=== ${name} (${bundleId})${want ? '' : '  [not in plan, read only]'}`);
    const infos = await api(`/v1/apps/${app.id}/appInfos`);
    for (const info of infos.data) {
      const state = info.attributes.appStoreState || info.attributes.state;
      const locs = await api(`/v1/appInfos/${info.id}/appInfoLocalizations`);
      for (const l of locs.data) {
        const cur = l.attributes.privacyPolicyUrl;
        console.log(`  appInfo[${state}] ${l.attributes.locale} privacy: ${cur}`);
        if (!want || !want.privacy || cur === want.privacy) continue;
        const label = `${name} appInfo[${state}] ${l.attributes.locale} privacy ${cur} -> ${want.privacy}`;
        if (REVIEW.has(state)) later.push(label);
        else if (EDITABLE.has(state)) await patch('appInfoLocalizations', l.id, { privacyPolicyUrl: want.privacy }, label);
        else later.push(`${label} (live metadata; changes with the next version)`);
      }
    }
    const vers = await api(`/v1/apps/${app.id}/appStoreVersions?limit=6`);
    for (const v of vers.data) {
      const state = v.attributes.appStoreState;
      const locs = await api(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
      for (const l of locs.data) {
        const a = l.attributes;
        const desc = (a.description || '').match(/https?:\/\/[^\s)]+/g) || [];
        console.log(`  version ${v.attributes.versionString}[${state}] ${a.locale} support: ${a.supportUrl} marketing: ${a.marketingUrl}${desc.length ? ' | links in description: ' + desc.join(' ') : ''}`);
        if (!want) continue;
        const attrs = {};
        if (want.support && a.supportUrl !== want.support) attrs.supportUrl = want.support;
        if (want.marketing && a.marketingUrl !== want.marketing) attrs.marketingUrl = want.marketing;
        if (want.descriptionReplace && a.description) {
          let d = a.description;
          for (const [from, to] of Object.entries(want.descriptionReplace)) d = d.split(from).join(to);
          if (d !== a.description) attrs.description = d;
        }
        if (!Object.keys(attrs).length) continue;
        const label = `${name} ${v.attributes.versionString}[${state}] ${a.locale} ${Object.keys(attrs).join('+')}`;
        if (EDITABLE.has(state)) await patch('appStoreVersionLocalizations', l.id, attrs, label);
        else later.push(`${label}${REVIEW.has(state) ? ' (in review, left alone)' : ' (live version, locked until next version)'}`);
      }
    }
  }
  console.log('\n--- Changed ---\n' + (changed.join('\n') || '(none)'));
  console.log('\n--- Left for later ---\n' + (later.join('\n') || '(none)'));
  console.log('\n--- Failed ---\n' + (failed.join('\n') || '(none)'));
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
