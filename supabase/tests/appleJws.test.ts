// App Store signed-transaction check and APNs token: `node --test supabase/tests/appleJws.test.ts`
// Uses a made-up certificate chain (fixtures-apple-test-chain.json) shaped like Apple's: P-384 root and
// intermediate, P-256 signing certificate, and Apple's marker extensions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { APPLE_ROOT_G3_SHA256, verifyAppleJws } from '../functions/_shared/appleJws.ts';
import { apnsJwt, applePushSender } from '../functions/_shared/applePush.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures-apple-test-chain.json', import.meta.url), 'utf8'));
const url64 = (b: Buffer) => b.toString('base64url');
const PAYLOAD = {
  transactionId: '2000000123', originalTransactionId: '2000000100', bundleId: 'com.hoodleague.junk',
  productId: 'com.hoodleague.junk.plus.monthly', expiresDate: Date.parse('2026-12-10T00:00:00Z'),
  signedDate: Date.now(), environment: 'Sandbox', appAccountToken: '11111111-1111-4111-8111-111111111111',
};

function jws(payload: unknown, opts: { chain?: string[]; key?: string } = {}) {
  const head = url64(Buffer.from(JSON.stringify({ alg: 'ES256', x5c: opts.chain ?? [fx.leaf, fx.mid, fx.root] })));
  const body = url64(Buffer.from(JSON.stringify(payload)));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey(opts.key ?? fx.leafKey), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${url64(sig)}`;
}

test('accepts a transaction signed through the pinned root, and returns what is in it', async () => {
  const out = await verifyAppleJws(jws(PAYLOAD), { rootSha256: fx.rootSha256 });
  assert.equal(out.productId, PAYLOAD.productId);
  assert.equal(out.appAccountToken, PAYLOAD.appAccountToken);
});

test('refuses anything not chained to the pinned root, tampered with, or missing Apple markers', async () => {
  // Real Apple root pinned: a look-alike chain fails.
  await assert.rejects(verifyAppleJws(jws(PAYLOAD)), /not signed by Apple/);
  assert.equal(APPLE_ROOT_G3_SHA256.length, 64);
  // Payload changed after signing.
  const [h, , s] = jws(PAYLOAD).split('.');
  const forged = `${h}.${url64(Buffer.from(JSON.stringify({ ...PAYLOAD, expiresDate: Date.parse('2030-01-01T00:00:00Z') })))}.${s}`;
  await assert.rejects(verifyAppleJws(forged, { rootSha256: fx.rootSha256 }), /bad signature/);
  // Signed by a certificate without Apple's marker.
  await assert.rejects(verifyAppleJws(jws(PAYLOAD, { chain: [fx.other, fx.mid, fx.root], key: fx.otherKey }), { rootSha256: fx.rootSha256 }), /not signed by Apple/);
  // Leaf swapped for one the intermediate didn't sign (the root itself in its place).
  await assert.rejects(verifyAppleJws(jws(PAYLOAD, { chain: [fx.leaf, fx.leaf, fx.root] }), { rootSha256: fx.rootSha256 }));
  // Signed while the certificates weren't valid.
  await assert.rejects(verifyAppleJws(jws({ ...PAYLOAD, signedDate: Date.parse('2001-01-01T00:00:00Z') }), { rootSha256: fx.rootSha256 }), /out of date/);
  await assert.rejects(verifyAppleJws('nope', { rootSha256: fx.rootSha256 }));
});

test('APNs token is an ES256 JWT for the key and team, and sends go to the right host', async () => {
  const jwt = await apnsJwt('KEY123', 'TEAM456', fx.leafKey, new Date('2026-11-10T00:00:00Z'));
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url').toString()), { iss: 'TEAM456', iat: 1794268800 });
  const pub = createPublicKey(createPrivateKey(fx.leafKey));
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));

  assert.equal(applePushSender({ topic: 'x' }), null, 'off without the secrets');
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fake = (async (u: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url: u, headers: init.headers, body: init.body });
    return new Response(u.includes('aaaa') ? '{"reason":"BadDeviceToken"}' : '', { status: u.includes('aaaa') ? 400 : 200 });
  }) as unknown as typeof fetch;
  const sender = applePushSender({ keyId: 'K', teamId: 'T', privateKey: fx.leafKey, topic: 'com.hoodleague.junk' }, fake, { warn() {} })!;
  const dead = await sender.send([{ token: 'a'.repeat(64), sandbox: false }, { token: 'b'.repeat(64), sandbox: true }], { title: 'Free: Chair', body: 'Near', path: '/junk/item/1' });
  assert.deepEqual(dead, ['a'.repeat(64)]);
  assert.match(calls[0].url, /^https:\/\/api\.push\.apple\.com\/3\/device\/a+$/);
  assert.match(calls[1].url, /^https:\/\/api\.sandbox\.push\.apple\.com\//);
  assert.equal(calls[0].headers['apns-topic'], 'com.hoodleague.junk');
  assert.deepEqual(JSON.parse(calls[0].body), { aps: { alert: { title: 'Free: Chair', body: 'Near' }, sound: 'default' }, path: '/junk/item/1' });
});
