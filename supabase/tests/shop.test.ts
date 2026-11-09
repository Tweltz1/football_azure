// Repair shop API against in-memory storage: `node --test supabase/tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import {
  archivedAt, archiveSearchText, createTwilioSender, nextFollowup, normalizePhone, shopRoute, stopReminders, visitRow, type Job, type Shop, type ShopDeps, type ShopStore,
} from '../functions/_shared/shop.ts';
import type { PlanState } from '../functions/_shared/shopPlans.ts';
import { clearHowToLimits } from '../functions/_shared/shopHowTo.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function world() {
  const shops = new Map<string, Shop>();
  const jobs = new Map<string, Job>();
  const billFiles = new Map<string, string>();
  const followAt = new Map<string, string | null>();
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
    async putJob(j) { jobs.set(j.id, clone(j)); followAt.set(j.id, nextFollowup(j)); },
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
    async walkaround(id, op) {
      const j = jobs.get(id)!;
      let list = j.walkaround ?? [];
      if (op.photo) {
        if (j.stage === 'picked_up') return false;
        list = list.filter((p) => p.angle !== op.photo!.angle);
        if (list.length >= 8) return false;
        list.push(clone(op.photo));
      } else if (op.remove) {
        if (!list.some((p) => p.id === op.remove)) return false;
        list = list.filter((p) => p.id !== op.remove);
      } else if (op.marksFor) {
        const p = list.find((x) => x.id === op.marksFor);
        if (!p) return false;
        p.marks = clone(op.marks ?? []); if (op.aiAt) p.aiAt = op.aiAt;
      } else return false;
      j.walkaround = list; return true;
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
    async visits(shopId, q, limit) {
      return [...jobs.values()].filter((j) => j.shopId === shopId && (q.terms?.length ? q.terms.every((t) => archiveSearchText(j).includes(t))
        : (q.phone && j.data.customer.phone.endsWith(q.phone)) || (q.plate && (j.intake?.plate ?? j.data.plate) === q.plate) || (q.vin && j.data.vehicle.vin === q.vin)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((j) => visitRow(clone(j)));
    },
    async dueFollowups(shopId, now, limit) {
      return [...jobs.values()].filter((j) => j.shopId === shopId && followAt.get(j.id) && followAt.get(j.id)! <= now).slice(0, limit).map(clone);
    },
    async claimFollowup(id, at) { if (followAt.get(id) !== at) return false; followAt.set(id, null); return true; },
    async jobsWithFollowupsFor(phone) { return [...jobs.values()].filter((j) => j.data.customer.phone === phone && followAt.get(j.id)).map(clone); },
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

test('before and after walk-throughs show on the customer page and can notify the customer', async () => {
  const { as, texts } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const job = (await dan('POST', 'shop/jobs', checkIn))?.body as { id: string; link: string };
  const sent = texts.length;
  assert.equal((await dan('POST', `shop/jobs/${job.id}/walkthrough`, { kind: 'during', items: [{ key: 'tires', status: 'good' }] }))?.status, 400);
  assert.equal((await dan('POST', `shop/jobs/${job.id}/walkthrough`, { kind: 'before', items: [{ key: 'tires', status: 'meh' }] }))?.status, 400);
  const items = [
    { key: 'tires', status: 'good' }, { key: 'brakes', status: 'now', note: '  Front pads at 2mm  ' }, { key: 'wipers', status: 'soon' },
    { key: 'oil', status: 'good' }, { key: 'made-up', status: 'good' },
  ];
  const a = (await dan('POST', `shop/jobs/${job.id}/walkthrough`, { kind: 'before', items, mileage: '84,120 mi', summary: 'Brakes need work.' }))?.body as { walkthroughs: { before: { items: { key: string; note?: string }[]; mileage: string; sentAt?: string } } };
  assert.equal(texts.length, sent, 'no notice unless asked');
  assert.deepEqual(a.walkthroughs.before.items.map((i) => i.key), ['wipers', 'tires', 'brakes', 'oil'], 'kept in checklist order, unknown points dropped');
  assert.equal(a.walkthroughs.before.items.find((i) => i.key === 'brakes')!.note, 'Front pads at 2mm');
  assert.equal(a.walkthroughs.before.mileage, '84,120');
  assert.equal(a.walkthroughs.before.sentAt, undefined);
  await dan('POST', `shop/jobs/${job.id}/walkthrough`, { kind: 'after', items: [{ key: 'brakes', status: 'good' }, { key: 'tires', status: 'good' }], send: true });
  assert.equal(texts.length, sent + 1);
  assert.match(texts.at(-1)!.body, /Ridgeline finished the after-repair walk-through of your 2018 Honda Civic: 2 good\. See the full report: https:/);
  const token = job.link.split('?c=')[1];
  const page = (await as(null)('GET', `shop/c/${token}`))?.body as { walkthroughs: { before: { summary: string }; after: { sentAt: string } } };
  assert.equal(page.walkthroughs.before.summary, 'Brakes need work.');
  assert.ok(page.walkthroughs.after.sentAt);
});

test('walk-around photos: shop asks, customer uploads by angle, AI suggests, shop confirms, customer sees only confirmed damage', async () => {
  const { as, texts, deps } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const job = (await dan('POST', 'shop/jobs', checkIn))?.body as { id: string; link: string };
  const token = job.link.split('?c=')[1];
  const cust = as(null);
  const jpeg = 'data:image/jpeg;base64,/9j/AAAA';
  assert.equal((await cust('POST', `shop/c/${token}/walkaround`, { angle: 'front', src: jpeg }))?.status, 400, 'closed until the shop asks');
  const sent = texts.length;
  await dan('POST', `shop/jobs/${job.id}/walkaround-request`, { send: true });
  assert.equal(texts.length, sent + 1);
  assert.match(texts.at(-1)!.body, /Ridgeline asks for 8 quick photos of your 2018 Honda Civic/);
  assert.equal((await cust('POST', `shop/c/${token}/walkaround`, { angle: 'roof', src: jpeg }))?.status, 400);
  assert.equal((await cust('POST', `shop/c/${token}/walkaround`, { angle: 'front', src: 'data:image/png;base64,AAAA' }))?.status, 400);
  await cust('POST', `shop/c/${token}/walkaround`, { angle: 'front', src: jpeg });
  await cust('POST', `shop/c/${token}/walkaround`, { angle: 'rear_left', src: jpeg });
  let page = (await cust('POST', `shop/c/${token}/walkaround`, { angle: 'front', src: jpeg + 'BBBB' }))?.body as { walkaround: { canUpload: boolean; photos: { angle: string; src: string; marks: unknown[] }[] } };
  assert.deepEqual(page.walkaround.photos.map((p) => p.angle).sort(), ['front', 'rear_left'], 'a retake replaces that angle');
  assert.ok(page.walkaround.canUpload);

  assert.equal((await dan('POST', `shop/jobs/${job.id}/walkaround-ai`, {}))?.status, 503, 'no AI key yet');
  let calls = 0;
  deps.damageFinder = { async find(_src, angle) { calls++; return angle === 'front' ? [{ x: 0.1, y: 0.5, w: 0.2, h: 0.1, kind: 'dent', note: 'Front bumper', source: 'ai', confirmed: false }] : []; } };
  const shopView = (await dan('POST', `shop/jobs/${job.id}/walkaround-ai`, {}))?.body as { walkaround: { id: string; angle: string; aiAt?: string; marks: { id: string; kind: string; confirmed: boolean; source: string }[] }[] };
  assert.equal(calls, 2);
  const front = shopView.walkaround.find((p) => p.angle === 'front')!;
  assert.equal(front.marks.length, 1);
  assert.equal(front.marks[0].confirmed, false);
  assert.ok(front.aiAt);
  assert.equal((await dan('POST', `shop/jobs/${job.id}/walkaround-ai`, {}))?.status, 400, 'nothing left to check');
  page = (await cust('GET', `shop/c/${token}`))?.body as typeof page;
  assert.equal(page.walkaround.photos.find((p) => p.angle === 'front')!.marks.length, 0, 'AI suggestions stay hidden');

  await dan('POST', `shop/jobs/${job.id}/walkaround-marks`, { photoId: front.id, marks: [
    { ...front.marks[0], kind: 'scratch', confirmed: true }, { x: 0.8, y: 0.8, w: 0.5, h: 0.5, kind: 'nope', confirmed: true }, { x: 'bad' },
  ] });
  page = (await cust('GET', `shop/c/${token}`))?.body as typeof page;
  const shown = page.walkaround.photos.find((p) => p.angle === 'front')!.marks as { kind: string; w: number; source?: string }[];
  assert.deepEqual(shown.map((m) => m.kind), ['scratch', 'other']);
  assert.equal(shown[1].w, 0.2, 'boxes are clipped to the photo');
  assert.equal(shown[0].source, undefined);

  await dan('POST', `shop/jobs/${job.id}/walkaround-remove`, { photoId: front.id });
  await dan('POST', `shop/jobs/${job.id}/walkaround-request`, { on: false });
  page = (await cust('GET', `shop/c/${token}`))?.body as typeof page;
  assert.equal(page.walkaround.photos.length, 1);
  assert.equal(page.walkaround.canUpload, false);
});

test('how-to assistant needs a signed-in shop', async () => {
  const w = world();
  assert.equal((await w.as(null)('POST', 'shop/howto', { question: 'oil change' }))?.status, 401);
  assert.equal((await w.as('owner-h')('POST', 'shop/howto', { question: 'oil change' }))?.status, 409);
  await w.as('owner-h')('POST', 'shop/me', { name: 'Howto Auto' });
  assert.equal((await w.as('owner-h')('POST', 'shop/howto', { question: 'oil change' }))?.status, 503);
  w.deps.howTo = { async complete() { return JSON.stringify({ answer: 'Drain and refill.', steps: ['Drain'], tools: [], parts: [], specs: [], safety: ['Jack stands'], ideas: [] }); } };
  const res = await w.as('owner-h')('POST', 'shop/howto', { question: 'oil change again' });
  assert.equal(res?.status, 200);
  assert.equal((res?.body as { answer: string }).answer, 'Drain and refill.');
});

test('how-to assistant is a Pro feature (and open during the free trial)', async () => {
  clearHowToLimits();
  const w = world();
  w.deps.howTo = { async complete() { return JSON.stringify({ answer: 'Drain and refill.', steps: [], tools: [], parts: [], specs: [], safety: [], ideas: [] }); } };
  const pro = w.as('owner-pro');
  await pro('POST', 'shop/me', { name: 'Plan Test Auto' });
  const shop = [...w.shops.values()].find((x) => x.ownerId === 'owner-pro')!;
  const ask = async (q: string) => { w.tick(2000); return (await pro('POST', 'shop/howto', { question: q }))?.status; };
  const setPlan = (plan: PlanState['plan'], status: string, trialEndsAt: string | null = null) => {
    shop.plan = { plan, status, trialEndsAt, textsUsed: 0, textsPeriod: 'trial', carsCreated: 0 };
  };
  setPlan('trial', 'trialing', '2026-11-20T00:00:00Z');
  assert.equal(await ask('oil change one'), 200);
  assert.equal(((await pro('GET', 'shop/plan'))?.body as { howTo: boolean }).howTo, true);
  setPlan('starter', 'active');
  const blocked = await pro('POST', 'shop/howto', { question: 'oil change two' });
  assert.equal(blocked?.status, 402);
  assert.match(String(blocked?.body), /Pro/);
  assert.equal(((await pro('GET', 'shop/plan'))?.body as { howTo: boolean }).howTo, false);
  setPlan('pro', 'active');
  assert.equal(await ask('oil change three'), 200);
  setPlan('trial', 'trialing', '2026-11-01T00:00:00Z'); // trial over
  assert.equal(await ask('oil change four'), 402);
});

test('estimate lines carry required, recommended or optional, and the shop can change pending ones', async () => {
  const { as } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const job = (await dan('POST', 'shop/jobs', checkIn))?.body as { id: string; link: string };
  await dan('POST', `shop/jobs/${job.id}/estimate`, { item: 'Front pads and rotors', price: 389, priority: 'required' });
  await dan('POST', `shop/jobs/${job.id}/estimate`, { item: 'Cabin air filter', price: 45, priority: 'bogus' });
  let est = ((await dan('GET', `shop/jobs/${job.id}`))?.body as { estimate: { id: string; priority: string }[] }).estimate;
  assert.deepEqual(est.map((e) => e.priority), ['required', 'recommended']);
  const set = await dan('POST', `shop/jobs/${job.id}/estimate`, { setPriority: est[1].id, priority: 'optional' });
  assert.equal(set?.status, 200);
  const token = job.link.split('?c=')[1];
  const view = (await as(null)('GET', `shop/c/${token}`))?.body as { estimate: { priority: string }[] };
  assert.deepEqual(view.estimate.map((e) => e.priority), ['required', 'optional']);
  assert.equal((await dan('POST', `shop/jobs/${job.id}/estimate`, { setPriority: 'nope', priority: 'optional' }))?.status, 400);
});

test('customer edits preserve the repair and link, send nothing, and route future updates to the saved contact', async () => {
  const { as, jobs, texts, deps } = world();
  const owner = as('owner');
  await owner('POST', 'shop/me', { name: 'Ridgeline' });
  const created = (await owner('POST', 'shop/jobs', checkIn))!.body as { id: string; link: string };
  await owner('POST', `shop/jobs/${created.id}/estimate`, { item: 'Pads', price: 180 });
  await owner('POST', `shop/jobs/${created.id}/note`, { text: 'Inspection complete' });
  const before = clone(jobs.get(created.id)!);
  const customer = { name: 'Updated Customer', phone: '(555) 222-3333', email: 'updated@example.com', preference: 'both', consent: true };
  assert.equal((await owner('POST', `shop/jobs/${created.id}/customer`, customer))?.status, 200);
  const after = jobs.get(created.id)!;
  assert.deepEqual(after.data.customer, { ...customer, phone: '+15552223333' });
  assert.deepEqual({ ...after, updatedAt: before.updatedAt, data: { ...after.data, customer: before.data.customer } }, before);
  assert.equal(texts.length, 1, 'saving never sends notifications');
  const emails: string[] = [];
  deps.email = { async send(to) { emails.push(to); return { delivery: 'sent' }; } };
  await owner('POST', `shop/jobs/${created.id}/message`, { text: 'Ready for your review' });
  assert.equal(texts.at(-1)!.to, '+15552223333');
  assert.deepEqual(emails, ['updated@example.com']);
  const token = created.link.split('?c=')[1];
  const page = (await as(null)('GET', `shop/c/${token}`))!.body as { firstName: string };
  assert.equal(page.firstName, 'Updated');
  await owner('POST', `shop/jobs/${created.id}/customer`, { ...customer, consent: false });
  const count = texts.length;
  await owner('POST', `shop/jobs/${created.id}/message`, { text: 'Do not deliver' });
  assert.equal(texts.length, count);
  assert.equal(emails.length, 1);
});

test('customer edits validate contacts and are restricted to the signed-in shop', async () => {
  const { as, jobs } = world();
  const owner = as('owner'), other = as('other');
  await owner('POST', 'shop/me', { name: 'Ridgeline' });
  await other('POST', 'shop/me', { name: 'Another shop' });
  const id = ((await owner('POST', 'shop/jobs', checkIn))!.body as { id: string }).id;
  const before = clone(jobs.get(id)!);
  const customer = { ...checkIn.customer, email: '', preference: 'sms' };
  for (const patch of [{ name: '' }, { phone: 'invalid' }, { preference: 'fax' }, { preference: 'email', email: '' }, { preference: 'both', email: 'wrong' }, { email: 'bad address' }, { consent: 'yes' }, { consent: undefined }]) {
    assert.equal((await owner('POST', `shop/jobs/${id}/customer`, { ...customer, ...patch }))?.status, 400);
    assert.deepEqual(jobs.get(id), before, 'invalid edits do not persist');
  }
  assert.equal((await other('POST', `shop/jobs/${id}/customer`, customer))?.status, 404);
  assert.equal((await as(null)('POST', `shop/jobs/${id}/customer`, customer))?.status, 401);
  assert.deepEqual(jobs.get(id), before);
  assert.equal((await owner('POST', `shop/jobs/${id}/customer`, { ...customer, preference: 'email', phone: '', email: 'emailonly@example.com' }))?.status, 200);
  assert.equal(jobs.get(id)!.data.customer.phone, '');
});

test('vehicle age settings persist for the shop and survive unrelated settings saves', async () => {
  const { as } = world();
  const owner = as('age-owner'), other = as('other-owner');
  const ageSettings = { warningDays:2, overdueDays:5, colors:['#123ABC','#CC7700','#DD2255'] };
  const saved = await owner('POST','shop/me',{name:'Age Shop',ageSettings});
  assert.equal(saved?.status,200);
  const expected = {...ageSettings,colors:ageSettings.colors.map(c=>c.toLowerCase())};
  assert.deepEqual((saved?.body as {shop:Shop}).shop.ageSettings,expected);
  assert.equal((await owner('POST','shop/me',{name:'Renamed Shop'}))?.status,200);
  assert.deepEqual(((await owner('GET','shop/me'))?.body as {shop:Shop}).shop.ageSettings,expected);
  await other('POST','shop/me',{name:'Other Shop'});
  assert.equal(((await other('GET','shop/me'))?.body as {shop:Shop}).shop.ageSettings,undefined);
});

test('invalid age thresholds and colors are rejected without changing saved preferences', async () => {
  const { as } = world(); const owner=as('age-owner');
  const good={warningDays:1,overdueDays:3,colors:['#16a36a','#e59a14','#e5484d']};
  await owner('POST','shop/me',{name:'Age Shop',ageSettings:good});
  for (const invalid of [null,{}, {...good,warningDays:0}, {...good,warningDays:1.5}, {...good,warningDays:366,overdueDays:400}, {...good,overdueDays:1}, {...good,overdueDays:3651}, {...good,colors:['red','orange','green']}, {...good,colors:['#112233']}, {...good,colors:['#112233','#445566','<script>']}]) {
    assert.equal((await owner('POST','shop/me',{name:'Age Shop',ageSettings:invalid}))?.status,400);
  }
  assert.deepEqual(((await owner('GET','shop/me'))?.body as {shop:Shop}).shop.ageSettings,good);
});

test('staff set low, medium or high urgency at check-in and on the car; customers never see it', async () => {
  const { as } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const job = (await dan('POST', 'shop/jobs', { ...checkIn, urgency: 'high' }))?.body as { id: string; link: string; urgency?: string };
  assert.equal(job.urgency, 'high');
  const lowered = (await dan('POST', `shop/jobs/${job.id}/urgency`, { urgency: 'low' }))?.body as { urgency?: string };
  assert.equal(lowered.urgency, 'low');
  assert.equal((await dan('POST', `shop/jobs/${job.id}/urgency`, { urgency: 'asap' }))?.status, 400);
  const cleared = (await dan('POST', `shop/jobs/${job.id}/urgency`, { urgency: '' }))?.body as { urgency?: string };
  assert.equal(cleared.urgency, undefined);
  const plain = (await dan('POST', 'shop/jobs', { ...checkIn, urgency: 'whenever' }))?.body as { urgency?: string };
  assert.equal(plain.urgency, undefined);
  await dan('POST', `shop/jobs/${job.id}/urgency`, { urgency: 'medium' });
  const view = (await as(null)('GET', `shop/c/${job.link.split('?c=')[1]}`))?.body as Record<string, unknown>;
  assert.equal('urgency' in view, false);
});

test('price list import reads a file with AI and saved items keep labor hours', async () => {
  const { as, deps } = world();
  const dan = as('user-dan');
  assert.equal((await dan('POST', 'shop/price-import', { text: 'Oil change\t49.99' }))?.status, 409, 'set up the shop first');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  assert.equal((await dan('POST', 'shop/price-import', { mime: 'application/msword', data: 'AAAA' }))?.status, 400);
  assert.equal((await dan('POST', 'shop/price-import', { mime: 'application/pdf', data: 'not base64!' }))?.status, 400);
  assert.equal((await dan('POST', 'shop/price-import', { text: 'Oil change\t49.99' }))?.status, 503, 'no AI key yet');

  const seen: unknown[] = [];
  deps.priceReader = { async read(input) {
    seen.push(input);
    return { laborRate: 135, items: [
      { name: 'Labor', kind: 'labor', rate: 135 },
      { name: ' Front  brake pads ', kind: 'labor', rate: 135, hours: 1.5 },
      { name: 'Synthetic oil change', kind: 'fee', rate: 79.999 },
      { name: 'Synthetic oil change', kind: 'fee', rate: 80 },
      { name: 'Shop supplies', kind: 'percent', rate: 250 },
      { name: 'Timing belt', kind: 'labor', rate: 0, hours: 4 },
      { name: 'Wiper blades', kind: 'part', rate: 24, check: true, note: 'Price is a range' },
      { name: '', kind: 'part', rate: 5 },
      { name: 'Mystery', kind: 'thing' as 'part', rate: 5 },
    ] };
  } };
  const res = await dan('POST', 'shop/price-import', { mime: 'application/pdf', data: 'JVBERi0xLjQK' });
  assert.equal(res?.status, 200);
  const out = res?.body as { laborRate: number; items: { name: string; kind: string; rate: number; hours?: number; check?: boolean; note?: string }[] };
  assert.equal(out.laborRate, 135);
  assert.deepEqual(out.items.map((i) => i.name), ['Labor', 'Front brake pads', 'Synthetic oil change', 'Timing belt', 'Wiper blades']);
  assert.equal(out.items[1].hours, 1.5);
  assert.equal(out.items[2].rate, 80);
  assert.equal(out.items[3].check, true, 'labor time with no rate needs a look');
  assert.equal(out.items[4].note, 'Price is a range');
  assert.deepEqual(seen[0], { file: { mime: 'application/pdf', data: 'JVBERi0xLjQK' } });

  // The owner saves the reviewed list; labor hours stay with the saved item.
  const saved = (await dan('POST', 'shop/me', { name: 'Ridgeline', rates: [{ name: 'Front brake pads', kind: 'labor', rate: 135, hours: 1.5 }, { name: 'Oil', kind: 'part', rate: 9 }] }))?.body as { shop: { rates: unknown[] } };
  assert.deepEqual(saved.shop.rates, [{ name: 'Front brake pads', kind: 'labor', rate: 135, hours: 1.5 }, { name: 'Oil', kind: 'part', rate: 9 }]);
  assert.equal((await dan('POST', 'shop/me', { name: 'Ridgeline', rates: [{ name: 'Bad', kind: 'labor', rate: 135, hours: -1 }] }))?.status, 400);

  deps.priceReader = { async read() { throw new Error('Gemini 500'); } };
  assert.equal((await dan('POST', 'shop/price-import', { text: 'a\tb' }))?.status, 502);
});

test('VIN decoding and recalls for signed-in staff, and check-in keeps the VIN and engine', async () => {
  const w = world();
  const dan = w.as('user-dan');
  assert.equal((await w.as(null)('POST', 'shop/vin', { vin: '19XFC2F5XGE000000' }))?.status, 401);
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  w.deps.fetchFn = (async (url: string) => new Response(JSON.stringify(String(url).includes('vpic')
    ? { Results: [{ ModelYear: '2016', Make: 'HONDA', Model: 'Civic', Trim: 'LX', DisplacementL: '2.0', EngineCylinders: '4' }] }
    : { results: [{ NHTSACampaignNumber: '16V999000', Component: 'BRAKES' }] }))) as unknown as typeof fetch;
  assert.equal((await dan('POST', 'shop/vin', { vin: 'short' }))?.status, 400);
  const v = (await dan('POST', 'shop/vin', { vin: '19xfc2f5xge000000' }))?.body as { make: string; engine: string };
  assert.equal(v.make, 'Honda'); assert.equal(v.engine, '2L 4 Cyl.');
  const r = (await dan('POST', 'shop/recalls', { year: '2016', make: 'Honda', model: 'Civic' }))?.body as { recalls: { campaign: string }[] };
  assert.equal(r.recalls[0].campaign, '16V999000');
  const job = (await dan('POST', 'shop/jobs', { ...checkIn, vehicle: { ...checkIn.vehicle, vin: '19XFC2F5XGE000000', engine: '2L 4 Cyl.', trim: 'LX' } }))?.body as { id: string; vehicle: { vin: string; engine: string }; link: string };
  assert.equal(job.vehicle.vin, '19XFC2F5XGE000000');
  assert.equal(job.vehicle.engine, '2L 4 Cyl.');
  const page = await w.as(null)('GET', `shop/c/${job.link.split('?c=')[1]}`);
  assert.ok(!JSON.stringify(page?.body).includes('19XFC2F5XGE000000'), 'the customer page does not show the VIN');
});

test('workday: mileage, promised time, tech, internal notes and returning-customer visits', async () => {
  const { as } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const first = (await dan('POST', 'shop/jobs', { ...checkIn, mileageIn: '48,210', promised: '2026-11-07T22:00:00Z', tech: { id: 'user-dan', name: 'Dan' } }))?.body as Record<string, any>;
  assert.equal(first.mileageIn, '48210');
  assert.equal(first.promised, '2026-11-07T22:00:00.000Z');
  assert.deepEqual(first.tech, { id: 'user-dan', name: 'Dan' });
  assert.equal((await dan('POST', 'shop/jobs', { ...checkIn, mileageIn: 'lots' }))?.status, 400);

  // Change details, then clear the promised time.
  let j = (await dan('POST', `shop/jobs/${first.id}/details`, { promised: '', mileageOut: '48,260' }))?.body as Record<string, any>;
  assert.equal(j.promised, undefined);
  assert.equal(j.mileageOut, '48260');
  assert.equal(j.tech.name, 'Dan');

  // Internal notes stay in the shop and never text the customer.
  j = (await dan('POST', `shop/jobs/${first.id}/note`, { text: 'Customer is picky about grease on the seats', internal: true, send: true }))?.body as Record<string, any>;
  assert.equal(j.notes[0].internal, true);
  j = (await dan('POST', `shop/jobs/${first.id}/note`, { text: 'Pads are at 2 mm.' }))?.body as Record<string, any>;
  const page = (await as(null)('GET', `shop/c/${j.link.split('?c=')[1]}`))?.body as Record<string, any>;
  assert.equal(page.notes.length, 1);
  assert.ok(!JSON.stringify(page).includes('picky'));

  // Visit history by phone, plate or VIN, and lookup by typed text.
  await dan('POST', `shop/jobs/${first.id}/stage`, { stage: 'picked_up' });
  const second = (await dan('POST', 'shop/jobs', { ...checkIn, concern: 'Oil change' }))?.body as Record<string, any>;
  const hist = (await dan('POST', 'shop/visits', { phone: '(555) 013-6620', plate: second.plate, exclude: second.id }))?.body as { rows: any[] };
  assert.equal(hist.rows.length, 1);
  assert.equal(hist.rows[0].ro, first.ro);
  assert.equal(hist.rows[0].mileage, '48260');
  const found = (await dan('POST', 'shop/visits', { q: 'delgado' }))?.body as { rows: any[] };
  assert.equal(found.rows.length, 2);
  assert.deepEqual(((await as('someone-else')('POST', 'shop/visits', { q: 'delgado' }))?.status), 409);
});

test('workday: quick service fast lane checks in with approved lines and goes straight to work', async () => {
  const { as, texts } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Quick Lube' });
  const saved = (await dan('POST', 'shop/me', { name: 'Quick Lube', packages: [{ name: 'Oil change + rotation', fastLane: true, lines: [{ name: 'Synthetic oil change', kind: 'fee', rate: 69.95, qty: 1 }, { name: 'Tire rotation', kind: 'fee', rate: 20, qty: 1 }] }] }))?.body as Record<string, any>;
  const pkg = saved.shop.packages[0];
  assert.equal(pkg.lines.length, 2);
  const j = (await dan('POST', 'shop/jobs', { ...checkIn, concern: '', service: pkg.id }))?.body as Record<string, any>;
  assert.equal(j.stage, 'in_progress');
  assert.equal(j.concern, 'Oil change + rotation');
  assert.equal(j.service, 'Oil change + rotation');
  assert.deepEqual(j.estimate.map((e: any) => [e.status, e.price]), [['approved', 69.95], ['approved', 20]]);
  assert.match(texts.at(-1)!.body, /has your 2018 Honda Civic/);
  assert.equal((await dan('POST', 'shop/jobs', { ...checkIn, service: 'gone' }))?.status, 400);

  // A bundle can be edited (same id kept) and added to a car that's already in, as lines waiting on the customer.
  const edited = (await dan('POST', 'shop/me', { name: 'Quick Lube', packages: [{ ...pkg, name: 'Oil + rotation + wipers', lines: [...pkg.lines, { name: 'Wiper blades', kind: 'part', rate: 24, qty: 2 }] }] }))?.body as Record<string, any>;
  assert.equal(edited.shop.packages[0].id, pkg.id);
  assert.equal(edited.shop.packages[0].lines.length, 3);
  const other = (await dan('POST', 'shop/jobs', checkIn))?.body as Record<string, any>;
  const withPkg = (await dan('POST', `shop/jobs/${other.id}/estimate`, { package: pkg.id }))?.body as Record<string, any>;
  assert.deepEqual(withPkg.estimate.map((e: any) => [e.item, e.status, e.price]), [['Synthetic oil change', 'pending', 69.95], ['Tire rotation', 'pending', 20], ['Wiper blades', 'pending', 48]]);
  assert.equal((await dan('POST', `shop/jobs/${other.id}/estimate`, { package: 'gone' }))?.status, 400);
});

test('workday: reminders send when due, once, with STOP, and the customer can stop them', async () => {
  const { as, texts, tick, jobs } = world();
  const dan = as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline', phone: '(555) 014-2290' });
  const j = (await dan('POST', 'shop/jobs', checkIn))?.body as Record<string, any>;
  assert.equal((await dan('POST', `shop/jobs/${j.id}/followup`, { kind: 'declined', due: '2026-11-07', text: 'Time to look at those brakes?' }))?.status, 400);
  let out = (await dan('POST', `shop/jobs/${j.id}/followup`, { kind: 'declined', due: '2026-12-07', text: 'Hi Maria, want us to do the brake fluid flush you skipped?' }))?.body as Record<string, any>;
  assert.equal(out.followups.length, 1);
  await dan('POST', `shop/jobs/${j.id}/followup`, { kind: 'service', due: '2027-02-07', text: 'Hi Maria, your Civic is due for an oil change.' });
  const token = j.link.split('?c=')[1];
  const page = (await as(null)('GET', `shop/c/${token}`))?.body as Record<string, any>;
  assert.equal(page.reminders.waiting.length, 2);

  const before = texts.length;
  await dan('GET', 'shop/jobs');
  assert.equal(texts.length, before, 'nothing is due yet');
  tick(31 * 86_400_000);
  await dan('GET', 'shop/jobs');
  await dan('GET', 'shop/jobs');
  assert.equal(texts.length, before + 1, 'sent exactly once');
  assert.match(texts.at(-1)!.body, /brake fluid flush.*Reply STOP to opt out\.$/);

  // The customer stops the rest from their page.
  const stopped = (await as(null)('POST', `shop/c/${token}/stop-reminders`))?.body as Record<string, any>;
  assert.equal(stopped.reminders.off, true);
  assert.equal(stopped.reminders.waiting.length, 0);
  tick(120 * 86_400_000);
  await dan('GET', 'shop/jobs');
  assert.equal(texts.length, before + 1);
  assert.equal((await dan('POST', `shop/jobs/${j.id}/followup`, { kind: 'service', due: '2027-08-01', text: 'Oil change due soon.' }))?.status, 400);

  // A texted STOP (handled in the SMS webhook) uses the same helper.
  const job = jobs.get(j.id)!;
  job.data.customer.remindersOff = undefined;
  job.data.followups!.push({ id: 'f9', kind: 'service', due: '2028-01-01T15:00:00.000Z', text: 'x', createdAt: '', by: '' });
  stopReminders(job, '2027-01-01T00:00:00Z', 'customer');
  assert.ok(job.data.followups!.every((f) => f.sentAt || f.canceledAt));
});

test('a note sent to the customer counts against the plan text allowance like other texts', async () => {
  const w = world();
  const counted: number[] = [];
  w.deps.store.useTexts = async (_shop, n) => { counted.push(n); return false; };
  const dan = w.as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const job = (await dan('POST', 'shop/jobs', checkIn))?.body as { id: string };
  const before = counted.length, sent = w.texts.length;
  const j = (await dan('POST', `shop/jobs/${job.id}/note`, { text: 'Rotors are scored too.', send: true }))?.body as { messages: { delivery?: string; sender?: string }[] };
  assert.equal(counted.length, before + 1, 'the note text was counted');
  assert.equal(w.texts.length, sent, 'over the allowance, nothing is sent');
  assert.equal(j.messages.at(-1)?.delivery, 'not_sent');
  assert.ok(j.messages.at(-1)?.sender);
});

test('customer emails stop at the daily cap and say why', async () => {
  const w = world();
  let used = 0;
  w.deps.store.useEmails = async (_shop, _day, limit) => (used < limit ? (used++, true) : false);
  const sent: string[] = [];
  w.deps.email = { async send(to) { sent.push(to); return { delivery: 'sent' }; } };
  const dan = w.as('user-dan');
  await dan('POST', 'shop/me', { name: 'Ridgeline' });
  const job = (await dan('POST', 'shop/jobs', { ...checkIn, customer: { ...checkIn.customer, email: 'c@example.com', preference: 'email' } }))?.body as { id: string };
  used = 499;
  await dan('POST', `shop/jobs/${job.id}/message`, { text: 'One more' });
  const j = (await dan('POST', `shop/jobs/${job.id}/message`, { text: 'Over the cap' }))?.body as { messages: { delivery?: string; note?: string }[] };
  assert.equal(sent.length, 2, 'check-in email and one more');
  assert.equal(j.messages.at(-1)?.delivery, 'not_sent');
  assert.match(j.messages.at(-1)?.note ?? '', /customer emails for today/);
});
