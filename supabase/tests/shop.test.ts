// Repair shop API against in-memory storage: `node --test supabase/tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import {
  archivedAt, archiveSearchText, createTwilioSender, normalizePhone, shopRoute, type Job, type Shop, type ShopDeps, type ShopStore,
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
      return [...jobs.values()].filter((j) => j.shopId === shopId && ((j.stage !== 'picked_up' && !j.data.closed) || j.updatedAt >= since)).map(clone);
    },
    async getJob(id) { const j = jobs.get(id); return j ? clone(j) : null; },
    async jobByToken(t) { const j = [...jobs.values()].find((x) => x.token === t); return j ? clone(j) : null; },
    async putJob(j) { jobs.set(j.id, clone(j)); },
    async deleteJob(id) { jobs.delete(id); },
    async saveIntake(id, intake) {
      const j = jobs.get(id)!;
      if (j.intake || j.stage !== 'invited') return false;
      j.intake = clone(intake); return true;
    },
    async intakePhoto(id, photo, remove) {
      const j = jobs.get(id)!;
      const photos = j.intakePhotos ??= [];
      if (remove) { j.intakePhotos = photos.filter(p => p.id !== remove); return true; }
      if (!photo || !['invited','checked_in'].includes(j.stage)) return false;
      if (photos.some(p => p.src === photo.src)) return true;
      if (photos.length >= 6) return false;
      photos.push(clone(photo)); return true;
    },
    async saveBill(id, bill, pdf) {
      const job = jobs.get(id)!;
      job.bill = clone(bill);
      if (pdf === null) billFiles.delete(id); else billFiles.set(id, pdf);
    },
    async getBillPdf(id) { return billFiles.get(id) ?? null; },
    async searchArchive(shopId, since, terms, limit) {
      return [...jobs.values()].filter((j) => j.shopId === shopId && archivedAt(j) && archivedAt(j)! >= since && terms.every((t) => archiveSearchText(j).includes(t)))
        .sort((a, b) => archivedAt(b)!.localeCompare(archivedAt(a)!)).slice(0, limit)
        .map((j) => ({ id: j.id, ro: j.data.ro, archivedAt: archivedAt(j)!, createdAt: j.createdAt, customer: j.data.customer, vehicle: j.data.vehicle, plate: j.data.plate, concern: j.data.concern, total: j.bill?.total ?? 0, closedReason: j.data.closed?.reason ?? null }));
    },
    async purgeArchive(shopId, before) {
      for (const [id, j] of jobs) if (j.shopId === shopId && archivedAt(j) && archivedAt(j)! < before) jobs.delete(id);
    },
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
  return { as, texts, jobs, shops, deps, tick: (ms: number) => { clock += ms; } };
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

test('customer invitation, input and photos stay with the repair through check-in', async () => {
  const { as, texts } = world();
  const staff = as('owner'), customer = as(null);
  await staff('POST','shop/me',{name:'North Auto'});
  const request = {invite:true, customer:checkIn.customer};
  assert.equal((await staff('POST','shop/jobs',{...request,customer:{...checkIn.customer,consent:false}}))?.status,400);
  const invited = (await staff('POST','shop/jobs',request))?.body as {id:string;stage:string;link:string};
  assert.equal(invited.stage,'invited');
  assert.ok(texts[0].body.includes(invited.link));
  const path = 'shop/jobs/'+invited.id, link = 'shop/c/'+invited.link.split('?c=')[1];
  assert.equal((await staff('POST',path+'/stage',{stage:'checked_in'}))?.status,400);
  assert.equal((await customer('POST',link+'/intake',checkIn))?.status,200);
  assert.equal((await customer('POST',link+'/intake',{...checkIn,concern:'Repeated'}))?.status,400);
  const payload={src:'data:image/jpeg;base64,/9j/2Q==',cap:'Warning light'};
  for (let i=0;i<2;i++) assert.equal((await customer('POST',link+'/intake-photo',payload))?.status,200);
  const viewed = (await staff('GET',path))?.body as Job['data'];
  assert.equal(viewed.vehicle.model,'Civic');
  assert.equal(viewed.concern,checkIn.concern);
  assert.equal(viewed.photos.length,1);
  assert.equal(viewed.photos[0].source,'customer');
  assert.equal((await staff('POST',path+'/stage',{stage:'checked_in'}))?.status,200);
  assert.equal((await staff('POST',path+'/stage',{stage:'diagnosing'}))?.status,200);
  assert.equal((await customer('POST',link+'/intake-photo',payload))?.status,400);
  assert.equal((await staff('POST',path+'/remove-photo',{id:viewed.photos[0].id}))?.status,200);
  const final=(await customer('GET',link))?.body as {photos:unknown[];vehicle:string};
  assert.equal(final.photos.length,0);
  assert.equal(final.vehicle,'2018 Honda Civic');
});

