// Talk Shops owner and technician roles, against in-memory storage: `node --test supabase/tests/shopStaff.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import { shopRoute, type Job, type Shop, type ShopDeps, type ShopStore } from '../functions/_shared/shop.ts';
import type { Invite, Member, StaffStore } from '../functions/_shared/shopStaff.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function world() {
  const shops = new Map<string, Shop>();
  const jobs = new Map<string, Job>();
  const members = new Map<string, Member>();
  const invites: Invite[] = [];
  const emails: { to: string; subject: string; body: string }[] = [];
  let clock = Date.parse('2026-11-08T03:00:00Z');
  let n = 0;
  const store: ShopStore = {
    async shopByOwner(owner) { const s = [...shops.values()].find((x) => x.ownerId === owner); return s ? clone(s) : null; },
    async shopById(id) { const s = shops.get(id); return s ? clone(s) : null; },
    async putShop(s) { shops.set(s.id, clone(s)); },
    async listJobs(shopId) { return [...jobs.values()].filter((j) => j.shopId === shopId).map(clone); },
    async getJob(id) { const j = jobs.get(id); return j ? clone(j) : null; },
    async jobByToken(t) { const j = [...jobs.values()].find((x) => x.token === t); return j ? clone(j) : null; },
    async putJob(j) { jobs.set(j.id, clone(j)); },
    async deleteJob(id) { jobs.delete(id); },
    async saveBill(id, bill) { jobs.get(id)!.bill = clone(bill); },
    async nextRo() { return 1001 + n; },
  };
  const staff: StaffStore = {
    async memberOf(u) { const m = members.get(u); return m ? clone(m) : null; },
    async listMembers(shopId) { return [...members.values()].filter((m) => m.shopId === shopId).map(clone); },
    async addMember(m) { if (members.has(m.userId)) return false; members.set(m.userId, clone(m)); return true; },
    async setRole(shopId, u, role) { const m = members.get(u); if (m?.shopId === shopId) m.role = role; },
    async removeMember(shopId, u) { if (members.get(u)?.shopId === shopId) members.delete(u); },
    async saveInvite(i) { invites.push(clone(i)); },
    async listInvites(shopId) { return invites.filter((i) => i.shopId === shopId && !i.acceptedAt).reverse().map(clone); },
    async inviteByHash(h) { const i = invites.find((x) => x.tokenHash === h); return i ? clone(i) : null; },
    async claimInvite(id, at) { const i = invites.find((x) => x.id === id); if (!i || i.acceptedAt) return false; i.acceptedAt = at; return true; },
    async deleteInvite(shopId, id) { const k = invites.findIndex((x) => x.id === id && x.shopId === shopId); if (k >= 0) invites.splice(k, 1); },
  };
  let token = 0;
  const deps: ShopDeps = {
    store, staff,
    sms: { async send() { return { delivery: 'sent' }; } },
    email: { async send(to, subject, body) { emails.push({ to, subject, body }); return { delivery: 'sent' }; } },
    linkBase: 'https://talkshops.app/?c=',
    siteUrl: 'https://talkshops.app',
    newToken: () => `invitetoken${String(++token).padStart(16, '0')}`,
  };
  const as = (userId: string | null, userEmail: string | null = null) => (method: string, path: string, body?: unknown) => {
    clock += 60_000;
    const ctx = { userId, userEmail, displayName: null, now: () => new Date(clock), newId: () => `id${++n}`, log: { info() {}, warn() {}, error() {} } } as unknown as Ctx;
    return shopRoute(ctx, deps, method, path.split('/'), body ?? null);
  };
  const tokenOf = (email: string) => /join=([A-Za-z0-9_-]+)/.exec(emails.filter((e) => e.to === email).at(-1)!.body)![1];
  return { as, shops, jobs, members, invites, emails, tokenOf, tick: (ms: number) => { clock += ms; } };
}

const checkIn = {
  customer: { name: 'Maria Delgado', phone: '(555) 013-6620', consent: true },
  vehicle: { year: '2018', make: 'Honda', model: 'Civic' }, concern: 'Grinding noise when braking',
};

async function shopWithTech() {
  const w = world();
  const owner = w.as('owner1', 'owner@shop.com');
  assert.equal((await owner('POST', 'shop/me', { name: 'Ridgeline Auto' }))?.status, 200);
  const inv = await owner('POST', 'shop/staff/invite', { email: 'Tech@Shop.com', name: 'Sam Lee', role: 'tech' });
  assert.equal(inv?.status, 200);
  const tech = w.as('tech1', 'tech@shop.com');
  assert.equal((await tech('POST', 'shop/join/' + w.tokenOf('tech@shop.com')))?.status, 200);
  return { w, owner, tech };
}

