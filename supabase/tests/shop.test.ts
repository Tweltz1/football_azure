// Repair shop API against in-memory storage: `node --test supabase/tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import {
  createTwilioSender, normalizePhone, shopRoute, type Job, type Shop, type ShopDeps, type ShopStore,
} from '../functions/_shared/shop.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function world() {
  const shops = new Map<string, Shop>();
  const jobs = new Map<string, Job>();
  const billFiles = new Map<string, string>();
  const ro = new Map<string, number>();
  const texts: { to: string; body: string }[] = [];
  let clock = Date.parse('2026-11-07T15:00:00Z');
  let n = 0;
  const store: ShopStore = {
    async shopByOwner(owner) { const s = [...shops.values()].find((x) => x.ownerId === owner); return s ? clone(s) : null; },
    async shopById(id) { const s = shops.get(id); return s ? clone(s) : null; },
    async putShop(s) { shops.set(s.id, clone(s)); },
    async listJobs(shopId, since) {
      return [...jobs.values()].filter((j) => j.shopId === shopId && (j.stage !== 'picked_up' || j.updatedAt >= since)).map(clone);
    },
    async getJob(id) { const j = jobs.get(id); return j ? clone(j) : null; },
    async jobByToken(t) { const j = [...jobs.values()].find((x) => x.token === t); return j ? clone(j) : null; },
    async putJob(j) { jobs.set(j.id, clone(j)); },
    async saveBill(id, bill, pdf) {
      const job = jobs.get(id)!;
      job.bill = clone(bill);
      if (pdf === null) billFiles.delete(id); else billFiles.set(id, pdf);
    },
    async getBillPdf(id) { return billFiles.get(id) ?? null; },
    async nextRo(shopId) { const v = ro.get(shopId) ?? 1001; ro.set(shopId, v + 1); return v; },
  };
  const deps: ShopDeps = {
    store,
    sms: { async send(to, body) { texts.push({ to, body }); return { delivery: 'sent' }; } },
    linkBase: 'https://hood-league.com/shop/?c=',
    newToken: () => `tok${String(++n).padStart(24, '0')}`,
  };
  const as = (userId: string | null) => (method: string, path: string, body?: unknown) => {
    clock += 60_000;
    const ctx = { userId, now: () => new Date(clock), newId: () => `id${++n}`, log: { info() {}, warn() {}, error() {} } } as unknown as Ctx;
    return shopRoute(ctx, deps, method, path.split('/'), body ?? null);
  };
  return { as, texts, jobs };
}

const checkIn = {
  customer: { name: 'Maria Delgado', phone: '(555) 013-6620', consent: true },
  vehicle: { year: '2018', make: 'Honda', model: 'Civic' },
  plate: '7kdl294',
  concern: 'Grinding noise when braking',
};

test('shop setup, check-in texts the customer a link, and the link works without signing in', async () => {
  const { as, texts } = world();
  const dan = as('user-dan');
  assert.equal((await dan('POST', 'shop/jobs', checkIn))?.status, 409);
  assert.equal((await dan('POST', 'shop/me', { name: 'Ridgeline Auto Repair', phone: '(555) 014-2290', hours: '7:30am-6pm' }))?.status, 200);

  const res = await dan('POST', 'shop/jobs', checkIn);
  assert.equal(res?.status, 200);
  const job = res?.body as { id: string; ro: string; link: string; plate: string; messages: { delivery: string }[] };
  assert.equal(job.ro, 'RO-1001');
  assert.equal(job.plate, '7KDL294');
  assert.equal(texts.length, 1);
  assert.equal(texts[0].to, '+15550136620');
  assert.match(texts[0].body, /Ridgeline Auto Repair has your 2018 Honda Civic/);
  assert.ok(texts[0].body.includes(job.link));
  assert.equal(job.messages[0].delivery, 'sent');

  const token = job.link.split('?c=')[1];
  const page = await as(null)('GET', `shop/c/${token}`);
  assert.equal(page?.status, 200);
  const view = page?.body as Record<string, unknown>;
  assert.equal(view.vehicle, '2018 Honda Civic');
  assert.equal(view.firstName, 'Maria');
  assert.ok(!JSON.stringify(view).includes('6620'), 'customer page must not show the phone number');
});