test('email-only check-in and dual-channel repair messages record independent outcomes', async () => {
  const { as, texts, deps } = world();
  const owner = as('owner'), emails: string[] = [];
  deps.email = { async send(to, subject, body) {
    assert.equal(to,'customer@example.test');
    assert.match(subject,/North Auto/);
    emails.push(body);
    return { delivery:'sent' };
  }};
  await owner('POST','shop/me',{name:'North Auto'});
  const contact = {name:'Customer',email:'customer@example.test',consent:true,preference:'email'};
  const emailJob = (await owner('POST','shop/jobs',{invite:true,customer:contact}))?.body as Job['data'] & {id:string; link:string};
  assert.equal(texts.length,0);
  assert.equal(emailJob.messages[0].channel,'email');
  assert.ok(emails[0].includes(emailJob.link));
  assert.equal((await owner('POST','shop/jobs',{invite:true,customer:{...contact,email:'bad'}}))?.status,400);
  const dual = (await owner('POST','shop/jobs',{...checkIn,customer:{...contact,preference:'both',phone:checkIn.customer.phone}}))?.body as Job['data'] & {id:string;link:string};
  assert.equal(texts.length,1);
  assert.equal(dual.messages.length,2);
  deps.email = undefined;
  const updated = (await owner('POST','shop/jobs/'+dual.id+'/stage',{stage:'diagnosing',send:true,text:'Inspection has started.'}))?.body as Job['data'];
  assert.deepEqual(updated.messages.slice(-2).map(m=>[m.channel,m.delivery]),[['sms','sent'],['email','not_sent']]);
  assert.ok(updated.messages.at(-1)?.text.includes(dual.link));
  const noConsent=(await owner('POST','shop/jobs',{...checkIn,customer:{...contact,consent:false}}))?.body as Job['data'];
  assert.equal(noConsent.messages[0].delivery,'not_sent');
});

