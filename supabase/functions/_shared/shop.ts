// Talk Shops: repair shop progress updates. Shop staff sign in (Supabase auth) and move each car
// through stages; each change can text the customer. Customers never sign in: their text carries a
// link with a long random token that opens their car's page, where they can approve or decline work.

import type { Ctx, Res } from './handlers.ts';

import { amount, validRate, validCharge, copyRate, lineCents, type Bill, type Rate, type Charge } from './shopBilling.ts';

type Body = Record<string, unknown>;

export const STAGES = ['invited', 'checked_in', 'diagnosing', 'approval', 'parts', 'in_progress', 'qc', 'ready', 'picked_up'] as const;
export type Stage = typeof STAGES[number];

export interface Shop {
  id: string;
  ownerId: string;
  rates?: Rate[];
  name: string;
  phone: string;
  hours: string;
  /** Where customers' email replies go (Reply-To). Optional. */
  email?: string;
  createdAt: string;
}

export interface EstimateLine { id: string; item: string; price: number; status: 'pending' | 'approved' | 'declined'; charge?: Charge }
export interface Photo { id: string; src: string; cap: string; stage?: Stage; addedAt?: string; source?: 'customer' }
export interface StageEvent { stage: Stage; t: string }
type Channel = 'sms' | 'email';
type Preference = Channel | 'both';
export interface Message { channel?: Channel; dir: 'out' | 'in'; t: string; text: string; delivery?: 'sent' | 'not_sent' | 'failed'; note?: string }

export interface JobData {
  ro: string;
  customer: { name: string; phone: string; consent: boolean; email?: string; preference?: Preference };
  vehicle: { year: string; make: string; model: string };
  plate: string;
  concern: string;
  eta: string;
  estimate: EstimateLine[];
  photos: Photo[];
  events: StageEvent[];
  messages: Message[];
  approval: { by: string; t: string } | null;
}

export type Intake = Pick<JobData, 'vehicle' | 'plate' | 'concern'>;