test('estimate approval from the customer link', async () => {
  const { as } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const job = (await dan('POST', 'shop/jobs', checkIn))?.body as { id: string; link: string };
  const token = job.link.split('?c=')[1];

  assert.equal((await dan('POST', `shop/jobs/${job.id}/stage`, { stage: 'approval' }))?.status, 400, 'needs an estimate first');
  await dan('POST', `shop/jobs/${job.id}/estimate`, { item: 'Front pads and rotors', price: '389' });
  const withLines = (await dan('POST', `shop/jobs/${job.id}/estimate`, { item: 'Brake fluid flush', price: 119 }))?.body as { estimate: { id: string }[] };
  const [a, b] = withLines.estimate.map((e) => e.id);

  const customer = as(null);
  assert.equal((await customer('POST', `shop/c/${token}/decision`, { decisions: { [a]: 'approved', [b]: 'declined' }, signature: 'Maria Delgado' }))?.status, 400, 'not sent for approval yet');

  await dan('POST', `shop/jobs/${job.id}/stage`, { stage: 'approval', send: true, text: 'Please review' });
  assert.equal((await customer('POST', `shop/c/${token}/decision`, { decisions: { [a]: 'approved' }, signature: 'Maria Delgado' }))?.status, 400, 'every line needs a choice');
  const done = await customer('POST', `shop/c/${token}/decision`, { decisions: { [a]: 'approved', [b]: 'declined' }, signature: 'Maria Delgado' });
  assert.equal(done?.status, 200);

  const shopView = (await dan('GET', `shop/jobs/${job.id}`))?.body as { estimate: { status: string }[]; approval: { by: string }; messages: { dir: string; text: string }[] };
  assert.deepEqual(shopView.estimate.map((e) => e.status), ['approved', 'declined']);
  assert.equal(shopView.approval.by, 'Maria Delgado');
  assert.match(shopView.messages.at(-1)!.text, /Approved 1 of 2/);
});

test('shops only see their own cars, and bad links are rejected', async () => {
  const { as } = world();
  const dan = as('user-dan');
  const other = as('user-other');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  await other('POST', 'shop/me', { name: 'Elsewhere Garage' });
  const job = (await dan('POST', 'shop/jobs', checkIn))?.body as { id: string };
  assert.equal((await other('GET', `shop/jobs/${job.id}`))?.status, 404);
  assert.equal(((await other('GET', 'shop/jobs'))?.body as unknown[]).length, 0);
  assert.equal((await as(null)('GET', 'shop/jobs'))?.status, 401);
  assert.equal((await as(null)('GET', 'shop/c/short'))?.status, 404);
  assert.equal((await as(null)('GET', `shop/c/${'x'.repeat(30)}`))?.status, 404);
});

test('no texts without consent, and texting reports when Twilio is not set up', async () => {
  const { as, texts } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const job = (await dan('POST', 'shop/jobs', { ...checkIn, customer: { ...checkIn.customer, consent: false } }))?.body as { messages: { delivery: string }[] };
  assert.equal(texts.length, 0);
  assert.equal(job.messages[0].delivery, 'not_sent');

  const unset = await createTwilioSender(undefined, undefined, undefined).send('+15550000000', 'hi');
  assert.equal(unset.delivery, 'not_sent');
  let called = '';
  const fake = (async (url: string) => { called = url; return new Response('{}', { status: 201 }); }) as unknown as typeof fetch;
  const sent = await createTwilioSender('AC1', 'secret', '+15550001111', fake).send('+15550000000', 'hi');
  assert.equal(sent.delivery, 'sent');
  assert.match(called, /Accounts\/AC1\/Messages\.json$/);
});

test('phone numbers are normalized to E.164', () => {
  assert.equal(normalizePhone('(555) 013-6620'), '+15550136620');
  assert.equal(normalizePhone('1-555-013-6620'), '+15550136620');
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
  assert.equal(normalizePhone('12345'), null);
});

