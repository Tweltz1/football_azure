// Talk Shops free trial and Stripe plans against in-memory storage: `node --test supabase/tests/shopPlans.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import { shopRoute, stripeWebhook, type Job, type Shop, type ShopDeps, type ShopStore } from '../functions/_shared/shop.ts';
import { access, checkoutFields, DEFAULT_TRIAL, trialKeys, trialNoticeDue, type PlanState, type TrialSettings } from '../functions/_shared/shopPlans.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const DAY = 86_400_000;

function world(trial: TrialSettings = { trialDays: 15, trialTexts: 3, trialCars: 2 }) {
  const shops = new Map<string, Shop>();
  const jobs = new Map<string, Job>();
  const texts: string[] = [];
  const stripeCalls: { path: string; fields: Record<string, string> | null }[] = [];
  const subs = new Map<string, Record<string, unknown>>();
  let clock = Date.parse('2026-11-08T15:00:00Z');
  let n = 0;
  const plan = (id: string) => shops.get(id)!.plan!;
  const store: ShopStore = {
    async shopByOwner(o) { const s = [...shops.values()].find((x) => x.ownerId === o); return s ? clone(s) : null; },
    async shopById(id) { const s = shops.get(id); return s ? clone(s) : null; },
    async putShop(s) {
      const old = shops.get(s.id);
      // Like the database: a new row starts on the 30-day trial default; plan columns aren't written by putShop.
      const p: PlanState = old?.plan ?? { plan: 'trial', status: 'trialing', trialEndsAt: new Date(clock + 30 * DAY).toISOString(), textsUsed: 0, textsPeriod: '', carsCreated: 0 };
      shops.set(s.id, { ...clone(s), plan: p });
    },
    async listJobs(shopId) { return [...jobs.values()].filter((j) => j.shopId === shopId).map(clone); },
    async getJob(id) { const j = jobs.get(id); return j ? clone(j) : null; },
    async jobByToken(t) { const j = [...jobs.values()].find((x) => x.token === t); return j ? clone(j) : null; },
    async putJob(j) { jobs.set(j.id, clone(j)); },
    async nextRo(shopId) { const p = plan(shopId); p.carsCreated++; return 1000 + p.carsCreated; },
    async trialSettings() { return trial; },
    async startTrial(id, endsAt) { Object.assign(plan(id), { plan: 'trial', status: 'trialing', trialEndsAt: endsAt }); },
    async useTexts(id, k, period, limit) {
      const p = plan(id);
      const used = p.textsPeriod === period ? p.textsUsed : 0;
      if (limit !== null && used + k > limit) return false;
      p.textsUsed = used + k; p.textsPeriod = period; return true;
    },
    async setPlan(id, patch) { Object.assign(plan(id), patch); },
  };
  const deps: ShopDeps = {
    store,
    sms: { async send(_to, body) { texts.push(body); return { delivery: 'sent' }; } },
    linkBase: 'https://talkshops.app/?c=',
    newToken: () => `tok${String(++n).padStart(17, '0')}`,
    siteUrl: 'https://talkshops.app',
    stripeWebhookSecret: 'whsec_test',
    stripe: {
      async call(path, fields) {
        stripeCalls.push({ path, fields });
        if (path === 'checkout/sessions') return { url: 'https://checkout.stripe.com/c/pay/cs_test_1' };
        if (path === 'billing_portal/sessions') return { url: 'https://billing.stripe.com/p/session/1' };
        if (path.startsWith('subscriptions/')) return subs.get(decodeURIComponent(path.slice(14))) ?? {};
        throw new Error('unexpected ' + path);
      },
    },
  };
  const as = (userId: string | null) => (method: string, path: string, body?: unknown) => {
    clock += 60_000;
    const ctx = { userId, userEmail: userId ? `${userId}@shop.test` : undefined, now: () => new Date(clock), newId: () => `id${++n}`, log: { info() {}, warn() {}, error() {} } } as unknown as Ctx;
    return shopRoute(ctx, deps, method, path.split('/'), body ?? null);
  };
  return { as, deps, shops, texts, stripeCalls, subs, now: () => new Date(clock), tick: (ms: number) => { clock += ms; } };
}