test('customer emails show the shop as sender, reply to the shop, and explain failures', async () => {
  const { createShopEmailSender } = await import('../functions/_shared/shopEmail.ts');
  let sent: Record<string, unknown> = {};
  const ok = (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
  const mail = createShopEmailSender('re_key', 'Talk Shops <updates@talkshops.app>', ok)!;
  assert.equal((await mail.send('a@b.co', 'Hi', 'Body', { fromName: 'Ridgeline "Auto"', replyTo: 'dan@ridgeline.com' })).delivery, 'sent');
  assert.equal(sent.from, '"Ridgeline Auto via Talk Shops" <updates@talkshops.app>');
  assert.equal(sent.reply_to, 'dan@ridgeline.com');
  await mail.send('a@b.co', 'Hi', 'Body');
  assert.equal(sent.from, 'Talk Shops <updates@talkshops.app>');
  assert.equal('reply_to' in sent, false);
  const bad = (async () => new Response(JSON.stringify({ name: 'validation_error', message: 'The talkshops.app domain is not verified.' }), { status: 403 })) as unknown as typeof fetch;
  const r = await createShopEmailSender('re_key', 'updates@talkshops.app', bad)!.send('a@b.co', 'Hi', 'Body');
  assert.equal(r.delivery, 'failed');
  assert.match(r.note!, /403.*not verified/);
  assert.equal(createShopEmailSender(undefined, 'x@y.z'), undefined);
});

test('shop email is saved, validated, and kept when another screen saves the shop', async () => {
  const { as } = world();
  const dan = as('user-dan');
  assert.equal((await dan('POST', 'shop/me', { name: 'Ridgeline', email: 'not-an-email' }))?.status, 400);
  await dan('POST', 'shop/me', { name: 'Ridgeline', email: 'dan@ridgeline.com' });
  await dan('POST', 'shop/me', { name: 'Ridgeline', phone: '555', hours: '9-5', rates: [] });
  assert.equal(((await dan('GET', 'shop/me'))?.body as { shop: { email: string } }).shop.email, 'dan@ridgeline.com');
});

test('picked-up cars go to a searchable archive and are deleted after a year', async () => {
  const { as, jobs, tick } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const a = (await dan('POST', 'shop/jobs', checkIn))?.body as { id: string; ro: string };
  const b = (await dan('POST', 'shop/jobs', { ...checkIn, customer: { name: 'Sam Ortiz', phone: '555-777-1234', consent: false }, vehicle: { year: '2015', make: 'Ford', model: 'F-150' } }))?.body as { id: string };
  await dan('POST', `shop/jobs/${a.id}/stage`, { stage: 'picked_up' });
  const search = async (q: string) => ((await dan('POST', 'shop/archive', { q }))?.body as { rows: { id: string }[] }).rows.map((r) => r.id);
  assert.deepEqual(await search(''), [a.id], 'only picked-up cars are archived');
  assert.deepEqual(await search('maria civic'), [a.id]);
  assert.deepEqual(await search('(555) 013-6620'), [a.id], 'phone search ignores punctuation');
  assert.deepEqual(await search(a.ro.toLowerCase()), [a.id]);
  assert.deepEqual(await search('7KDL'), [a.id]);
  assert.deepEqual(await search('ford'), []);
  assert.equal(((await as('user-other')('POST', 'shop/archive', { q: '' }))?.status), 409);

  tick(200 * 86_400_000);
  await dan('POST', `shop/jobs/${b.id}/stage`, { stage: 'picked_up' });
  assert.deepEqual(await search(''), [b.id, a.id], 'newest pickup first');
  tick(170 * 86_400_000);
  assert.deepEqual(await search(''), [b.id], 'a year after pickup the car is deleted');
  assert.ok(!jobs.has(a.id));
  assert.ok(jobs.has(b.id));
});

test('estimate and bill lines can be saved to the shop list for next time', async () => {
  const { as, shops } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline', rates: [{ name: 'Shop supplies', kind: 'fee', rate: 12.5 }] });
  const job = (await dan('POST', 'shop/jobs', checkIn))?.body as { id: string };
  const rates = () => [...shops.values()][0].rates!.map((r) => `${r.kind}:${r.name}:${r.rate}`);
  await dan('POST', `shop/jobs/${job.id}/estimate`, { item: 'Wiper blades', price: 32 });
  assert.deepEqual(rates(), ['fee:Shop supplies:12.5'], 'not saved unless asked');
  await dan('POST', `shop/jobs/${job.id}/estimate`, { item: 'Cabin air filter', price: 28.5, save: true });
  await dan('POST', `shop/jobs/${job.id}/estimate`, { charge: { name: 'Brake labor', kind: 'labor', rate: 120, qty: 1.5 }, save: true });
  await dan('POST', `shop/jobs/${job.id}/estimate`, { item: 'shop supplies', price: 99, save: true });
  assert.deepEqual(rates(), ['fee:Shop supplies:12.5', 'part:Cabin air filter:28.5', 'labor:Brake labor:120'], 'names already saved are not duplicated');
  await dan('POST', `shop/jobs/${job.id}/bill`, { mode: 'generated', lines: [{ name: 'Disposal fee', kind: 'fee', rate: 5, qty: 1 }], save: true });
  assert.equal(rates().at(-1), 'fee:Disposal fee:5');
});

test('a repair the customer turned down can be closed into the archive, reopened, or deleted', async () => {
  const { as, jobs, tick } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const job = (await dan('POST', 'shop/jobs', checkIn))?.body as { id: string; link: string };
  assert.equal((await dan('POST', `shop/jobs/${job.id}/close`, {}))?.status, 400, 'needs a reason');
  const closed = (await dan('POST', `shop/jobs/${job.id}/close`, { reason: 'Customer declined the repair' }))?.body as { closed: { reason: string } };
  assert.equal(closed.closed.reason, 'Customer declined the repair');
  const rows = ((await dan('POST', 'shop/archive', { q: 'maria' }))?.body as { rows: { id: string; closedReason: string }[] }).rows;
  assert.deepEqual(rows.map((r) => [r.id, r.closedReason]), [[job.id, 'Customer declined the repair']]);
  const page = (await as(null)('GET', `shop/c/${job.link.split('?c=')[1]}`))?.body as { closed: boolean };
  assert.equal(page.closed, true);

  await dan('POST', `shop/jobs/${job.id}/reopen`, {});
  assert.equal(((await dan('POST', 'shop/archive', { q: '' }))?.body as { rows: unknown[] }).rows.length, 0, 'reopened cars leave the archive');

  await dan('POST', `shop/jobs/${job.id}/close`, { reason: 'Other' });
  tick(3 * 86_400_000);
  assert.equal(((await dan('GET', 'shop/jobs'))?.body as unknown[]).length, 0, 'closed cars leave the board');
  assert.equal((await as('user-other')('DELETE', `shop/jobs/${job.id}`))?.status, 409);
  assert.equal((await dan('DELETE', `shop/jobs/${job.id}`))?.status, 200);
  assert.ok(!jobs.has(job.id));
  assert.equal((await dan('GET', `shop/jobs/${job.id}`))?.status, 404);
});

test('technician notes show on the customer page and can text the customer', async () => {
  const { as, texts } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const job = (await dan('POST', 'shop/jobs', checkIn))?.body as { id: string; link: string };
  const sent = texts.length;
  assert.equal((await dan('POST', `shop/jobs/${job.id}/note`, { text: '  ' }))?.status, 400);
  const a = (await dan('POST', `shop/jobs/${job.id}/note`, { text: 'Front pads are at 2mm.' }))?.body as { notes: { id: string }[] };
  assert.equal(texts.length, sent, 'no text unless asked');
  await dan('POST', `shop/jobs/${job.id}/note`, { text: 'Rotors are scored too.', send: true });
  assert.equal(texts.length, sent + 1);
  assert.match(texts.at(-1)!.body, /Rotors are scored too\. Details: https:/);
  const token = job.link.split('?c=')[1];
  let page = (await as(null)('GET', `shop/c/${token}`))?.body as { notes: { text: string }[] };
  assert.deepEqual(page.notes.map((n) => n.text), ['Front pads are at 2mm.', 'Rotors are scored too.']);
  await dan('POST', `shop/jobs/${job.id}/remove-note`, { id: a.notes[0].id });
  page = (await as(null)('GET', `shop/c/${token}`))?.body as { notes: { text: string }[] };
  assert.deepEqual(page.notes.map((n) => n.text), ['Rotors are scored too.']);
});
