// Small App Store Connect API client, using the same API key as the TestFlight upload.
// Env: KEY_ID, ISSUER_ID, KEY_P8.
const crypto = require('crypto');

const API = 'https://api.appstoreconnect.apple.com';

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: process.env.KEY_ID, typ: 'JWT' });
  const body = b64({ iss: process.env.ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: process.env.KEY_P8, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${sig.toString('base64url')}`;
}

async function api(path, init = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    body: init.body && typeof init.body !== 'string' ? JSON.stringify(init.body) : init.body,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${init.method || 'GET'} ${path.replace(API, '')}: ${res.status} ${text.slice(0, 700)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

/** Runs a step and reports instead of stopping the rest when it fails. */
async function step(name, fn) {
  try {
    const out = await fn();
    console.log(`OK   ${name}${out ? `: ${out}` : ''}`);
    return true;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    return false;
  }
}

module.exports = { api, step };
