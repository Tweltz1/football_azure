// Turns on the capabilities Shop Stride's entitlements need (Sign in with Apple) for
// com.tweltz1.groceryrunner in Apple's developer account, using the App Store Connect API key the TestFlight
// upload already uses. Exits 0 when the App ID has them all, 1 otherwise. Env: KEY_ID, ISSUER_ID, KEY_P8.
const crypto = require('crypto');

const BUNDLE = 'com.tweltz1.groceryrunner';
const API = 'https://api.appstoreconnect.apple.com/v1';

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: process.env.KEY_ID, typ: 'JWT' });
  const body = b64({ iss: process.env.ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: process.env.KEY_P8, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${sig.toString('base64url')}`;
}

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  const found = await api(`/bundleIds?filter[identifier]=${BUNDLE}&include=bundleIdCapabilities&limit=20`);
  const app = (found.data || []).find((b) => b.attributes.identifier === BUNDLE);
  if (!app) throw new Error(`No App ID ${BUNDLE} in this team`);
  const caps = (found.included || []).filter((c) => c.type === 'bundleIdCapabilities'
    && (app.relationships?.bundleIdCapabilities?.data || []).some((d) => d.id === c.id));
  const wanted = [
    {
      capabilityType: 'APPLE_ID_AUTH',
      settings: [{ key: 'APPLE_ID_AUTH_APP_CONSENT', options: [{ key: 'PRIMARY_APP_CONSENT' }] }],
    },
  ];
  for (const attributes of wanted) {
    if (caps.some((c) => c.attributes.capabilityType === attributes.capabilityType)) {
      console.log(`${attributes.capabilityType} is already on for`, BUNDLE);
      continue;
    }
    await api('/bundleIdCapabilities', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'bundleIdCapabilities',
          attributes,
          relationships: { bundleId: { data: { type: 'bundleIds', id: app.id } } },
        },
      }),
    });
    console.log(`Turned on ${attributes.capabilityType} for`, BUNDLE);
  }
})().catch((error) => {
  console.log(`::warning::Couldn't turn on Sign in with Apple for ${BUNDLE} (${error.message}).`);
  process.exit(1);
});