export interface Job {
  intake?: Intake | null;
  intakePhotos?: Photo[];
  id: string;
  shopId: string;
  token: string;
  stage: Stage;
  data: JobData;
  bill?: Bill | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShopStore {
  shopByOwner(ownerId: string): Promise<Shop | null>;
  shopById(id: string): Promise<Shop | null>;
  putShop(shop: Shop): Promise<void>;
  listJobs(shopId: string, since: string): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;
  jobByToken(token: string): Promise<Job | null>;
  putJob(job: Job): Promise<void>;
  saveIntake?(jobId: string, intake: Intake): Promise<boolean>;
  intakePhoto?(jobId: string, photo: Photo | null, remove: string | null): Promise<boolean>;
  saveBill?(jobId: string, bill: Bill, pdf: string | null): Promise<void>;
  getBillPdf?(jobId: string): Promise<string | null>;
  /** Picked-up cars archived at or after `since`, newest first, whose search text contains every term. */
  searchArchive?(shopId: string, since: string, terms: string[], limit: number): Promise<ArchiveRow[]>;
  /** Deletes the shop's picked-up cars archived before `before`. */
  purgeArchive?(shopId: string, before: string): Promise<void>;
  /** Next repair order number for the shop, starting at 1001. */
  nextRo(shopId: string): Promise<number>;
}

/** One archived (picked-up) car, without photos or messages. */
export interface ArchiveRow {
  id: string; ro: string; archivedAt: string; createdAt: string;
  customer: JobData['customer']; vehicle: JobData['vehicle']; plate: string; concern: string; total: number | null;
}

/** When the car was picked up, or null while it is still in the shop. */
export const archivedAt = (j: Pick<Job, 'stage' | 'updatedAt' | 'data'>): string | null =>
  j.stage === 'picked_up' ? ([...j.data.events].reverse().find((e) => e.stage === 'picked_up')?.t ?? j.updatedAt) : null;

/** The text archive search matches against (the database keeps the same thing in repair_jobs.search). */
export const archiveSearchText = (j: Pick<Job, 'data' | 'intake'>) => {
  const d = j.data, i = j.intake;
  return [d.ro, d.customer.name, d.customer.phone.replace(/\D/g, ''), d.customer.email ?? '', d.vehicle.year, d.vehicle.make, d.vehicle.model,
    i?.vehicle.year, i?.vehicle.make, i?.vehicle.model, d.plate, i?.plate, d.concern, i?.concern].map((x) => x ?? '').join(' ').toLowerCase();
};

/** Search box text to terms: lowercase words; phone-like words keep only their digits. */
export function archiveTerms(q: string): string[] {
  return q.toLowerCase().split(/\s+/).map((t) => (/\d/.test(t) && /^[\d()+\-.]+$/.test(t) ? t.replace(/\D/g, '') : t.replace(/[%_*\\,()]/g, '')))
    .filter(Boolean).slice(0, 6);
}

export const ARCHIVE_DAYS = 365;
const archiveCutoff = (now: Date) => new Date(now.getTime() - ARCHIVE_DAYS * 86_400_000).toISOString();

/** Adds rates the shop hasn't saved yet (matched by name), up to 250. */
async function rememberRates(store: ShopStore, shop: Shop, rates: Rate[]): Promise<void> {
  const list = [...(shop.rates ?? [])];
  const have = new Set(list.map((r) => r.name.trim().toLowerCase()));
  let added = false;
  for (const r of rates) {
    const key = r.name.trim().toLowerCase();
    if (!key || have.has(key) || list.length >= 250 || !validRate(r)) continue;
    list.push(copyRate(r)); have.add(key); added = true;
  }
  if (added) await store.putShop({ ...shop, rates: list });
}

export interface SmsResult { delivery: 'sent' | 'not_sent' | 'failed'; note?: string }
export interface SmsSender { send(to: string, text: string): Promise<SmsResult> }

export interface ShopDeps {
  store: ShopStore;
  sms: SmsSender;
  email?: { send(to: string, subject: string, text: string, opts?: { fromName?: string; replyTo?: string }): Promise<SmsResult> };
  /** Customer links are this plus the job's token, e.g. https://hood-league.com/shop/?c= */
  linkBase: string;
  newToken: () => string;
  /** Most demo texts sent per day across all visitors (protects the Twilio balance). */
  demoDailyLimit?: number;
}

export const DEMO_SHOP_ID = 'demo-shop';
const DEMO_OWNER = '00000000-0000-4000-8000-00000000d3e0';
const DEMO_PER_PHONE_PER_DAY = 2;

const LABEL: Record<Stage, string> = {
  invited: 'Customer invited', checked_in: 'Checked in', diagnosing: 'Diagnosing', approval: 'Approval needed', parts: 'Waiting on parts',
  in_progress: 'In progress', qc: 'Quality check', ready: 'Ready for pickup', picked_up: 'Picked up',
};

const TEMPLATES: Record<Stage, string> = {
  invited: "Hi {first}, {shop} invites you to check in for your repair. Add your vehicle, describe the issue and upload photos for your technician: {link}",
  checked_in: "Hi {first}, {shop} has your {vehicle}. We'll keep you updated as work moves along. Track your repair and add photos for your technician: {link}",
  diagnosing: "Hi {first}, a technician is inspecting your {vehicle} now. We'll send what we find soon.",
  approval: "Hi {first}, we found what's going on with your {vehicle}. Please review and approve the estimate ({total}): {link}",
  parts: "Hi {first}, parts for your {vehicle} are on order and expected {eta}. We'll let you know when they arrive.",
  in_progress: 'Good news, {first}: repairs on your {vehicle} are underway.',
  qc: "Hi {first}, repairs are done. We're doing a final check and road test on your {vehicle}.",
  ready: "Your {vehicle} is ready for pickup! Total {total}. We're open {hours}. Details: {link}",
  picked_up: 'Thanks for choosing {shop}, {first}! How did we do? Reply with any feedback. Reply STOP to opt out.',
};

const MAX_PHOTO = 400_000; // a 640px JPEG data URL is ~60-120 KB
const MAX_PHOTOS = 12;
const ok = (body?: unknown): Res => ({ status: 200, body });
const bad = (message: string): Res => ({ status: 400, body: message });
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const money = (n: number) => `$${n.toFixed(2)}`;

export const vehicleName = (d: JobData) => [d.vehicle.year, d.vehicle.make, d.vehicle.model].filter(Boolean).join(' ');

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  const d = digits.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

const total = (d: JobData, approvedOnly: boolean) =>
  d.estimate.filter((e) => !approvedOnly || e.status === 'approved').reduce((a, e) => a + e.price, 0);

export function fillTemplate(stage: Stage, shop: Shop, job: Job, linkBase: string): string {
  const d = { ...job.data, ...job.intake };
  const vals: Record<string, string> = {
    first: d.customer.name.split(/\s+/)[0] || 'there',
    shop: shop.name,
    vehicle: vehicleName(d) || 'car',
    link: linkBase + job.token,
    total: money(stage === 'ready' && job.bill ? job.bill.total : total(d, stage === 'ready')),
    eta: d.eta || 'soon',
    hours: shop.hours || 'during business hours',
  };
  return TEMPLATES[stage].replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '');
}

