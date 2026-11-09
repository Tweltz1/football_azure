import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const token = 'invite_token_12345678901234567890';
function app(respond) {
  const saved = new Map();
  const calls = [];
  const context = vm.createContext({
    URLSearchParams, JSON, Error, encodeURIComponent,
    CFG: { apiUrl: 'https://example.invalid/api' },
    location: { search: `?join=${token}`, origin: 'https://talkshops.app', hash: '' },
    localStorage: { getItem: k => saved.get(k), setItem: (k,v) => saved.set(k,v), removeItem: k => saved.delete(k) },
    history: { replaceState() {} }, window: { createShopTeam: () => ({}) },
    sb: { auth: { getSession: () => { throw Error('Auth lock must not be entered during session handoff'); } } },
    esc: String, toast() {}, render() {}, setTimeout() {},
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      const [status, body] = respond(url, options);
      return { ok: status < 400, status, text: async () => JSON.stringify(body) };
    },
  });
  const api = source.slice(source.indexOf('  async function api('), source.indexOf('\n  let toastT;'));
  const flow = source.slice(source.indexOf('  let role = null'), source.indexOf('\n  function render()'));
  vm.runInContext(api + flow + `
    globalThis.flow = {
      acceptInvite, loadShop, authRedirect,
      signIn: email => { session = { access_token: 'user-jwt', user: { id: 'tech', email } }; },
      state: () => ({ joinToken, err: join.err, loadErr, shop, role, loaded }),
    };`, context);
  return { flow: context.flow, saved, calls };
}

test('signed-out invite is kept for signup and email confirmation redirect', async () => {
  const { flow, saved, calls } = app(() => [401, 'Sign in first.']);
  await flow.acceptInvite();
  assert.equal(calls.length, 0);
  assert.equal(saved.get('talkshops-join'), token);
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

for (const status of [401, 403, 410, 502]) test(`join failure ${status} retains invite and blocks shop setup; retry can succeed`, async () => {
  let failed = true;
  const { flow, saved, calls } = app(url => failed ? [status, 'Join failed'] : url.includes('/join/')
    ? [200, { shopName: 'Tyler Auto', role: 'tech' }]
    : url.endsWith('/me') ? [200, { shop: { name: 'Tyler Auto' }, role: 'tech' }] : [200, []]);
  flow.signIn('tech@example.com');
  await flow.loadShop();
  assert.equal(flow.state().joinToken, token);
  assert.equal(saved.get('talkshops-join'), token);
  assert.equal(flow.state().err, 'Join failed');
  assert.equal(calls.length, 1, 'no shop/setup request after join fails');
  failed = false;
  await flow.loadShop();
  assert.equal(flow.state().joinToken, '');
  assert.equal(flow.state().role, 'tech');
});
