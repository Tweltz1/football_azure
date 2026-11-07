// Bay Status: repair shop progress updates. Shop staff sign in (Supabase auth) and move each car
// through stages; each change can text the customer. Customers never sign in: their text carries a
// link with a long random token that opens their car's page, where they can approve or decline work.

import type { Ctx, Res } from './handlers.ts';

type Body = Record<string, unknown>;

export const STAGES = ['checked_in', 'diagnosing', 'approval', 'parts', 'in_progress', 'qc', 'ready', 'picked_up'] as const;
export type Stage = typeof STAGES[number];

export interface Shop {
  id: string;
  ownerId: string;
  name: string;
  phone: string;
  hours: string;
  createdAt: string;
}

export interface EstimateLine { id: string; item: string; price: number; status: 'pending' | 'approved' | 'declined' }
export interface Photo { id: string; src: string; cap: string }
export interface StageEvent { stage: Stage; t: string }
export interface Message { dir: 'out' | 'in'; t: string; text: string; delivery?: 'sent' | 'not_sent' | 'failed'; note?: string }

export interface JobData {
  ro: string;
  customer: { name: string; phone: string; consent: boolean };
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

export interface Job {
  id: string;
  shopId: string;
  token: string;
  stage: Stage;
  data: JobData;
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
  /** Next repair order number for the shop, starting at 1001. */
  nextRo(shopId: string): Promise<number>;
}

export interface SmsResult { delivery: 'sent' | 'not_sent' | 'failed'; note?: string }
export interface SmsSender { send(to: string, text: string): Promise<SmsResult> }

export interface ShopDeps {
  store: ShopStore;
  sms: SmsSender;
  /** Customer links are this plus the job's token, e.g. https://hood-league.com/shop/?c= */
  linkBase: string;
  newToken: () => string;
}

const LABEL: Record<Stage, string> = {
  checked_in: 'Checked in', diagnosing: 'Diagnosing', approval: 'Approval needed', parts: 'Waiting on parts',
  in_progress: 'In progress', qc: 'Quality check', ready: 'Ready for pickup', picked_up: 'Picked up',
};

const TEMPLATES: Record<Stage, string> = {
  checked_in: "Hi {first}, {shop} has your {vehicle}. We'll text you as work moves along. Track it here: {link}",
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
  const d = job.data;
  const vals: Record<string, string> = {
    first: d.customer.name.split(/\s+/)[0] || 'there',
    shop: shop.name,
    vehicle: vehicleName(d) || 'car',
    link: linkBase + job.token,
    total: money(total(d, stage === 'ready')),
    eta: d.eta || 'soon',
    hours: shop.hours || 'during business hours',
  };
  return TEMPLATES[stage].replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '');
}

/** What the shop sees. */
const jobOut = (j: Job, linkBase: string) => ({
  id: j.id, stage: j.stage, link: linkBase + j.token, createdAt: j.createdAt, updatedAt: j.updatedAt, ...j.data,
});

/** What the customer sees: no phone number, no other customers, no internal notes. */
const customerOut = (j: Job, shop: Shop) => ({
  shop: { name: shop.name, phone: shop.phone, hours: shop.hours },
  ro: j.data.ro,
  stage: j.stage,
  firstName: j.data.customer.name.split(/\s+/)[0] || '',
  vehicle: vehicleName(j.data),
  concern: j.data.concern,
  eta: j.data.eta,
  estimate: j.data.estimate,
  photos: j.data.photos,
  events: j.data.events,
  approval: j.data.approval,
});

