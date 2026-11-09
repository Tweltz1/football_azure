// Talk Shops forgot password, against in-memory storage: `node --test supabase/tests/shopAccount.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import { shopRoute, type ShopDeps, type ShopStore } from '../functions/_shared/shop.ts';
import type { AccountStore, AuthCode } from '../functions/_shared/shopAccount.ts';

function world(opts: { email?: boolean } = {}) {
  const users = [{ id: 'u1', email: 'owner@shop.com', password: 'old-password', confirmed: false }];
  const phones = new Map<string, { phone: string; verifiedAt: string | null }>();
  const codes: AuthCode[] = [];
  const texts: { to: string; body: string }[] = [];
  const emails: { to: string; subject: string; body: string }[] = [];
  let clock = Date.parse('2026-11-08T02:00:00Z');
  let n = 0;
  let next = 100000;
  const account: AccountStore = {
    async userByEmail(email) { const u = users.find((x) => x.email === email.toLowerCase()); return u ? { id: u.id, email: u.email } : null; },
    async setPassword(id, password, confirm) { const u = users.find((x) => x.id === id)!; u.password = password; if (confirm) u.confirmed = true; },
    async recoveryPhone(id) { return phones.get(id) ?? null; },
    async setRecoveryPhone(id, phone, verifiedAt) { if (phone) phones.set(id, { phone, verifiedAt }); else phones.delete(id); },
    async saveCode(c) { codes.forEach((x) => { if (x.userId === c.userId && x.purpose === c.purpose && !x.usedAt) x.usedAt = c.createdAt; }); codes.push({ ...c }); },
    async openCode(id, purpose, now) { return [...codes].reverse().find((c) => c.userId === id && c.purpose === purpose && !c.usedAt && c.expiresAt > now) ?? null; },
    async countCodes(id, since) { return codes.filter((c) => c.userId === id && c.createdAt >= since).length; },
    async updateCode(id, patch) { const c = codes.find((x) => x.id === id)!; if (patch.attempts !== undefined) c.attempts = patch.attempts; if (patch.usedAt) c.usedAt = patch.usedAt; },
  };
  const deps: ShopDeps = {
    store: {} as ShopStore,
    account,
    sms: { async send(to, body) { texts.push({ to, body }); return { delivery: 'sent' }; } },
    ...(opts.email === false ? {} : { email: { async send(to: string, subject: string, body: string) { emails.push({ to, subject, body }); return { delivery: 'sent' as const }; } } }),
    linkBase: 'https://talkshops.app/?c=',
    newToken: () => 'tok',
    newCode: () => String(next++),
  };
  const as = (userId: string | null) => (method: string, path: string, body?: unknown) => {
    clock += 1000;
    const ctx = { userId, now: () => new Date(clock), newId: () => `id${++n}`, log: { info() {}, warn() {}, error() {} } } as unknown as Ctx;
    return shopRoute(ctx, deps, method, path.split('/'), body ?? null);
  };
  return { as, users, codes, texts, emails, tick: (ms: number) => { clock += ms; } };
}

test('forgot password by email: code resets the password and verifies the email', async () => {
  const w = world();
  const anon = w.as(null);
  const sent = await anon('POST', 'shop/auth/forgot', { email: 'Owner@Shop.com', channel: 'email' });
  assert.equal(sent?.status, 200);
  assert.equal(w.emails.length, 1);
  assert.equal(w.emails[0].to, 'owner@shop.com');
  assert.match(w.emails[0].body, /100000/);
  assert.equal(w.codes[0].codeHash.includes('100000'), false, 'only a hash is stored');

  assert.equal((await anon('POST', 'shop/auth/reset', { email: 'owner@shop.com', code: '999999', password: 'brand-new-pass' }))?.status, 400);
  assert.equal((await anon('POST', 'shop/auth/reset', { email: 'owner@shop.com', code: '100000', password: 'short' }))?.status, 400);
  const done = await anon('POST', 'shop/auth/reset', { email: 'owner@shop.com', code: '100 000', password: 'brand-new-pass' });
  assert.equal(done?.status, 200);
  assert.equal(w.users[0].password, 'brand-new-pass');
  assert.equal(w.users[0].confirmed, true);
  // A code works once.
  assert.equal((await anon('POST', 'shop/auth/reset', { email: 'owner@shop.com', code: '100000', password: 'another-pass' }))?.status, 400);
});

test('unknown email gets the same answer and nothing is sent', async () => {
  const w = world();
  const known = await w.as(null)('POST', 'shop/auth/forgot', { email: 'owner@shop.com' });
  const unknown = await w.as(null)('POST', 'shop/auth/forgot', { email: 'nobody@shop.com' });
  assert.deepEqual((unknown?.body as { sent: boolean }).sent, true);
  assert.equal(String((unknown?.body as { message: string }).message).replace('nobody', 'owner'), (known?.body as { message: string }).message);
  assert.equal(w.emails.length, 1);
});