/** What the shop sees. */
const jobOut = (j: Job, linkBase: string) => ({
  id: j.id, stage: j.stage, link: linkBase + j.token, createdAt: j.createdAt, updatedAt: j.updatedAt, bill: j.bill ?? null, ...j.data, ...j.intake, intakeReceived: !!j.intake, photos: [...(j.intakePhotos ?? []), ...j.data.photos],
});

/** What the customer sees: no phone number, no other customers, no internal notes. */
const customerOut = (j: Job, shop: Shop) => ({
  shop: { name: shop.name, phone: shop.phone, hours: shop.hours },
  ro: j.data.ro,
  stage: j.stage,
  canUploadIntakePhotos: j.shopId !== DEMO_SHOP_ID && ['invited','checked_in'].includes(j.stage),
  firstName: j.data.customer.name.split(/\s+/)[0] || '',
  vehicle: vehicleName({ ...j.data, ...j.intake }),
  intakeReceived: !!j.intake,
  concern: j.intake?.concern ?? j.data.concern,
  eta: j.data.eta,
  estimate: j.data.estimate,
  photos: [...(j.intakePhotos ?? []), ...j.data.photos],
  events: j.data.events,
  approval: j.data.approval,
  bill: ['ready', 'picked_up'].includes(j.stage) ? j.bill ?? null : null,
});

async function notifyCustomer(deps: ShopDeps, shop: Shop, job: Job, body: string, now: string): Promise<Message[]> {
  const c = job.data.customer, preference = c.preference ?? 'sms';
  const channels: Channel[] = preference === 'both' ? ['sms', 'email'] : [preference];
  return Promise.all(channels.map(async (channel): Promise<Message> => {
    const link = deps.linkBase + job.token;
    const text = channel === 'email' && !body.includes(link) ? body + '\n\nRepair details: ' + link : body;
    let result: SmsResult;
    if (!c.consent) result = { delivery: 'not_sent', note: 'Customer has not agreed to ' + (channel === 'sms' ? 'texts.' : 'email.') };
    else if (channel === 'sms') result = await deps.sms.send(c.phone, text);
    else if (deps.email && c.email) result = await deps.email.send(c.email, shop.name + ' · ' + job.data.ro + ' repair update', text, { fromName: shop.name, replyTo: shop.email || undefined });
    else result = { delivery: 'not_sent', note: 'Automatic email is not configured.' };
    return { dir: 'out', channel, t: now, text, ...result };
  }));
}

async function submitIntake(store: ShopStore, job: Job, body: Body): Promise<Res | null> {
  if (job.stage !== 'invited' || job.intake) return bad('Intake has already been completed.');
  const v = (body.vehicle ?? {}) as Body;
  const vehicle = { year: str(v.year, 4), make: str(v.make, 40), model: str(v.model, 40) };
  const concern = str(body.concern, 1000);
  if (!vehicle.make || !vehicle.model || !concern) return bad('Enter the make, model and reason for the visit.');
  const intake = { vehicle, concern, plate: str(body.plate, 12).toUpperCase() };
  if (!await store.saveIntake?.(job.id, intake)) return bad('Intake changed. Refresh to see the latest details.');
  job.intake = intake;
  return null;
}