async function text(deps: ShopDeps, job: Job, body: string, now: string): Promise<Message> {
  const msg: Message = { dir: 'out', t: now, text: body };
  if (!job.data.customer.consent) return { ...msg, delivery: 'not_sent', note: 'Customer has not agreed to texts.' };
  const result = await deps.sms.send(job.data.customer.phone, body);
  return { ...msg, delivery: result.delivery, ...(result.note ? { note: result.note } : {}) };
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

    if (method === 'GET' && parts.length === 3) return ok(customerOut(job, shop));

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

  // ---- Shop staff (signed in) ----
  if (!ctx.userId) return { status: 401, body: 'Sign in first.' };

  if (parts[1] === 'me') {
    const shop = await store.shopByOwner(ctx.userId);
    if (method === 'GET') return ok({ shop });
    if (method === 'POST') {
      const name = str(body.name, 80);
      if (!name) return bad('Enter your shop name.');
      const next: Shop = {
        id: shop?.id ?? ctx.newId(),
        ownerId: ctx.userId,
        name,
        phone: str(body.phone, 30),
        hours: str(body.hours, 60),
        createdAt: shop?.createdAt ?? now,
      };
      await store.putShop(next);
      return ok({ shop: next });
    }
    return { status: 405 };
  }

  if (parts[1] !== 'jobs') return { status: 404 };
  const shop = await store.shopByOwner(ctx.userId);
  if (!shop) return { status: 409, body: 'Set up your shop first.' };

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
      if (!phone) return bad('Enter a valid mobile number.');
      const vehicle = { year: str(v.year, 4), make: str(v.make, 40), model: str(v.model, 40) };
      if (!vehicle.make || !vehicle.model) return bad('Enter the make and model.');
      const concern = str(body.concern, 1000);
      if (!concern) return bad("Enter the customer's concern.");
      const job: Job = {
        id: ctx.newId(),
        shopId: shop.id,
        token: deps.newToken(),
        stage: 'checked_in',
        createdAt: now,
        updatedAt: now,
        data: {
          ro: `RO-${await store.nextRo(shop.id)}`,
          customer: { name, phone, consent: Boolean(c.consent) },
          vehicle,
          plate: str(body.plate, 12).toUpperCase(),
          concern,
          eta: '',
          estimate: [],
          photos: [],
          events: [{ stage: 'checked_in', t: now }],
          messages: [],
          approval: null,
        },
      };
      job.data.messages.push(await text(deps, job, fillTemplate('checked_in', shop, job, deps.linkBase), now));
      await store.putJob(job);
      return ok(jobOut(job, deps.linkBase));
    }
    return { status: 405 };
  }

  const job = await store.getJob(id);
  if (!job || job.shopId !== shop.id) return { status: 404, body: 'Not found.' };
  const action = parts[3];
  if (method === 'GET' && !action) return ok(jobOut(job, deps.linkBase));
  if (method !== 'POST') return { status: 405 };
  const d = job.data;

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
    if (body.send && msg) d.messages.push(await text(deps, job, msg, now));
  } else if (action === 'eta') {
    d.eta = str(body.eta, 40);
  } else if (action === 'estimate') {
    if (body.remove) {
      const before = d.estimate.length;
      d.estimate = d.estimate.filter((e) => !(e.id === body.remove && e.status === 'pending'));
      if (d.estimate.length === before) return bad('Only pending lines can be removed.');
    } else {
      const item = str(body.item, 120);
      const price = Number(body.price);
      if (!item || !Number.isFinite(price) || price < 0 || price > 1_000_000) return bad('Enter an item and a price.');
      d.estimate.push({ id: ctx.newId(), item, price: Math.round(price * 100) / 100, status: 'pending' });
    }
  } else if (action === 'photo') {
    const src = typeof body.src === 'string' ? body.src : '';
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(src) || src.length > MAX_PHOTO) return bad('That photo could not be added.');
    if (d.photos.length >= MAX_PHOTOS) return bad(`Up to ${MAX_PHOTOS} photos per car.`);
    d.photos.push({ id: ctx.newId(), src, cap: str(body.cap, 120) || 'Photo' });
  } else if (action === 'message') {
    const msg = str(body.text, 1000);
    if (!msg) return bad('Type a message.');
    d.messages.push(await text(deps, job, msg, now));
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
        return { delivery: 'failed', note: `Text failed (${res.status}). ${detail.slice(0, 120)}` };
      } catch (error) {
        return { delivery: 'failed', note: `Text failed: ${(error as Error).message}` };
      }
    },
  };
}