const car = { customer: { name: 'Maria Delgado', phone: '(555) 013-6620', consent: true }, vehicle: { make: 'Honda', model: 'Civic' }, concern: 'Brakes' };

async function signed(raw: string, secret: string, t: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)));
  return `t=${t},v1=${[...mac].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

test('shops made before plans existed have no limits', () => {
  const a = access({ plan: null, status: '', trialEndsAt: null, textsUsed: 0, textsPeriod: '', carsCreated: 0 }, new Date(), DEFAULT_TRIAL);
  assert.equal(a.state, 'free');
  assert.equal(a.canWork, true);
  assert.equal(a.textLimit, null);
});

test('a new shop gets the trial length from settings, with car and text limits', async () => {
  const w = world();
  const dan = w.as('dan');
  const setup = await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const plan = (setup?.body as { plan: { state: string; daysLeft: number; textLimit: number; carLimit: number } }).plan;
  assert.equal(plan.state, 'trial');
  assert.equal(plan.daysLeft, 15);
  assert.equal(plan.textLimit, 3);
  assert.ok(!JSON.stringify(setup?.body).includes('stripe'), 'shop response has no billing ids');

  const first = await dan('POST', 'shop/jobs', car);
  assert.equal(first?.status, 200);
  const id = (first?.body as { id: string }).id;
  await dan('POST', `shop/jobs/${id}/message`, { text: 'one' });
  const third = await dan('POST', `shop/jobs/${id}/message`, { text: 'two' });
  assert.equal(w.texts.length, 3);
  const over = await dan('POST', `shop/jobs/${id}/message`, { text: 'three' });
  const last = (over?.body as { messages: { delivery: string; note?: string }[] }).messages.at(-1)!;
  assert.equal(third?.status, 200);
  assert.equal(last.delivery, 'not_sent');
  assert.match(last.note!, /includes 3 texts/);
  assert.equal(w.texts.length, 3, 'no fourth text went out');

  assert.equal((await dan('POST', 'shop/jobs', car))?.status, 200);
  const third_car = await dan('POST', 'shop/jobs', car);
  assert.equal(third_car?.status, 402);
  assert.match(String(third_car?.body), /includes 2 cars/);
});

function claims(w: ReturnType<typeof world>) {
  const used = new Map<string, string>();
  w.deps.store.claimTrial = async (keys, shopId) => { const fresh = !keys.some((k) => used.has(k)); for (const k of keys) if (!used.has(k)) used.set(k, shopId); return fresh; };
  return used;
}

test('each shop phone gets one free trial', async () => {
  const w = world();
  claims(w);
  type Out = { plan: { state: string }; trialUsed?: boolean };
  assert.equal((await w.as('dan')('POST', 'shop/me', { name: 'Ridgeline' }))?.status, 400, 'a new shop needs a phone');
  const first = (await w.as('dan')('POST', 'shop/me', { name: 'Ridgeline', phone: '(555) 014-2290' }))?.body as Out;
  assert.equal(first.plan.state, 'trial');
  assert.equal(first.trialUsed, undefined);
  // Editing the first shop doesn't need the check again.
  assert.equal((await w.as('dan')('POST', 'shop/me', { name: 'Ridgeline', phone: '' }))?.status, 200);
  const again = (await w.as('dan2')('POST', 'shop/me', { name: 'Ridgeline Two', phone: '+1 555-014-2290' }))?.body as Out;
  assert.equal(again.plan.state, 'trial_ended');
  assert.equal(again.trialUsed, true);
  const other = (await w.as('eve')('POST', 'shop/me', { name: 'Elsewhere', phone: '555-014-9999' }))?.body as Out;
  assert.equal(other.plan.state, 'trial');
});

test('each sign-in email and account gets one free trial, whatever the phone', async () => {
  const w = world();
  const used = claims(w);
  type Out = { plan: { state: string }; trialUsed?: boolean };
  const first = (await w.as('dan')('POST', 'shop/me', { name: 'Ridgeline', phone: '555-014-2290' }))?.body as Out;
  assert.equal(first.plan.state, 'trial');
  assert.ok(used.has('email:dan@shop.test') && used.has('user:dan') && used.has('+15550142290'));
  // Same email (another account in a test world can't share it, so claim it by hand), new phone.
  used.set('email:eve@shop.test', 'old-shop');
  const eve = (await w.as('eve')('POST', 'shop/me', { name: 'Eve Auto', phone: '555-014-7777' }))?.body as Out;
  assert.equal(eve.plan.state, 'trial_ended');
  assert.equal(eve.trialUsed, true);
});

test('trial keys fold email tricks together', () => {
  assert.deepEqual(trialKeys({ phone: '+15550142290', email: ' J.Doe+shop2@GoogleMail.com ', userId: 'u1' }), ['+15550142290', 'email:jdoe@gmail.com', 'user:u1']);
  assert.deepEqual(trialKeys({ email: 'a.b+x@shop.co' }), ['email:a.b@shop.co']);
  assert.deepEqual(trialKeys({ email: 'nope' }), []);
});

test('trial reminder emails: one 3 days before, one after it ends', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const p = (endsInDays: number): PlanState => ({ plan: 'trial', status: 'trialing', trialEndsAt: new Date(now.getTime() + endsInDays * DAY).toISOString(), textsUsed: 0, textsPeriod: '', carsCreated: 0 });
  assert.equal(trialNoticeDue(p(5), null, now), null);
  assert.equal(trialNoticeDue(p(2.5), null, now), 'soon');
  assert.equal(trialNoticeDue(p(2.5), 'soon', now), null);
  assert.equal(trialNoticeDue(p(-0.5), 'soon', now), 'ended');
  assert.equal(trialNoticeDue(p(-0.5), null, now), 'ended');
  assert.equal(trialNoticeDue(p(-0.5), 'ended', now), null);
  assert.equal(trialNoticeDue(p(-5), null, now), null, 'long-ended trials get no late email');
  assert.equal(trialNoticeDue({ ...p(1), plan: 'starter', status: 'active' }, null, now), null);
});

test('the hourly run emails the owner before and after the trial ends', async () => {
  const w = world();
  await w.as('dan')('POST', 'shop/me', { name: 'Ridgeline', email: 'dan@ridgeline.test' });
  const shopId = [...w.shops.keys()][0];
  const notices = new Map<string, string>();
  const mail: { to: string; subject: string; text: string }[] = [];
  w.deps.email = { async send(to, subject, text) { mail.push({ to, subject, text }); return { delivery: 'sent' }; } };
  w.deps.store.cronShops = async () => [];
  w.deps.store.trialNoticeShops = async () => [...w.shops.values()].map((shop) => ({ shop: clone(shop), sent: notices.get(shop.id) ?? null }));
  w.deps.store.setTrialNotice = async (id, n) => { notices.set(id, n); };
  const log = { info() {}, warn() {}, error() {} };
  const { runCron } = await import('../functions/_shared/shop.ts');
  assert.equal((await runCron(w.deps, w.now(), log)).trialNotices, 0);
  w.tick(13 * DAY);
  assert.equal((await runCron(w.deps, w.now(), log)).trialNotices, 1);
  assert.equal((await runCron(w.deps, w.now(), log)).trialNotices, 0, 'only once');
  assert.match(mail[0].subject, /ends in 2 days/);
  assert.equal(mail[0].to, 'dan@ridgeline.test');
  w.tick(3 * DAY);
  assert.equal((await runCron(w.deps, w.now(), log)).trialNotices, 1);
  assert.match(mail[1].subject, /has ended/);
  assert.match(mail[1].text, /talkshops\.app\/plan/);
  assert.equal(notices.get(shopId), 'ended');
});

test('when the trial ends the shop is locked until it chooses a plan', async () => {
  const w = world();
  const dan = w.as('dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const id = ((await dan('POST', 'shop/jobs', car))?.body as { id: string }).id;
  w.tick(16 * DAY);
  assert.equal((await dan('GET', 'shop/jobs'))?.status, 402, 'the board is locked');
  assert.equal((await dan('GET', 'shop/bookings'))?.status, 402);
  assert.equal((await dan('POST', `shop/jobs/${id}/message`, { text: 'hi' }))?.status, 402);
  assert.equal((await dan('POST', 'shop/jobs', car))?.status, 402);
  const plan = (await dan('GET', 'shop/plan'))?.body as { state: string; canWork: boolean };
  assert.equal(plan.state, 'trial_ended');
  assert.equal(plan.canWork, false);
  // The owner can still choose a plan and download their data.
  assert.equal((await dan('POST', 'shop/plan/checkout', { plan: 'starter' }))?.status, 200);
  w.deps.store.reportJobs = (shopId) => w.deps.store.listJobs(shopId, '');
  assert.equal((await dan('POST', 'shop/export', { kind: 'jobs' }))?.status, 200);
  // The customer's link keeps working.
  const token = [...(await w.deps.store.listJobs(w.shops.values().next().value!.id, ''))][0].token;
  assert.equal((await w.as(null)('GET', `shop/c/${token}`))?.status, 200);
});

test('upgrading goes through Stripe Checkout and only a signed webhook marks the shop paid', async () => {
  const w = world();
  const dan = w.as('dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline', email: 'dan@ridgeline.test' });
  const shopId = [...w.shops.keys()][0];

  const checkout = await dan('POST', 'shop/plan/checkout', { plan: 'starter', interval: 'year' });
  assert.equal(checkout?.status, 200);
  assert.equal((checkout?.body as { url: string }).url, 'https://checkout.stripe.com/c/pay/cs_test_1');
  const f = w.stripeCalls[0].fields!;
  assert.equal(f['line_items[0][price_data][unit_amount]'], '89000');
  assert.equal(f['line_items[0][price_data][recurring][interval]'], 'year');
  assert.equal(f['subscription_data[metadata][shop_id]'], shopId);
  assert.equal(f.customer_email, 'dan@ridgeline.test');
  assert.ok(f['subscription_data[trial_end]'], 'paying early keeps the rest of the trial');

  w.subs.set('sub_1', { id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { shop_id: shopId, plan: 'starter' }, items: { data: [{ current_period_end: 1800000000, price: { recurring: { interval: 'year' } } }] } });
  const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1' } } });
  const t = Math.floor(w.now().getTime() / 1000);
  const log = { info() {}, warn() {}, error() {} };

  assert.equal((await stripeWebhook(w.deps, raw, await signed(raw, 'wrong', t), w.now(), log)).status, 400);
  assert.equal((await stripeWebhook(w.deps, raw, await signed(raw, 'whsec_test', t - 3600), w.now(), log)).status, 400, 'old signatures are refused');
  assert.equal(w.shops.get(shopId)!.plan!.plan, 'trial');

  assert.equal((await stripeWebhook(w.deps, raw, await signed(raw, 'whsec_test', t), w.now(), log)).status, 200);
  const p = w.shops.get(shopId)!.plan!;
  assert.equal(p.plan, 'starter');
  assert.equal(p.status, 'active');
  assert.equal(p.interval, 'year');
  assert.equal(p.stripeCustomerId, 'cus_1');

  w.tick(40 * DAY);
  const plan = (await dan('GET', 'shop/plan'))?.body as { state: string; textLimit: number };
  assert.equal(plan.state, 'active');
  assert.equal(plan.textLimit, 1000);
  assert.equal((await dan('POST', 'shop/jobs', car))?.status, 200);
  assert.equal((await dan('POST', 'shop/plan/checkout', { plan: 'pro' }))?.status, 409);
  assert.equal(((await dan('POST', 'shop/plan/portal'))?.body as { url: string }).url, 'https://billing.stripe.com/p/session/1');

  // Canceled in the portal: Stripe sends customer.subscription.deleted.
  w.subs.set('sub_1', { ...w.subs.get('sub_1'), status: 'canceled' });
  const gone = JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
  await stripeWebhook(w.deps, gone, await signed(gone, 'whsec_test', Math.floor(w.now().getTime() / 1000)), w.now(), log);
  assert.equal(((await dan('GET', 'shop/plan'))?.body as { state: string }).state, 'canceled');
  assert.equal((await dan('POST', 'shop/jobs', car))?.status, 402);
});

test('checkout skips the trial carry-over when less than two days remain', () => {
  const now = new Date('2026-11-08T00:00:00Z');
  const f = checkoutFields({ shopId: 's', plan: 'pro', interval: 'month', siteUrl: 'https://talkshops.app', trialEndsAt: '2026-11-09T00:00:00Z', now });
  assert.equal(f['subscription_data[trial_end]'], undefined);
  assert.equal(f['line_items[0][price_data][unit_amount]'], '14900');
});