export async function shopRoute(ctx: Ctx, deps: ShopDeps | null | undefined, method: string, parts: string[], data: unknown): Promise<Res | null> {
  if (parts[0] !== 'shop') return null;
  if (!deps) return { status: 503, body: 'Not available here.' };
  const { store } = deps;
  const body = (data && typeof data === 'object' ? data : {}) as Body;
  const now = ctx.now().toISOString();

  // ---- Customer link (no sign-in) ----
  if (parts[1] === 'c') {
    const token = parts[2] || '';
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { status: 404, body: 'This link is not valid.' };
    const job = await store.jobByToken(token);
    const shop = job ? await store.shopById(job.shopId) : null;
    if (!job || !shop) return { status: 404, body: 'This link is not valid.' };

    if (method === 'GET' && parts.length === 4 && parts[3] === 'bill-file') {
      if (!['ready', 'picked_up'].includes(job.stage) || job.bill?.mode !== 'upload') return { status: 404 };
      const pdf = await store.getBillPdf?.(job.id);
      return pdf ? ok({ pdf }) : { status: 404 };
    }
    if (method === 'GET' && parts.length === 3) return ok(customerOut(job, shop));

    if (method === 'POST' && parts.length === 4 && parts[3] === 'intake') {
      const error = await submitIntake(store, job, body);
      return error ?? ok(customerOut(job, shop));
    }
    if (method === 'POST' && parts.length === 4 && parts[3] === 'intake-photo') {
      if (!['invited','checked_in'].includes(job.stage) || job.shopId === DEMO_SHOP_ID) return bad('Photo intake is closed.');
      const src = body.src;
      if (typeof src !== 'string' || src.length > MAX_PHOTO || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+=*$/u.test(src)) return bad('Choose a valid JPEG photo.');
      const photo: Photo = { id: ctx.newId(), src, cap: str(body.cap, 120) || 'Customer photo', source: 'customer', stage: job.stage, addedAt: now };
      if (!await store.intakePhoto?.(job.id, photo, null)) return bad('Photo intake is closed or the six-photo limit was reached.');
      return ok(customerOut((await store.getJob(job.id)) ?? job, shop));
    }
    if (method === 'POST' && parts[3] === 'decision') {
      if (job.stage !== 'approval') return bad('This estimate is not waiting on a decision.');
      const decisions = (body.decisions && typeof body.decisions === 'object' ? body.decisions : {}) as Record<string, unknown>;
      const signature = str(body.signature, 80);
      if (signature.length < 3) return bad('Type your full name to sign.');
      const pending = job.data.estimate.filter((e) => e.status === 'pending');
      if (!pending.length) return bad('There is nothing to decide.');
      for (const e of pending) {
        const v = decisions[e.id];
        if (v !== 'approved' && v !== 'declined') return bad('Choose approve or decline for each item.');
      }
      let yes = 0;
      for (const e of pending) {
        e.status = decisions[e.id] as 'approved' | 'declined';
        if (e.status === 'approved') yes++;
      }
      job.data.approval = { by: signature, t: now };
      job.data.messages.push({ dir: 'in', t: now, text: `Approved ${yes} of ${pending.length} items on the estimate (signed: ${signature}).` });
      job.updatedAt = now;
      await store.putJob(job);
      return ok(customerOut(job, shop));
    }
    return { status: 405 };
  }

  // ---- Guided demo: text a visitor a real customer link (no sign-in, rate limited) ----
  if (parts[1] === 'demo' && parts[2] === 'text' && method === 'POST') {
    const phone = normalizePhone(str(body.phone, 30));
    if (!phone) return bad('Enter a valid mobile number.');
    if (!body.consent) return bad('Check the box to agree to one demo text.');
    let shop = await store.shopById(DEMO_SHOP_ID);
    if (!shop) {
      shop = { id: DEMO_SHOP_ID, ownerId: DEMO_OWNER, name: 'Ridgeline Auto Repair', phone: '', hours: 'Mon–Fri 7:30am–6pm', createdAt: now };
      await store.putShop(shop);
    }
    const dayAgo = new Date(ctx.now().getTime() - 86_400_000).toISOString();
    const recent = (await store.listJobs(DEMO_SHOP_ID, dayAgo))
      .filter((j) => j.createdAt >= dayAgo && j.data.messages.some((m) => m.dir === 'out' && m.delivery === 'sent'));
    if (recent.length >= (deps.demoDailyLimit ?? 10)) return { status: 429, body: 'The demo has sent all of its texts for today. You can keep going with the on-screen version.' };
    if (recent.filter((j) => j.data.customer.phone === phone).length >= DEMO_PER_PHONE_PER_DAY) return { status: 429, body: 'That number already got demo texts today. You can keep going with the on-screen version.' };
    const job: Job = {
      id: ctx.newId(), shopId: DEMO_SHOP_ID, token: deps.newToken(), stage: 'approval', createdAt: now, updatedAt: now,
      data: {
        ro: 'RO-DEMO',
        customer: { name: 'Demo Visitor', phone, consent: true },
        vehicle: { year: '2012', make: 'Chevrolet', model: 'Malibu' },
        plate: '', concern: 'AC blowing warm air', eta: '',
        estimate: [
          { id: 'recharge', item: 'Recharge AC refrigerant', price: 189, status: 'pending' },
          { id: 'condenser', item: 'Replace AC condenser', price: 624, status: 'pending' },
        ],
        photos: [], events: [{ stage: 'checked_in', t: now }, { stage: 'diagnosing', t: now }, { stage: 'approval', t: now }],
        messages: [], approval: null,
      },
    };
    const text = `Talk Shops demo: Ridgeline Auto Repair found what's going on with your 2012 Chevrolet Malibu. Review and approve the estimate ($813.00): ${deps.linkBase}${job.token} Reply STOP to opt out.`;
    const sent = await deps.sms.send(phone, text);
    job.data.messages.push({ dir: 'out', t: now, text, delivery: sent.delivery, ...(sent.note ? { note: sent.note } : {}) });
    await store.putJob(job);
    if (sent.delivery !== 'sent') {
      ctx.log.warn('demo text not sent', { delivery: sent.delivery, note: sent.note });
      const why = sent.delivery === 'not_sent' ? 'Texting is not set up on the server yet.' : (sent.note || 'The texting service turned it down.');
      return { status: 502, body: `The demo text could not be sent. ${why} You can keep going with the on-screen version.` };
    }
    return ok({ token: job.token });
  }

  // ---- Shop staff (signed in) ----
  if (!ctx.userId) return { status: 401, body: 'Sign in first.' };

  if (parts[1] === 'me') {
    const shop = await store.shopByOwner(ctx.userId);
    if (method === 'GET') {
      if (shop) await store.purgeArchive?.(shop.id, archiveCutoff(ctx.now())).catch((e) => ctx.log.warn('archive purge failed', { error: String(e) }));
      return ok({ shop, emailConfigured: !!deps.email });
    }
    if (method === 'POST') {
      const name = str(body.name, 80);
      if (!name) return bad('Enter your shop name.');
      if (body.email !== undefined && str(body.email, 254) && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(str(body.email, 254))) return bad('Enter a valid shop email, or leave it blank.');
      const rates = body.rates ?? shop?.rates ?? [];
      if (!Array.isArray(rates) || rates.length > 250 || !rates.every(validRate)) return bad('Check your rate list (up to 250 rates).');
      const next: Shop = {
        id: shop?.id ?? ctx.newId(),
        ownerId: ctx.userId, rates: rates.map(copyRate),
        name,
        phone: str(body.phone, 30),
        hours: str(body.hours, 60),
        email: body.email === undefined ? shop?.email ?? '' : str(body.email, 254),
        createdAt: shop?.createdAt ?? now,
      };
      await store.putShop(next);
      return ok({ shop: next });
    }
    return { status: 405 };
  }

  if (parts[1] !== 'jobs' && parts[1] !== 'archive') return { status: 404 };
  const shop = await store.shopByOwner(ctx.userId);
  if (!shop) return { status: 409, body: 'Set up your shop first.' };

  if (parts[1] === 'archive') {
    if (method !== 'POST') return { status: 405 };
    if (!store.searchArchive) return { status: 503, body: 'The archive is unavailable.' };
    const cutoff = archiveCutoff(ctx.now());
    await store.purgeArchive?.(shop.id, cutoff);
    const rows = await store.searchArchive(shop.id, cutoff, archiveTerms(str(body.q, 120)), 100);
    return ok({ rows, keepDays: ARCHIVE_DAYS });
  }

  const id = parts[2];
  if (!id) {
    if (method === 'GET') {
      // Everything still in the shop, plus cars picked up in the last 2 days.
      const since = new Date(ctx.now().getTime() - 2 * 86_400_000).toISOString();
      const jobs = await store.listJobs(shop.id, since);
      return ok(jobs.map((j) => jobOut(j, deps.linkBase)));
    }
    if (method === 'POST') {
      const c = (body.customer ?? {}) as Body;
      const v = (body.vehicle ?? {}) as Body;
      const name = str(c.name, 80);
      const phone = normalizePhone(str(c.phone, 30));
      if (!name) return bad('Enter the customer name.');
      const preference = c.preference ?? 'sms';
      if (preference !== 'sms' && preference !== 'email' && preference !== 'both') return bad('Choose text, email, or both.');
      if (preference !== 'email' && !phone) return bad('Enter a valid mobile number.');
      const email = str(c.email, 255);
      if (preference !== 'sms' && (email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))) return bad('Enter a valid email address.');
      const vehicle = { year: str(v.year, 4), make: str(v.make, 40), model: str(v.model, 40) };
      const inviting = body.invite === true;
      if (inviting && c.consent !== true) return bad('Confirm the customer agreed to receive check-in notifications.');
      if (!inviting && (!vehicle.make || !vehicle.model)) return bad('Enter the make and model.');
      const concern = str(body.concern, 1000);
      if (!inviting && !concern) return bad("Enter the customer's concern.");
      const job: Job = {
        id: ctx.newId(),
        shopId: shop.id,
        token: deps.newToken(),
        stage: inviting ? 'invited' : 'checked_in',
        createdAt: now,
        updatedAt: now,
        data: {
          ro: `RO-${await store.nextRo(shop.id)}`,
          customer: { name, phone: phone ?? '', email: preference === 'sms' ? '' : email, preference, consent: c.consent === true },
          vehicle,
          plate: str(body.plate, 12).toUpperCase(),
          concern,
          eta: '',
          estimate: [],
          photos: [],
          events: [{ stage: inviting ? 'invited' : 'checked_in', t: now }],
          messages: [],
          approval: null,
        },
      };
      if (inviting) await store.putJob(job);
      job.data.messages.push(...await notifyCustomer(deps, shop, job, fillTemplate(job.stage, shop, job, deps.linkBase), now));
      await store.putJob(job);
      return ok(jobOut(job, deps.linkBase));
    }
    return { status: 405 };
  }

  const job = await store.getJob(id);
  if (!job || job.shopId !== shop.id) return { status: 404, body: 'Not found.' };
  const action = parts[3];
  if (method === 'GET' && action === 'bill-file' && job.bill?.mode === 'upload') {
    const pdf = await store.getBillPdf?.(id);
    return pdf ? ok({ pdf }) : { status: 404 };
  }
  if (method === 'GET' && !action) return ok(jobOut(job, deps.linkBase));
  if (method !== 'POST') return { status: 405 };
  const d = job.data;

  if (action === 'intake') {
    const error = await submitIntake(store, job, body);
    return error ?? ok(jobOut(job, deps.linkBase));
  }
  if ((action === 'preview' || action === 'stage') &&
      (body.stage === 'invited' || (job.stage === 'invited' && (body.stage !== 'checked_in' || !job.intake))))
    return bad('Complete intake and mark the vehicle checked in before advancing.');
  if (action === 'bill') {
    if (!store.saveBill) return { status: 503, body: 'Billing is unavailable.' };
    const issuer = { shopName: shop.name, phone: shop.phone, issuedAt: now };
    let bill: Bill;
    let pdf: string | null = null;
    if (body.mode === 'upload') {
      if (!amount(body.total, 100_000_000)) return bad('Enter the total printed on the bill.');
      if (typeof body.pdf !== 'string' || body.pdf.length > 4_194_304 || !/^JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(body.pdf) || body.pdf.length % 4 !== 0)
        return bad('Choose a PDF up to 3 MB.');
      pdf = body.pdf;
      bill = { ...issuer, mode: 'upload', total: body.total, filename: str(body.filename, 150) || 'Final-bill.pdf' };
    } else {
      if (body.mode !== 'generated' || !Array.isArray(body.lines) || !body.lines.length || body.lines.length > 150 || !body.lines.every(validCharge))
        return bad('Enter a description, quantity and rate for every bill line (up to 150).');
      const lines: Charge[] = body.lines.map((r: Charge) => ({ ...copyRate(r), qty: r.qty }));
      const total = lines.reduce((sum, r) => sum + lineCents(r), 0) / 100;
      if (total > 100_000_000) return bad('Bill total is too large.');
      bill = { ...issuer, mode: 'generated', lines, total };
      if (body.save === true) await rememberRates(store, shop, lines);
    }
    await store.saveBill(job.id, bill, pdf);
    job.bill = bill;
    return ok(jobOut(job, deps.linkBase));
  }
  if (action === 'preview') {
    const stage = str(body.stage) as Stage;
    if (!STAGES.includes(stage)) return bad('Unknown stage.');
    const eta = str(body.eta, 40);
    const draft = { ...job, data: { ...d, eta: eta || d.eta } };
    return ok({ text: fillTemplate(stage, shop, draft, deps.linkBase) });
  }

  if (action === 'stage') {
    const stage = str(body.stage) as Stage;
    if (!STAGES.includes(stage)) return bad('Unknown stage.');
    if (stage === job.stage) return bad(`Already ${LABEL[stage]}.`);
    if (stage === 'approval' && !d.estimate.some((e) => e.status === 'pending')) return bad('Add at least one estimate line first.');
    if (typeof body.eta === 'string') d.eta = str(body.eta, 40);
    job.stage = stage;
    d.events.push({ stage, t: now });
    const msg = str(body.text, 1000);
    if (body.send && msg) d.messages.push(...await notifyCustomer(deps, shop, job, msg, now));
  } else if (action === 'eta') {
    d.eta = str(body.eta, 40);
  } else if (action === 'estimate') {
    if (body.remove) {
      const before = d.estimate.length;
      d.estimate = d.estimate.filter((e) => !(e.id === body.remove && e.status === 'pending'));
      if (d.estimate.length === before) return bad('Only pending lines can be removed.');
    } else if (body.charge !== undefined) {
      const r = body.charge;
      if (!validCharge(r)) return bad('Check the description, quantity and rate.');
      if (body.save === true) await rememberRates(store, shop, [r]);
      d.estimate.push({ id: ctx.newId(), item: r.name.trim(), price: lineCents(r) / 100, status: 'pending', charge: { ...copyRate(r), qty: r.qty } });
    } else {
      const item = str(body.item, 120);
      const price = Number(body.price);
      if (!item || !Number.isFinite(price) || price < 0 || price > 1_000_000) return bad('Enter an item and a price.');
      if (body.save === true) await rememberRates(store, shop, [{ name: item, kind: 'part', rate: Math.round(price * 100) / 100 }]);
      d.estimate.push({ id: ctx.newId(), item, price: Math.round(price * 100) / 100, status: 'pending' });
    }
  } else if (action === 'remove-photo') {
    const id = str(body.id, 100);
    if (!id) return bad('Choose a photo to remove.');
    if (job.intakePhotos?.some((p) => p.id === id)) {
      if (!await store.intakePhoto?.(job.id, null, id)) return bad('Could not remove the customer photo.');
      return ok(jobOut((await store.getJob(job.id)) ?? job, deps.linkBase));
    }
    if (!d.photos.some((p) => p.id === id)) return ok(jobOut(job, deps.linkBase));
    d.photos = d.photos.filter((p) => p.id !== id);
  } else if (action === 'photo') {
    const src = typeof body.src === 'string' ? body.src : '';
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(src) || src.length > MAX_PHOTO) return bad('That photo could not be added.');
    if (d.photos.length >= MAX_PHOTOS) return bad(`Up to ${MAX_PHOTOS} photos per car.`);
    d.photos.push({ id: ctx.newId(), src, cap: str(body.cap, 120) || 'Photo', stage: job.stage, addedAt: now });
  } else if (action === 'message') {
    const msg = str(body.text, 1000);
    if (!msg) return bad('Type a message.');
    d.messages.push(...await notifyCustomer(deps, shop, job, msg, now));
  } else {
    return { status: 404 };
  }
  job.updatedAt = now;
  await store.putJob(job);
  return ok(jobOut(job, deps.linkBase));
}

/** Twilio sender. Without credentials, texts are saved on the job but marked as not sent. */
export function createTwilioSender(sid?: string, token?: string, from?: string, fetchImpl: typeof fetch = fetch): SmsSender {
  return {
    async send(to, body) {
      if (!sid || !token || !from) return { delivery: 'not_sent', note: 'Texting is not set up yet.' };
      try {
        const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(from.startsWith('MG') ? { To: to, MessagingServiceSid: from, Body: body } : { To: to, From: from, Body: body }),
        });
        if (res.ok) return { delivery: 'sent' };
        const detail = await res.text().catch(() => '');
        // Twilio answers with JSON like {"code":21608,"message":"The number ... is unverified..."}; keep the readable part.
        let reason = detail.slice(0, 200);
        try { const j = JSON.parse(detail); if (j?.message) reason = `${j.message}${j.code ? ` (Twilio error ${j.code})` : ''}`; } catch { /* not JSON */ }
        return { delivery: 'failed', note: `Text failed (${res.status}): ${reason.slice(0, 240)}` };
      } catch (error) {
        return { delivery: 'failed', note: `Text failed: ${(error as Error).message}` };
      }
    },
  };
}