test('a new shop account is its owner, and the owner row is saved', async () => {
  const w = world();
  const owner = w.as('owner1', 'owner@shop.com');
  await owner('POST', 'shop/me', { name: 'Ridgeline Auto' });
  const me = await owner('GET', 'shop/me');
  assert.equal((me?.body as { role: string }).role, 'owner');
  assert.equal((me?.body as { mainOwner: boolean }).mainOwner, true);
  assert.equal(w.members.get('owner1')?.role, 'owner');
});

test('a shop made before roles existed still opens for its owner', async () => {
  const w = world();
  w.shops.set('old', { id: 'old', ownerId: 'legacy', name: 'Old Shop', phone: '', hours: '', createdAt: '2026-01-01T00:00:00Z' });
  const me = await w.as('legacy', 'legacy@shop.com')('GET', 'shop/me');
  assert.equal((me?.body as { role: string }).role, 'owner');
  const team = await w.as('legacy', 'legacy@shop.com')('GET', 'shop/staff');
  assert.equal((team?.body as { members: { primary: boolean }[] }).members[0].primary, true);
});

test('invite email, preview and accept put the tech in the shop', async () => {
  const { w, tech } = await shopWithTech();
  assert.equal(w.emails[0].to, 'tech@shop.com');
  assert.match(w.emails[0].subject, /Ridgeline Auto/);
  assert.match(w.emails[0].body, /Technician/);
  assert.equal(w.invites[0].tokenHash.includes('invitetoken'), false, 'only a hash is stored');
  const me = await tech('GET', 'shop/me');
  assert.equal((me?.body as { role: string }).role, 'tech');
  assert.equal((me?.body as { shop: Shop }).shop.name, 'Ridgeline Auto');
  // The link works once.
  assert.equal((await w.as(null)('GET', 'shop/join/' + w.tokenOf('tech@shop.com')))?.status, 410);
});

test('invite preview works signed out; accepting needs the invited email', async () => {
  const w = world();
  const owner = w.as('owner1', 'owner@shop.com');
  await owner('POST', 'shop/me', { name: 'Ridgeline Auto' });
  await owner('POST', 'shop/staff/invite', { email: 'tech@shop.com' });
  const token = w.tokenOf('tech@shop.com');
  const peek = await w.as(null)('GET', 'shop/join/' + token);
  assert.deepEqual(peek?.body, { shopName: 'Ridgeline Auto', email: 'tech@shop.com', role: 'tech', roleLabel: 'Technician' });
  assert.equal((await w.as(null)('POST', 'shop/join/' + token))?.status, 401);
  assert.equal((await w.as('other', 'someone@else.com')('POST', 'shop/join/' + token))?.status, 403);
  assert.equal((await w.as(null)('GET', 'shop/join/' + 'x'.repeat(30)))?.status, 404);
});

test('invites expire and an account with its own shop cannot join another', async () => {
  const w = world();
  const owner = w.as('owner1', 'owner@shop.com');
  await owner('POST', 'shop/me', { name: 'Ridgeline Auto' });
  await w.as('owner2', 'two@shop.com')('POST', 'shop/me', { name: 'Other Garage' });
  await owner('POST', 'shop/staff/invite', { email: 'two@shop.com' });
  const res = await w.as('owner2', 'two@shop.com')('POST', 'shop/join/' + w.tokenOf('two@shop.com'));
  assert.equal(res?.status, 409);
  assert.match(String(res?.body), /Other Garage/);
  await owner('POST', 'shop/staff/invite', { email: 'late@shop.com' });
  w.tick(8 * 86_400_000);
  assert.equal((await w.as('late', 'late@shop.com')('POST', 'shop/join/' + w.tokenOf('late@shop.com')))?.status, 410);
});

test('technicians work cars but owner-only actions are refused by the server', async () => {
  const { w, owner, tech } = await shopWithTech();
  const car = await tech('POST', 'shop/jobs', checkIn);
  assert.equal(car?.status, 200);
  const id = (car?.body as { id: string }).id;
  assert.equal((await tech('POST', `shop/jobs/${id}/stage`, { stage: 'diagnosing' }))?.status, 200);
  assert.equal((await tech('POST', `shop/jobs/${id}/note`, { text: 'Pads at 2mm' }))?.status, 200);
  assert.equal((await tech('POST', `shop/jobs/${id}/estimate`, { item: 'Front pads', price: 180, save: true }))?.status, 200);
  assert.equal(w.shops.get([...w.shops.keys()][0])!.rates?.length ?? 0, 0, "a tech's line isn't saved to the price list");
  assert.equal((await tech('POST', `shop/jobs/${id}/eta`, { eta: 'Tue' }))?.status, 200);

  for (const [method, path, body] of [
    ['POST', `shop/jobs/${id}/stage`, { stage: 'approval' }],
    ['POST', `shop/jobs/${id}/bill`, { mode: 'generated', lines: [{ name: 'Pads', kind: 'part', rate: 180, qty: 1 }] }],
    ['POST', `shop/jobs/${id}/close`, { reason: 'Other' }],
    ['DELETE', `shop/jobs/${id}`, undefined],
    ['POST', 'shop/me', { name: 'Hijacked' }],
    ['POST', 'shop/plan/checkout', { plan: 'starter' }],
    ['GET', 'shop/staff', undefined],
    ['POST', 'shop/staff/invite', { email: 'x@y.com' }],
  ] as const) assert.equal((await tech(method, path, body))?.status, 403, `${method} ${path}`);

  assert.equal(w.jobs.get(id)!.stage, 'diagnosing');
  assert.equal([...w.shops.values()][0].name, 'Ridgeline Auto');
  assert.equal((await owner('POST', `shop/jobs/${id}/stage`, { stage: 'approval' }))?.status, 200);
  assert.equal((await tech('GET', 'shop/plan'))?.status, 200, 'techs can read the plan state');
});