test('a new code replaces the old one, codes expire, and wrong guesses are limited', async () => {
  const w = world();
  const anon = w.as(null);
  await anon('POST', 'shop/auth/forgot', { email: 'owner@shop.com' }); // 100000
  await anon('POST', 'shop/auth/forgot', { email: 'owner@shop.com' }); // 100001
  assert.equal((await anon('POST', 'shop/auth/reset', { email: 'owner@shop.com', code: '100000', password: 'brand-new-pass' }))?.status, 400);
  w.tick(16 * 60_000);
  assert.equal((await anon('POST', 'shop/auth/reset', { email: 'owner@shop.com', code: '100001', password: 'brand-new-pass' }))?.status, 400, 'expired');

  await anon('POST', 'shop/auth/forgot', { email: 'owner@shop.com' }); // 100002
  for (let i = 0; i < 5; i++) await anon('POST', 'shop/auth/reset', { email: 'owner@shop.com', code: '000000', password: 'brand-new-pass' });
  assert.equal((await anon('POST', 'shop/auth/reset', { email: 'owner@shop.com', code: '100002', password: 'brand-new-pass' }))?.status, 400, 'locked after 5 tries');
  assert.equal(w.users[0].password, 'old-password');

  await anon('POST', 'shop/auth/forgot', { email: 'owner@shop.com' });
  await anon('POST', 'shop/auth/forgot', { email: 'owner@shop.com' });
  assert.equal((await anon('POST', 'shop/auth/forgot', { email: 'owner@shop.com' }))?.status, 429, 'five sends an hour');
});

test('text codes only go to a phone the shop verified in settings', async () => {
  const w = world();
  const anon = w.as(null), owner = w.as('u1');
  await anon('POST', 'shop/auth/forgot', { email: 'owner@shop.com', channel: 'sms' });
  assert.equal(w.texts.length, 0, 'no verified phone yet');

  assert.equal((await owner('POST', 'shop/recovery/phone', { phone: 'nope' }))?.status, 400);
  const add = await owner('POST', 'shop/recovery/phone', { phone: '(512) 555-0142' });
  assert.equal(add?.status, 200);
  assert.equal(w.texts[0].to, '+15125550142');
  assert.equal((await owner('GET', 'shop/recovery'))?.body && ((await owner('GET', 'shop/recovery'))!.body as { verified: boolean }).verified, false);
  // An unverified phone gets no reset codes.
  await anon('POST', 'shop/auth/forgot', { email: 'owner@shop.com', channel: 'sms' });
  assert.equal(w.texts.length, 1);

  assert.equal((await owner('POST', 'shop/recovery/verify', { code: '123456' }))?.status, 400);
  const verified = await owner('POST', 'shop/recovery/verify', { code: '100000' });
  assert.deepEqual(verified?.body, { phone: '(•••) •••-0142', verified: true });

  await anon('POST', 'shop/auth/forgot', { email: 'owner@shop.com', channel: 'sms' });
  assert.equal(w.texts.length, 2);
  assert.equal(w.texts[1].to, '+15125550142');
  assert.match(w.texts[1].body, /reset code is 100001/);
  const done = await anon('POST', 'shop/auth/reset', { email: 'owner@shop.com', code: '100001', password: 'texted-pass' });
  assert.equal(done?.status, 200);
  assert.equal(w.users[0].password, 'texted-pass');
  assert.equal(w.users[0].confirmed, false, 'a texted code does not verify the email');

  await owner('DELETE', 'shop/recovery');
  assert.deepEqual((await owner('GET', 'shop/recovery'))?.body, { phone: null, verified: false });
  assert.equal((await anon('GET', 'shop/recovery'))?.status, 401);
});


test('public sales form sends only to support with requester Reply-To', async () => {
  let sent: unknown[] = [];
  const deps = { store: {} as ShopStore, sms: { send: async () => ({ delivery: 'sent' as const }) }, linkBase: '', newToken: () => '',
    claimSalesRequest: async () => true,
    email: { send: async (...args: unknown[]) => { sent = args; return { delivery: 'sent' as const }; } } };
  const ctx = { userId: null, now: () => new Date() } as Ctx;
  const body = { name: 'Tyler', email: 'Owner@shop.com', shop: 'Test Shop', phone: '555-123-4567', message: 'Can we schedule a demo?', to: 'attacker@example.com' };
  const send = (data: unknown, d = deps) => shopRoute(ctx, d, 'POST', ['shop', 'sales'], data);
  assert.equal((await send(body))?.status, 200);
  assert.equal(sent[0], 'support@talkshops.app');
  assert.deepEqual(sent[3], { replyTo: 'owner@shop.com' });
  assert.match(String(sent[2]), /Test Shop/);
  assert.match(String(sent[2]), /schedule a demo/);
  sent = [];
  assert.equal((await send({ ...body, email: 'bad\r\nBcc: x@example.com' }))?.status, 400);
  assert.equal((await send({ ...body, message: 'x'.repeat(4001) }))?.status, 400);
  assert.equal((await send({ ...body, website: 'spam' }))?.status, 200);
  assert.equal(sent.length, 0);
  assert.equal((await send(body, { ...deps, claimSalesRequest: async () => false }))?.status, 429);
  assert.equal(sent.length, 0);
  assert.equal((await send(body, { ...deps, email: { send: async () => ({ delivery: 'failed' as any }) } }))?.status, 502);
});
