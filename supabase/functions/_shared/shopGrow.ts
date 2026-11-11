// Talk Shops growth tools, none of which cost anything to run:
// - results dashboard (Pro): approvals, money approved and declined, days in the shop, on-time rate,
//   reminder texts and the work they brought back, review requests, technician hours;
// - review requests after pickup (Pro), shop branding (Pro), technician time clock (Pro);
// - online booking requests and CSV export (every plan);
// - Spanish texts for customers who prefer Spanish (every plan).

import type { Job, JobData } from './shop.ts';
import { fitOne } from './smsFit.ts';
import { parseSchedule, type Schedule } from './shopSchedule.ts';

type Body = Record<string, unknown>;
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ts = (t: string | undefined | null) => (t ? Date.parse(t) : NaN);

// ---------------- Shop settings ----------------

/** The shop's logo and accent color on the customer page and printouts. Pro. */
export interface Brand { logo?: string; color?: string }
/** Review link and online booking. */
export interface Grow {
  reviewUrl?: string; reviewAuto?: boolean; bookingOn?: boolean; bookingNote?: string;
  /** Street address; the customer page links it to map directions. */
  address?: string;
  /** Hours after an estimate is sent to text the customer once if they haven't answered. 0 or missing: off. */
  nudgeHours?: number;
  /** A short morning email to the shop email: cars in, waiting on approval, approved yesterday, late promises. */
  digest?: boolean;
  /** The shop-local day the last morning email went out (YYYY-MM-DD). */
  digestSentOn?: string;
  /** Appointment hours and slots. When set, the booking page shows open times instead of a day and part of the day. */
  schedule?: Schedule;
}
export const NUDGE_HOURS = [0, 2, 4, 24] as const;