test('guided demo texts a visitor a real customer link, with limits', async () => {
  const { as, texts } = world();
  const visitor = as(null);
  assert.equal((await visitor('POST', 'shop/demo/text', { phone: '555-013-6620' }))?.status, 400, 'needs consent');
  const res = await visitor('POST', 'shop/demo/text', { phone: '555-013-6620', consent: true });
  assert.equal(res?.status, 200);
  const { token } = res?.body as { token: string };
  assert.equal(texts.length, 1);
  assert.ok(texts[0].body.includes(token));
  const page = (await visitor('GET', `shop/c/${token}`))?.body as { stage: string; estimate: { id: string }[] };
  assert.equal(page.stage, 'approval');
  const done = await visitor('POST', `shop/c/${token}/decision`, { decisions: { recharge: 'approved', condenser: 'declined' }, signature: 'Test Person' });
  assert.equal(done?.status, 200);

  assert.equal((await visitor('POST', 'shop/demo/text', { phone: '555-013-6620', consent: true }))?.status, 200);
  assert.equal((await visitor('POST', 'shop/demo/text', { phone: '555-013-6620', consent: true }))?.status, 429, 'two per number per day');
  for (let i = 0; i < 8; i++) await visitor('POST', 'shop/demo/text', { phone: `555-010-00${10 + i}`, consent: true });
  assert.equal((await visitor('POST', 'shop/demo/text', { phone: '555-010-0099', consent: true }))?.status, 429, 'daily cap of 10');
  assert.equal(texts.length, 10);
});

test('a refused text explains why, using Twilio\'s own message', async () => {
  const twilio = (async () => new Response(JSON.stringify({ code: 21608, message: 'The number +15550000000 is unverified. Trial accounts cannot send messages to unverified numbers.' }), { status: 400 })) as unknown as typeof fetch;
  const r = await createTwilioSender('AC1', 'secret', '+15550001111', twilio).send('+15550000000', 'hi');
  assert.equal(r.delivery, 'failed');
  assert.match(r.note!, /unverified.*Twilio error 21608/);
});

test('shop rates, quoted hours, pickup bill publication and PDF replacement', async () => {
  const { as } = world();
  const owner = as('shop-owner'), customer = as(null), other = as('another-owner');
  const rate = { name: 'Diagnostics', kind: 'labor', rate: 115.25 };
  await owner('POST', 'shop/me', { name: 'North Auto', rates: [rate] });
  await other('POST', 'shop/me', { name: 'Other shop' });
  const me = (await owner('POST', 'shop/me', { name: 'North Auto' }))?.body as {shop: Shop};
  assert.deepEqual(me.shop.rates, [rate]);
  const job = (await owner('POST', 'shop/jobs', checkIn))?.body as {id: string; link: string};
  const path = 'shop/jobs/' + job.id, link = 'shop/c/' + job.link.split('?c=')[1];
  const estimate = await owner('POST', path + '/estimate', {charge: {...rate, qty:1.5}});
  assert.equal((estimate?.body as Job['data']).estimate[0].price, 172.88);
  const lines = [{...rate, qty:2}, {name:'Disposal', kind:'fee', qty:1, rate:9.50}];
  const bill = {mode:'generated',lines};
  assert.equal((await other('POST', path + '/bill', bill))?.status, 404);
  assert.equal((await owner('POST', path + '/bill', bill))?.status, 200);
  assert.equal(((await customer('GET', link))?.body as Job).bill, null);
  const preview = (await owner('POST', path+'/preview', {stage:'ready'}))?.body as {text:string};
  assert.match(preview.text, /240\.00/);
  await owner('POST', path+'/stage', {stage:'ready'});
  const published = ((await customer('GET', link))?.body as Job).bill;
  assert.equal(published?.total, 240);
  assert.equal(published?.shopName, 'North Auto');
  assert.deepEqual(published?.lines, lines);
  const pdf = Buffer.from('%PDF-1.7\nexample').toString('base64');
  const upload = {mode:'upload',filename:'shop-invoice.pdf',pdf,total:199.50};
  assert.equal((await owner('POST',path+'/bill',{...upload,pdf:'invalid'}))?.status,400);
  assert.equal((await owner('POST',path+'/bill',upload))?.status,200);
  assert.ok(!JSON.stringify((await owner('GET','shop/jobs'))?.body).includes(pdf));
  assert.deepEqual((await customer('GET',link+'/bill-file'))?.body,{pdf});
  await owner('POST',path+'/bill',bill);
  assert.equal((await customer('GET',link+'/bill-file'))?.status,404);
});