test('owners change roles and remove staff; the main owner is protected', async () => {
  const { w, owner, tech } = await shopWithTech();
  const team = (await owner('GET', 'shop/staff'))?.body as { members: { userId: string; role: string; primary: boolean; you: boolean }[] };
  assert.deepEqual(team.members.map((m) => [m.userId, m.role, m.primary, m.you]), [['owner1', 'owner', true, true], ['tech1', 'tech', false, false]]);

  assert.equal((await owner('POST', 'shop/staff/members/tech1', { role: 'owner' }))?.status, 200);
  assert.equal(w.members.get('tech1')!.role, 'owner');
  // A second owner can manage the team, but not the main owner or themselves.
  assert.equal((await tech('GET', 'shop/staff'))?.status, 200);
  assert.equal((await tech('DELETE', 'shop/staff/members/owner1'))?.status, 400);
  assert.equal((await tech('POST', 'shop/staff/members/tech1', { role: 'tech' }))?.status, 400);
  assert.equal((await tech('POST', 'shop/me', { name: 'Ridgeline Auto & Tire' }))?.status, 200);
  assert.equal([...w.shops.values()][0].ownerId, 'owner1', 'saving settings keeps the main owner');

  assert.equal((await owner('DELETE', 'shop/staff/members/tech1'))?.status, 200);
  assert.equal(w.members.has('tech1'), false);
  assert.equal(((await tech('GET', 'shop/me'))?.body as { shop: unknown }).shop, null);
  assert.equal((await tech('GET', 'shop/jobs'))?.status, 409);
});

test('re-inviting replaces the old link; cancelling an invite kills it; members cannot be invited twice', async () => {
  const { w, owner } = await shopWithTech();
  await owner('POST', 'shop/staff/invite', { email: 'new@shop.com' });
  const first = w.tokenOf('new@shop.com');
  const again = await owner('POST', 'shop/staff/invite', { email: 'new@shop.com', role: 'owner' });
  assert.match((again?.body as { link: string }).link, /^https:\/\/talkshops\.app\/\?join=/);
  assert.equal((again?.body as { invites: unknown[] }).invites.length, 1);
  assert.equal((await w.as(null)('GET', 'shop/join/' + first))?.status, 404);
  const id = (again?.body as { invites: { id: string }[] }).invites[0].id;
  assert.equal((await owner('DELETE', 'shop/staff/invites/' + id))?.status, 200);
  assert.equal((await w.as(null)('GET', 'shop/join/' + w.tokenOf('new@shop.com')))?.status, 404);
  assert.equal((await owner('POST', 'shop/staff/invite', { email: 'tech@shop.com' }))?.status, 400);
});

test('Starter counts the primary owner and pending invitations in staff and owner limits',async()=>{
  const {w,owner}=await shopWithTech();
  const s=[...w.shops.values()][0];
  s.plan={plan:'starter',status:'active',trialEndsAt:null,textsUsed:0,carsCreated:0};
  const invite=await owner('POST','shop/staff/invite',{email:'partner@test.invalid',role:'owner'});
  assert.equal(invite?.status,200);
  assert.deepEqual((invite?.body as {limits:unknown}).limits,{staff:3,owners:2});
  assert.equal((await owner('POST','shop/staff/invite',{email:'another@test.invalid',role:'tech'}))?.status,400);
  assert.equal((await owner('POST','shop/staff/members/tech1',{role:'owner'}))?.status,400);
  const id=(invite?.body as {invites:{id:string}[]}).invites[0].id;
  assert.equal((await owner('DELETE','shop/staff/invites/'+id))?.status,200);
  assert.equal((await owner('POST','shop/staff/members/tech1',{role:'owner'}))?.status,200);
});
