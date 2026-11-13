import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const token = 'invite_token_12345678901234567890';
// The saved copy is {t, at} JSON (kept one hour) so an old invite can't keep sending talkshops.app to sign-up.
const savedToken = saved => { try { return JSON.parse(saved.get('talkshops-join') || 'null')?.t; } catch { return saved.get('talkshops-join'); } };
function app(respond, { search = `?join=${token}`, stored } = {}) {
  const saved = new Map(stored ? [['talkshops-join', stored]] : []);
  const calls = [];
  const context = vm.createContext({
    URLSearchParams, JSON, Error, encodeURIComponent,
    CFG: { apiUrl: 'https://example.invalid/api' },
    location: { search, origin: 'https://talkshops.app', hash: '' },
    localStorage: { getItem: k => saved.get(k), setItem: (k,v) => saved.set(k,v), removeItem: k => saved.delete(k) },
    history: { replaceState() {} }, window: { createShopTeam: () => ({}) },
    sb: { auth: { getSession: () => { throw Error('Auth lock must not be entered during session handoff'); } } },
    esc: String, toast() {}, render() {}, setTimeout() {},
    // The plan/billing module (public/plan.js) is outside the sliced code; an open trial never locks the shop.
    planUi: { locked: () => false },
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      let [status, body] = respond(url, options);
      // The Bay board now comes back versioned ({ v, jobs }); keep the tests' plain [] meaning "no cars".
      if (url.includes('/jobs/board') && Array.isArray(body)) body = { v: '1', jobs: body };
      return { ok: status < 400, status, text: async () => JSON.stringify(body) };
    },
  });
  const api = source.slice(source.indexOf('  async function api('), source.indexOf('\n  let toastT;'));
  const flow = source.slice(source.indexOf('  let role = null'), source.indexOf('\n  function render()'));
  vm.runInContext(api + flow + `
    globalThis.flow = {
      acceptInvite, loadShop, authRedirect,
      signIn: email => { session = { access_token: 'user-jwt', user: { id: 'tech', email } }; },
      state: () => ({ joinToken, savedJoin, err: join.err, loadErr, shop, role, loaded }),
    };`, context);
  return { flow: context.flow, saved, calls };
}

test('signed-out invite is kept for signup and email confirmation redirect', async () => {
  const { flow, saved, calls } = app(() => [401, 'Sign in first.']);
  await flow.acceptInvite();
  assert.equal(calls.length, 0);
  assert.equal(savedToken(saved), token);
  assert.equal(flow.authRedirect(), `https://talkshops.app/?join=${token}`);
});

test('signed-in technician joins with the event token before loading their shop', async () => {
  const { flow, saved, calls } = app(url => url.includes('/join/')
    ? [200, { shopName: 'Tyler Auto', role: 'tech' }]
    : url.endsWith('/me') ? [200, { shop: { name: 'Tyler Auto' }, role: 'tech' }] : [200, []]);
  flow.signIn('tech@example.com');
  await flow.loadShop();
  assert.ok(calls[0].url.includes('/join/'));
  assert.ok(calls.every(c => c.headers.Authorization === 'Bearer user-jwt'));
  assert.equal(flow.state().role, 'tech');
  assert.equal(flow.state().shop.name, 'Tyler Auto');
  assert.equal(saved.has('talkshops-join'), false);
  assert.equal(flow.state().joinToken, '');
});

for (const status of [401, 403, 502]) test(`join failure ${status} retains invite and blocks shop setup; retry can succeed`, async () => {
  let failed = true;
  const { flow, saved, calls } = app(url => failed ? [status, 'Join failed'] : url.includes('/join/')
    ? [200, { shopName: 'Tyler Auto', role: 'tech' }]
    : url.endsWith('/me') ? [200, { shop: { name: 'Tyler Auto' }, role: 'tech' }] : [200, []]);
  flow.signIn('tech@example.com');
  await flow.loadShop();
  assert.equal(flow.state().joinToken, token);
  assert.equal(savedToken(saved), token);
  assert.equal(flow.state().err, 'Join failed');
  assert.equal(calls.length, 1, 'no shop/setup request after join fails');
  failed = false;
  await flow.loadShop();
  assert.equal(flow.state().joinToken, '');
  assert.equal(flow.state().role, 'tech');
});

for (const status of [404, 409, 410]) test(`join failure ${status} drops the dead invite and opens the account's own shop`, async () => {
  const { flow, saved, calls } = app(url => url.includes('/join/')
    ? [status, 'This invite was already used.']
    : url.endsWith('/me') ? [200, { shop: { name: 'Own Shop' }, role: 'owner' }] : [200, []]);
  flow.signIn('owner@example.com');
  await flow.loadShop();
  assert.equal(flow.state().joinToken, '');
  assert.equal(saved.has('talkshops-join'), false);
  assert.equal(flow.state().loadErr, '');
  assert.equal(flow.state().shop.name, 'Own Shop');
  assert.ok(calls.some(c => c.url.endsWith('/me')));
});

test('a saved invite never shows the join screens on a plain visit, and old plain saves are cleared', () => {
  const fresh = app(() => [500, ''], { search: '', stored: JSON.stringify({ t: token, at: Date.now() }) });
  assert.equal(fresh.flow.state().joinToken, '');
  const old = app(() => [500, ''], { search: '', stored: token });
  assert.equal(old.flow.state().joinToken, '');
  assert.equal(old.saved.has('talkshops-join'), false);
  const stale = app(() => [500, ''], { search: '', stored: JSON.stringify({ t: token, at: Date.now() - 2 * 3600000 }) });
  assert.equal(stale.flow.state().savedJoin, '');
  assert.equal(stale.saved.has('talkshops-join'), false);
});

test('a saved invite from the last hour is tried once after sign-in and never blocks the shop', async () => {
  for (const status of [200, 403]) {
    const { flow, saved, calls } = app(url => url.includes('/join/')
      ? [status, status === 200 ? { shopName: 'Tyler Auto', role: 'tech' } : 'This invite is for someone else.']
      : url.endsWith('/me') ? [200, { shop: { name: 'Tyler Auto' }, role: status === 200 ? 'tech' : 'owner' }] : [200, []],
      { search: '', stored: JSON.stringify({ t: token, at: Date.now() }) });
    flow.signIn('tech@example.com');
    await flow.loadShop();
    assert.ok(calls[0].url.includes('/join/'));
    assert.equal(flow.state().loadErr, '');
    assert.equal(flow.state().shop.name, 'Tyler Auto');
    assert.equal(saved.has('talkshops-join'), false);
    await flow.loadShop();
    assert.equal(calls.filter(c => c.url.includes('/join/')).length, 1, 'tried only once');
  }
});