const MAX_LOGO = 160_000; // a 320px PNG or JPEG logo is well under this
export function parseBrand(v: unknown): Brand | string {
  if (v === null) return {};
  if (!v || typeof v !== 'object') return 'Check your logo and color.';
  const b = v as Body, out: Brand = {};
  if (b.logo) {
    if (typeof b.logo !== 'string' || b.logo.length > MAX_LOGO || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(b.logo)) return 'Choose a PNG or JPEG logo under 120 KB.';
    out.logo = b.logo;
  }
  if (b.color) {
    if (typeof b.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(b.color)) return 'Pick a color.';
    out.color = b.color.toLowerCase();
  }
  return out;
}
export function parseGrow(v: unknown, old: Grow | undefined): Grow | string {
  if (!v || typeof v !== 'object') return 'Check your review link and booking settings.';
  const g = v as Body, out: Grow = { ...(old ?? {}) };
  if (g.reviewUrl !== undefined) {
    const url = str(g.reviewUrl, 400);
    if (url && !/^https:\/\/[^\s"<>]+$/i.test(url)) return 'Paste the full review link, starting with https://';
    if (url) out.reviewUrl = url; else delete out.reviewUrl;
  }
  if (g.reviewAuto !== undefined) out.reviewAuto = g.reviewAuto === true;
  if (g.bookingOn !== undefined) out.bookingOn = g.bookingOn === true;
  if (g.bookingNote !== undefined) { const n = str(g.bookingNote, 300); if (n) out.bookingNote = n; else delete out.bookingNote; }
  if (g.address !== undefined) { const a = str(g.address, 160).replace(/\s+/g, ' '); if (a) out.address = a; else delete out.address; }
  if (g.nudgeHours !== undefined) {
    const h = Number(g.nudgeHours);
    if (!(NUDGE_HOURS as readonly number[]).includes(h)) return 'Choose when to remind customers about an unanswered estimate.';
    if (h) out.nudgeHours = h; else delete out.nudgeHours;
  }
  if (g.digest !== undefined) out.digest = g.digest === true;
  if (g.schedule !== undefined) {
    const sc = parseSchedule(g.schedule);
    if (typeof sc === 'string') return sc;
    if (sc) out.schedule = sc; else delete out.schedule;
  }
  return out;
}

// ---------------- Spanish ----------------

export type Lang = 'en' | 'es';
export const langOf = (d: Pick<JobData, 'customer'>): Lang => (d.customer.lang === 'es' ? 'es' : 'en');

// Spanish texts are sent without the accents GSM texting lacks (á, í, ó, ú), so they stay one 160-character segment.
export const TEMPLATES_ES = {
  invited: '{shop}: registre su vehículo y suba fotos aquí: {link} Responda STOP para salir',
  checked_in: '{shop} ya tiene su {vehicle}. Sígalo aquí: {link} Responda STOP para salir',
  diagnosing: 'Hola {first}, estamos revisando su {vehicle} ahora.',
  approval: 'El presupuesto de su {vehicle} ({total}) está listo para aprobar: {link}',
  parts: 'Las piezas de su {vehicle} están pedidas, llegan {eta}.',
  in_progress: 'Ya empezamos a reparar su {vehicle}.',
  qc: 'La reparación de su {vehicle} está lista. Revisión final en curso.',
  ready: '¡Su {vehicle} está listo! Total {total}. Horario: {hours}. {link}',
  picked_up: '¡Gracias por elegir {shop}! ¿Cómo lo hicimos? Responda STOP para salir.',
} as const;
export const SHORT_ES = {
  invited: '{shop}: regístrese aquí: {link} Responda STOP para salir',
  checked_in: '{shop} ya tiene su vehículo: {link} Responda STOP para salir',
  diagnosing: 'Estamos revisando su vehículo ahora.',
  approval: 'Su presupuesto ({total}) está listo para aprobar: {link}',
  parts: 'Las piezas están pedidas, llegan {eta}.',
  in_progress: 'Ya empezamos a reparar su vehículo.',
  qc: 'La reparación está lista. Revisión final en curso.',
  ready: '¡Su vehículo está listo! Total {total}. {link}',
  picked_up: '¡Gracias por elegirnos! ¿Cómo lo hicimos? Responda STOP para salir.',
} as const;

/** Words the server puts into its own texts, by language. */
export const SAY = {
  en: {
    car: 'car', soon: 'soon', hours: 'during business hours', subject: 'repair update', details: 'Repair details: ',
    stop: 'Reply STOP to opt out.',
    walkaround: (shop: string, car: string, link: string) => fitOne([`${shop} asks for 8 quick photos of your ${car} to record its condition (about 2 min): ${link}`, `${shop}: please take 8 quick photos of your vehicle: ${link}`]),
    note: (car: string, shop: string, text: string, link: string) => fitOne([`Update on your ${car} from ${shop}: ${text} Details: ${link}`, `${shop}: ${text} ${link}`]),
    walk: (shop: string, kind: 'before' | 'after', car: string, good: number, soon: number, now: number, link: string) =>
      fitOne([`${shop} finished the ${kind === 'before' ? 'check-in' : 'after-repair'} walk-through of your ${car}: ${[`${good} good`, soon ? `${soon} to keep an eye on` : '', now ? `${now} that need${now === 1 ? 's' : ''} attention now` : ''].filter(Boolean).join(', ')}. Full report: ${link}`,
        `${shop} ${kind === 'before' ? 'check-in' : 'after-repair'} walk-through: ${[`${good} good`, soon ? `${soon} to watch` : '', now ? `${now} need${now === 1 ? 's' : ''} attention` : ''].filter(Boolean).join(', ')}. ${link}`]),
    review: (first: string, shop: string, url: string) => fitOne([`Thanks for choosing ${shop}, ${first}! If we earned it, would you leave us a quick review? ${url}`, `Thanks for choosing ${shop}! Would you leave us a quick review? ${url}`]),
    reviewTail: (url: string) => ` Leave us a review: ${url}`,
    // Sent with the STOP line added after it, like the estimate reminder.
    remind: (shop: string, when: string, phone: string) => fitOne([`Reminder: your appointment at ${shop} is tomorrow, ${when}.${phone ? ` To change it, call ${phone}.` : ''} Reply STOP to opt out.`, `Reminder: ${shop} appointment tomorrow, ${when}. Reply STOP to opt out.`]).replace(/ Reply STOP to opt out\.$/, ''),
    booked: (first: string, shop: string, when: string, link: string) => fitOne([`Hi ${first}, ${shop} confirmed your appointment for ${when}. Details and photos: ${link}`, `${shop}: appointment confirmed for ${when}. ${link}`]),
    // Sent with the STOP line added after it, so the choice is made with it included.
    nudge: (shop: string, car: string, link: string) => fitOne([`${shop}: your ${car} estimate is still waiting for your OK: ${link} Reply STOP to opt out.`, `${shop}: your estimate is still waiting for your OK: ${link} Reply STOP to opt out.`]).replace(/ Reply STOP to opt out\.$/, ''),
  },
  es: {
    car: 'vehículo', soon: 'pronto', hours: 'en horario de atención', subject: 'actualización de su reparación', details: 'Detalles de la reparación: ',
    stop: 'Responda STOP para salir.',
    walkaround: (shop: string, car: string, link: string) => fitOne([`${shop} le pide 8 fotos rápidas de su ${car} por todos los lados. Toma unos 2 minutos: ${link}`, `${shop}: tome 8 fotos rápidas de su vehículo: ${link}`]),
    note: (car: string, shop: string, text: string, link: string) => fitOne([`Novedades sobre su ${car} de ${shop}: ${text} Detalles: ${link}`, `${shop}: ${text} ${link}`]),
    walk: (shop: string, kind: 'before' | 'after', car: string, good: number, soon: number, now: number, link: string) =>
      fitOne([`${shop} terminó la revisión ${kind === 'before' ? 'de entrada' : 'después de la reparación'} de su ${car}: ${[`${good} bien`, soon ? `${soon} para vigilar` : '', now ? `${now} que necesita${now === 1 ? '' : 'n'} atención ya` : ''].filter(Boolean).join(', ')}. Informe: ${link}`,
        `${shop}, revisión ${kind === 'before' ? 'de entrada' : 'final'}: ${[`${good} bien`, soon ? `${soon} para vigilar` : '', now ? `${now} urgente${now === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')}. ${link}`]),
    review: (first: string, shop: string, url: string) => fitOne([`¡Gracias por elegir ${shop}, ${first}! Si quedó contento, ¿nos dejaría una reseña rápida? ${url}`, `¡Gracias por elegir ${shop}! ¿Nos dejaría una reseña? ${url}`]),
    reviewTail: (url: string) => ` Déjenos una reseña: ${url}`,
    remind: (shop: string, when: string, phone: string) => fitOne([`Recordatorio: su cita en ${shop} es mañana, ${when}.${phone ? ` Para cambiarla llame al ${phone}.` : ''} Responda STOP para salir.`, `Recordatorio: cita en ${shop} mañana, ${when}. Responda STOP para salir.`]).replace(/ Responda STOP para salir\.$/, ''),
    booked: (first: string, shop: string, when: string, link: string) => fitOne([`Hola ${first}, ${shop} confirmó su cita para el ${when}. Detalles y fotos: ${link}`, `${shop}: cita confirmada para el ${when}. ${link}`]),
    nudge: (shop: string, car: string, link: string) => fitOne([`${shop}: el presupuesto de su ${car} sigue esperando su respuesta: ${link} Responda STOP para salir.`, `${shop}: su presupuesto sigue esperando su respuesta: ${link} Responda STOP para salir.`]).replace(/ Responda STOP para salir\.$/, ''),
  },
} as const;

// ---------------- Time clock ----------------

export interface ClockEntry { id: string; by: { id: string; name: string }; start: string; end?: string }
const MAX_CLOCK = 100;

/** Clocks the person on or off this car. Returns an error message, or null when it worked. */
export function clockAction(d: JobData, body: Body, me: { id: string; name: string }, owner: boolean, now: string, newId: () => string): string | null {
  const list = d.clock ??= [];
  const mine = list.find((e) => !e.end && e.by.id === me.id);
  if (body.on === true) {
    if (mine) return "You're already clocked in on this car.";
    if (list.length >= MAX_CLOCK) return 'This car has too many time entries.';
    list.push({ id: newId(), by: me, start: now });
    return null;
  }
  if (body.on === false) {
    const entry = body.entry ? list.find((e) => e.id === body.entry && !e.end) : mine;
    if (!entry) return "There's no running clock to stop.";
    if (entry.by.id !== me.id && !owner) return 'Only an owner can stop someone else\'s clock.';
    entry.end = now;
    return null;
  }
  if (body.remove) {
    if (!owner) return 'Only an owner can remove a time entry.';
    const before = list.length;
    d.clock = list.filter((e) => e.id !== body.remove);
    return d.clock.length === before ? 'That time entry was already removed.' : null;
  }
  return 'Choose clock in or clock out.';
}
export const clockHours = (list: ClockEntry[] | undefined, now: number, techId?: string) =>
  (list ?? []).filter((e) => !techId || e.by.id === techId).reduce((a, e) => a + Math.max(0, (e.end ? ts(e.end) : now) - ts(e.start)), 0) / 3_600_000;
/** Labor hours sold on approved lines (labor quantity is hours). */
export const soldHours = (d: Pick<JobData, 'estimate'>) =>
  d.estimate.filter((e) => e.status === 'approved' && e.charge?.kind === 'labor').reduce((a, e) => a + (e.charge?.qty ?? 0), 0);

// ---------------- Results dashboard ----------------

const money = (n: number) => Math.round(n * 100) / 100;
const phoneKey = (p: string) => p.replace(/\D/g, '').slice(-10);
const pickedAt = (j: Job) => [...j.data.events].reverse().find((e) => e.stage === 'picked_up')?.t ?? null;
const readyAt = (j: Job) => [...j.data.events].reverse().find((e) => e.stage === 'ready')?.t ?? pickedAt(j);

export interface Results {
  days: number; since: string;
  cars: { in: number; out: number; closed: number; open: number };
  money: { approved: number; declined: number; billed: number; avgTicket: number };
  approvalRate: number | null; lineApproval: number | null;
  avgDays: number | null; onTime: number | null; promisedCount: number;
  reminders: { sent: number; declinedSent: number; cameBack: number; cameBackMoney: number };
  reviews: { asked: number; clicked: number };
  bookings: { fromBooking: number };
  techs: { id: string; name: string; cars: number; approved: number; hours: number; soldHours: number; onTime: number | null }[];
  weeks: { start: string; in: number; approved: number }[];
  topDeclined: { item: string; count: number; money: number }[];
}

/**
 * Numbers for the last `days` days from the shop's repairs (created on or after `since`). `history` is every repair
 * kept (a year), used to see whether a customer came back after a declined-work reminder.
 */
export function results(jobs: Job[], history: Job[], days: number, now: Date): Results {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const inRange = jobs.filter((j) => j.createdAt >= since && j.stage !== 'invited');
  const out = inRange.filter((j) => j.stage === 'picked_up' && !j.data.closed);
  const decidedLines = inRange.flatMap((j) => j.data.estimate.filter((e) => e.status !== 'pending'));
  const approvedLines = decidedLines.filter((e) => e.status === 'approved');
  const sum = (l: { price: number }[]) => l.reduce((a, e) => a + Number(e.price || 0), 0);
  const decidedJobs = inRange.filter((j) => j.data.approval && j.data.estimate.some((e) => e.status !== 'pending'));
  const total = (j: Job) => j.bill?.total ?? sum(j.data.estimate.filter((e) => e.status === 'approved'));
  const billed = out.reduce((a, j) => a + total(j), 0);
  const stays = out.map((j) => (ts(pickedAt(j)) - ts(j.createdAt)) / 86_400_000).filter((x) => Number.isFinite(x) && x >= 0);
  const promised = inRange.filter((j) => j.data.promised && readyAt(j));
  const onTime = promised.filter((j) => ts(readyAt(j)) <= ts(j.data.promised!) + 5 * 60_000);

  // Reminders sent in range, and whether the customer had a new visit within 60 days after a declined-work one.
  let sent = 0, declinedSent = 0, cameBack = 0, cameBackMoney = 0;
  for (const j of history) for (const f of j.data.followups ?? []) {
    if (!f.sentAt || f.sentAt < since) continue;
    sent++;
    if (f.kind !== 'declined') continue;
    declinedSent++;
    const key = phoneKey(j.data.customer.phone || ''), at = ts(f.sentAt);
    const back = key ? history.find((o) => o.id !== j.id && phoneKey(o.data.customer.phone || '') === key && ts(o.createdAt) >= at && ts(o.createdAt) <= at + 60 * 86_400_000) : null;
    if (back) { cameBack++; cameBackMoney += total(back); }
  }

  const reviewsAsked = history.filter((j) => j.data.review?.askedAt && j.data.review.askedAt >= since);
  const techs = new Map<string, Results['techs'][number] & { promised: number; kept: number }>();
  for (const j of inRange) {
    const people = new Map<string, string>();
    for (const e of j.data.clock ?? []) people.set(e.by.id, e.by.name);
    if (j.data.tech) people.set(j.data.tech.id, j.data.tech.name);
    for (const [id, name] of people) {
      const t = techs.get(id) ?? { id, name, cars: 0, approved: 0, hours: 0, soldHours: 0, onTime: null, promised: 0, kept: 0 };
      t.hours += clockHours(j.data.clock, now.getTime(), id);
      if (j.data.tech?.id === id) {
        t.cars++; t.approved += sum(j.data.estimate.filter((e) => e.status === 'approved')); t.soldHours += soldHours(j.data);
        if (j.data.promised && readyAt(j)) { t.promised++; if (ts(readyAt(j)) <= ts(j.data.promised) + 5 * 60_000) t.kept++; }
      }
      techs.set(id, t);
    }
  }

  const weeks: Results['weeks'] = [];
  const weekCount = Math.min(13, Math.ceil(days / 7));
  for (let i = weekCount - 1; i >= 0; i--) {
    const end = now.getTime() - i * 7 * 86_400_000, start = end - 7 * 86_400_000;
    const w = inRange.filter((j) => ts(j.createdAt) >= start && ts(j.createdAt) < end);
    weeks.push({ start: new Date(start).toISOString(), in: w.length, approved: money(w.reduce((a, j) => a + sum(j.data.estimate.filter((e) => e.status === 'approved')), 0)) });
  }

  const declinedBy = new Map<string, { item: string; count: number; money: number }>();
  for (const e of decidedLines.filter((x) => x.status === 'declined')) {
    const k = e.item.trim().toLowerCase();
    const row = declinedBy.get(k) ?? { item: e.item.trim(), count: 0, money: 0 };
    row.count++; row.money += Number(e.price || 0);
    declinedBy.set(k, row);
  }

  return {
    days, since,
    cars: { in: inRange.length, out: out.length, closed: inRange.filter((j) => j.data.closed).length, open: inRange.filter((j) => j.stage !== 'picked_up' && !j.data.closed).length },
    money: { approved: money(sum(approvedLines)), declined: money(sum(decidedLines.filter((e) => e.status === 'declined'))), billed: money(billed), avgTicket: out.length ? money(billed / out.length) : 0 },
    approvalRate: decidedLines.length ? sum(approvedLines) / Math.max(0.01, sum(decidedLines)) : null,
    lineApproval: decidedLines.length ? approvedLines.length / decidedLines.length : null,
    avgDays: stays.length ? Math.round((stays.reduce((a, b) => a + b, 0) / stays.length) * 10) / 10 : null,
    onTime: promised.length ? onTime.length / promised.length : null, promisedCount: promised.length,
    reminders: { sent, declinedSent, cameBack, cameBackMoney: money(cameBackMoney) },
    reviews: { asked: reviewsAsked.length, clicked: reviewsAsked.filter((j) => j.data.review?.clickedAt).length },
    bookings: { fromBooking: inRange.filter((j) => j.data.booking).length },
    techs: [...techs.values()].map(({ promised: p, kept, ...t }) => ({ ...t, approved: money(t.approved), hours: Math.round(t.hours * 10) / 10, soldHours: Math.round(t.soldHours * 10) / 10, onTime: p ? kept / p : null }))
      .sort((a, b) => b.approved - a.approved),
    weeks,
    topDeclined: [...declinedBy.values()].sort((a, b) => b.money - a.money).slice(0, 6).map((r) => ({ ...r, money: money(r.money) })),
  };
}

// ---------------- CSV export ----------------

const cell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  // Keep spreadsheet apps from running a cell as a formula.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d\s().-]*$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
const day = (t: string | null | undefined) => (t ? t.slice(0, 10) : '');
const car = (j: Job) => { const v = j.intake?.vehicle ?? j.data.vehicle; return [v.year, v.make, v.model].filter(Boolean).join(' '); };
const STAGE_NAME: Record<string, string> = {
  invited: 'Invited', checked_in: 'Checked in', diagnosing: 'Diagnosing', approval: 'Estimate review', parts: 'Waiting on parts',
  in_progress: 'In progress', qc: 'Quality check', ready: 'Ready for pickup', picked_up: 'Picked up',
};

/** Every repair kept (one year), one row each. */
export function jobsCsv(jobs: Job[]): string {
  const rows: unknown[][] = [['RO', 'Checked in', 'Status', 'Picked up', 'Customer', 'Phone', 'Email', 'Language', 'Vehicle', 'VIN', 'Plate', 'Mileage in', 'Mileage out',
    'Concern', 'Technician', 'Approved', 'Declined', 'Bill total', 'Declined items', 'Closed reason']];
  for (const j of [...jobs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const d = j.data, s = (st: string) => d.estimate.filter((e) => e.status === st).reduce((a, e) => a + Number(e.price || 0), 0);
    rows.push([d.ro, day(j.createdAt), d.closed ? 'Closed' : STAGE_NAME[j.stage] ?? j.stage, day(pickedAt(j)), d.customer.name, d.customer.phone, d.customer.email ?? '',
      d.customer.lang === 'es' ? 'Spanish' : 'English', car(j), d.vehicle.vin ?? '', j.intake?.plate ?? d.plate ?? '', d.mileageIn ?? '', d.mileageOut ?? '',
      j.intake?.concern ?? d.concern ?? '', d.tech?.name ?? '', money(s('approved')).toFixed(2), money(s('declined')).toFixed(2), j.bill ? j.bill.total.toFixed(2) : '',
      d.estimate.filter((e) => e.status === 'declined').map((e) => e.item).join('; '), d.closed?.reason ?? '']);
  }
  return csv(rows);
}

/** One row per customer (matched by phone, else email, else name), newest details first. */
export function customersCsv(jobs: Job[]): string {
  const by = new Map<string, { name: string; phone: string; email: string; lang: string; visits: number; first: string; last: string; spent: number; vehicles: Set<string>; texts: string }>();
  for (const j of [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const c = j.data.customer;
    const key = phoneKey(c.phone || '') || (c.email || '').toLowerCase() || c.name.trim().toLowerCase();
    if (!key) continue;
    const row = by.get(key) ?? { name: c.name, phone: c.phone, email: c.email ?? '', lang: c.lang === 'es' ? 'Spanish' : 'English', visits: 0, first: j.createdAt, last: j.createdAt, spent: 0, vehicles: new Set<string>(),
      texts: c.remindersOff ? 'Stopped reminders' : c.consent ? 'Yes' : 'No' };
    row.visits++; row.first = j.createdAt;
    if (!row.email && c.email) row.email = c.email;
    if (car(j)) row.vehicles.add(car(j));
    if (j.stage === 'picked_up' && !j.data.closed) row.spent += j.bill?.total ?? j.data.estimate.filter((e) => e.status === 'approved').reduce((a, e) => a + Number(e.price || 0), 0);
    by.set(key, row);
  }
  const rows: unknown[][] = [['Name', 'Phone', 'Email', 'Language', 'Agreed to messages', 'Visits', 'First visit', 'Last visit', 'Spent (picked up)', 'Vehicles']];
  for (const r of by.values()) rows.push([r.name, r.phone, r.email, r.lang, r.texts, r.visits, day(r.first), day(r.last), money(r.spent).toFixed(2), [...r.vehicles].join('; ')]);
  return csv(rows);
}

// ---------------- Online booking ----------------

export interface Booking {
  id: string; shopId: string; status: 'open' | 'accepted' | 'declined'; createdAt: string; updatedAt: string;
  data: {
    customer: { name: string; phone: string; email: string; preference: 'sms' | 'email' | 'both'; consent: boolean; lang: Lang };
    vehicle: { year: string; make: string; model: string }; plate: string; concern: string;
    /** What the customer asked for: a day (YYYY-MM-DD) and a part of the day. */
    day: string; time: 'morning' | 'afternoon' | 'any';
    /** The exact time the customer picked (ISO), when the shop has appointment hours set. */
    slot?: string;
    jobId?: string; decidedBy?: string; decidedAt?: string;
  };
}
export interface BookingStore {
  bookingShop(token: string): Promise<{ id: string } | null>;
  addBooking(b: Booking): Promise<void>;
  openBookings(shopId: string, limit: number): Promise<Booking[]>;
  getBooking(id: string): Promise<Booking | null>;
  putBooking(b: Booking): Promise<void>;
}
export const MAX_OPEN_BOOKINGS = 60;
/** New booking requests one shop takes per hour, so a script can't fill the queue in one go. */
export const MAX_BOOKINGS_PER_HOUR = 12;

/** Checks the public booking form. Returns the booking data or an error message. */
export function parseBooking(body: Body, normalizePhone: (s: string) => string | null, today: string): Booking['data'] | string {
  const c = (body.customer ?? {}) as Body, v = (body.vehicle ?? {}) as Body;
  const name = str(c.name, 80);
  if (!name) return 'Enter your name.';
  const preference = c.preference === 'email' || c.preference === 'both' ? c.preference : 'sms';
  const phone = normalizePhone(str(c.phone, 30));
  const email = str(c.email, 254);
  if (preference !== 'email' && !phone) return 'Enter a mobile number we can text.';
  if (preference !== 'sms' && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return 'Enter a valid email address.';
  if (email && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return 'Enter a valid email address, or leave it blank.';
  const vehicle = { year: str(v.year, 4), make: str(v.make, 40), model: str(v.model, 40) };
  if (!vehicle.make || !vehicle.model) return 'Enter the make and model.';
  const concern = str(body.concern, 1000);
  if (!concern) return 'Tell the shop what the car needs.';
  const d = str(body.day, 10);
  // `today` is the UTC date, which is already tomorrow in the evening across the US, so the customer's today counts too.
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(d + 'T12:00:00Z') : NaN, t0 = Date.parse(today + 'T00:00:00Z') - 86_400_000;
  if (!Number.isFinite(dt) || dt < t0 || dt > t0 + 120 * 86_400_000) return 'Pick a day from today up to about four months out.';
  const time = body.time === 'morning' || body.time === 'afternoon' ? body.time : 'any';
  return {
    customer: { name, phone: phone ?? '', email, preference, consent: c.consent === true, lang: c.lang === 'es' ? 'es' : 'en' },
    vehicle, plate: str(body.plate, 12).toUpperCase(), concern, day: d, time,
  };
}
