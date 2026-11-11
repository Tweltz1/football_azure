// Talk Shops appointment scheduling: the shop's open hours and appointment slots, and the open times a customer
// can pick on the public booking page (/?book=<token>). Pure functions, so they're easy to test.
// Times are kept in the shop's own time zone (an IANA name such as America/Chicago) and stored as UTC ISO strings.

type Body = Record<string, unknown>;

/** Open and close time for one weekday ("08:00", "17:00"), or null when the shop takes no appointments that day. */
export type DayHours = [string, string] | null;
export interface Schedule {
  /** The shop's time zone (IANA name). */
  zone: string;
  /** Sunday first, seven entries. */
  week: DayHours[];
  /** Minutes between appointment start times. */
  step: number;
  /** Cars the shop takes at the same start time. */
  perSlot: number;
  /** Hours of notice the shop needs before an appointment. */
  notice: number;
  /** How many days ahead customers can book. */
  ahead: number;
  /** Book the customer right away instead of waiting for the shop to confirm. */
  auto: boolean;
  /** Text the customer a reminder the day before. */
  reminder: boolean;
  /** The shop is booked up: no new appointments online until it switches this off. Booked ones stay. */
  paused?: boolean;
  /** Dates (YYYY-MM-DD, shop-local) with no appointments: holidays, days off, a week that's full. */
  closed?: string[];
  /** Smart scheduling: the most cars the shop wants on site at once. Days expected to be at that number take no bookings. */
  capacity?: number;
  /** Days a booked car usually stays (1 = in and out the same day). Used to estimate how full future days are. */
  stay?: number;
}
export const STAY_DAYS = [1, 2, 3, 5, 7] as const;
/** A car on site now: when it was checked in, its stage, and the pickup time the shop promised (if any). */
export interface ShopCar { since: string; stage: string; promised?: string }
export const MAX_CLOSED = 60;
export const STEPS = [15, 30, 45, 60, 90, 120] as const;
export const NOTICE_HOURS = [0, 1, 2, 4, 12, 24, 48] as const;
export const AHEAD_DAYS = [7, 14, 21, 30, 60] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function validZone(zone: string): boolean {
  if (!zone || zone.length > 80) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return true; } catch { return false; }
}

/** Checks the shop's schedule settings. null turns scheduling off (back to day-and-part-of-day requests). */
export function parseSchedule(v: unknown): Schedule | null | string {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return 'Check your appointment hours.';
  const s = v as Body;
  const zone = typeof s.zone === 'string' ? s.zone.trim() : '';
  if (!validZone(zone)) return 'Pick your shop\'s time zone.';
  if (!Array.isArray(s.week) || s.week.length !== 7) return 'Set your hours for each day of the week.';
  const week: DayHours[] = [];
  for (const d of s.week) {
    if (d === null || d === false) { week.push(null); continue; }
    if (!Array.isArray(d) || d.length !== 2 || !HHMM.test(String(d[0])) || !HHMM.test(String(d[1]))) return 'Enter open and close times like 08:00 and 17:00.';
    if (mins(d[1]) <= mins(d[0])) return 'Closing time has to be after opening time.';
    week.push([String(d[0]), String(d[1])]);
  }
  if (!week.some(Boolean)) return 'Open at least one day for appointments.';
  const step = Number(s.step), perSlot = Number(s.perSlot), notice = Number(s.notice), ahead = Number(s.ahead);
  if (!(STEPS as readonly number[]).includes(step)) return 'Choose how far apart appointments start.';
  if (!Number.isInteger(perSlot) || perSlot < 1 || perSlot > 20) return 'Choose how many cars you take at once (1 to 20).';
  if (!(NOTICE_HOURS as readonly number[]).includes(notice)) return 'Choose how much notice you need.';
  if (!(AHEAD_DAYS as readonly number[]).includes(ahead)) return 'Choose how far ahead customers can book.';
  for (const d of week) if (d && mins(d[1]) - mins(d[0]) < step) return 'Each open day needs room for at least one appointment.';
  let closed: string[] = [];
  if (s.closed !== undefined && s.closed !== null) {
    if (!Array.isArray(s.closed) || s.closed.length > MAX_CLOSED) return `List up to ${MAX_CLOSED} days off.`;
    for (const d of s.closed) if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d + 'T12:00:00Z'))) return 'Enter each day off as a date.';
    closed = [...new Set(s.closed as string[])].sort();
  }
  let capacity = 0, stay = 1;
  if (s.capacity !== undefined && s.capacity !== null && s.capacity !== 0 && s.capacity !== '') {
    capacity = Number(s.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) return 'Enter how many cars you want in the shop at once (1 to 200), or leave it blank.';
  }
  if (s.stay !== undefined && s.stay !== null) {
    stay = Number(s.stay);
    if (!(STAY_DAYS as readonly number[]).includes(stay)) return 'Choose how long a booked car usually stays.';
  }
  return { zone, week, step, perSlot, notice, ahead, auto: s.auto === true, reminder: s.reminder !== false,
    ...(s.paused === true ? { paused: true } : {}), ...(closed.length ? { closed } : {}), ...(capacity ? { capacity, stay } : {}) };
}

/** The wall-clock parts of an instant in a time zone. */
function parts(at: number, zone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
/** Milliseconds the zone is ahead of UTC at that instant. */
function offset(at: number, zone: string): number {
  const p = parts(at, zone);
  const local = Date.parse(p.day + 'T' + hhmm(p.min) + ':00Z');
  return local - Math.floor(at / 60_000) * 60_000;
}
/** The instant a local day and time happen in the zone (DST-aware). */
export function zonedTime(day: string, time: string, zone: string): number {
  const guess = Date.parse(`${day}T${time}:00Z`);
  let at = guess - offset(guess, zone);
  at = guess - offset(at, zone);
  return at;
}
/** The shop-local day (YYYY-MM-DD) and time (HH:MM) of an instant. */
export function localOf(at: number | string, zone: string): { day: string; time: string } {
  const p = parts(typeof at === 'string' ? Date.parse(at) : at, zone);
  return { day: p.day, time: hhmm(p.min) };
}
const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);

export interface OpenDay { day: string; times: { time: string; at: string }[] }

/**
 * How many cars the shop expects on site each day (shop-local YYYY-MM-DD), from today on:
 * - a car on site stays through its promised pickup day; one that's late or ready for pickup counts for today only;
 *   with no promised time it counts for the usual stay from the day it was checked in (at least today);
 * - each appointment (booked or waiting on the shop) counts from its day for the usual stay.
 */
export function dayLoad(s: Schedule, now: Date, cars: ShopCar[], appointments: string[]): Record<string, number> {
  const load: Record<string, number> = {};
  const stay = s.stay ?? 1, today = localOf(now.getTime(), s.zone).day, last = addDays(today, s.ahead + stay + 1);
  const add = (from: string, to: string) => { for (let d = from < today ? today : from, n = 0; d <= to && d <= last && n < 400; d = addDays(d, 1), n++) load[d] = (load[d] ?? 0) + 1; };
  for (const c of cars) {
    let end = today;
    if (c.promised && Number.isFinite(Date.parse(c.promised))) { const p = localOf(c.promised, s.zone).day; if (p > today) end = p; }
    else if (c.stage !== 'ready' && Number.isFinite(Date.parse(c.since))) { const e = addDays(localOf(c.since, s.zone).day, stay - 1); if (e > today) end = e; }
    add(today, end);
  }
  for (const a of appointments) {
    if (!Number.isFinite(Date.parse(a))) continue;
    const d = localOf(a, s.zone).day;
    if (addDays(d, stay - 1) >= today) add(d, addDays(d, stay - 1));
  }
  return load;
}
/** True when the shop has room for one more car on that day and for the rest of its usual stay. */
export function hasRoom(s: Schedule, load: Record<string, number> | undefined, day: string): boolean {
  if (!s.capacity || !load) return true;
  for (let k = 0; k < (s.stay ?? 1); k++) if ((load[addDays(day, k)] ?? 0) >= s.capacity) return false;
  return true;
}

/**
 * Open appointment times from now through `ahead` days, in the shop's zone. `taken` holds the start times (ISO) of
 * appointments already on the books and requests still waiting; a start time is full once it has `perSlot` of them.
 */
export function openSlots(s: Schedule, now: Date, taken: string[], load?: Record<string, number>): OpenDay[] {
  if (s.paused) return [];
  const count = new Map<number, number>();
  for (const t of taken) { const ms = Date.parse(t); if (Number.isFinite(ms)) count.set(ms, (count.get(ms) ?? 0) + 1); }
  const earliest = now.getTime() + s.notice * 3_600_000;
  const today = localOf(now.getTime(), s.zone).day;
  const out: OpenDay[] = [];
  for (let i = 0; i <= s.ahead; i++) {
    const day = addDays(today, i);
    const hours = s.week[new Date(day + 'T12:00:00Z').getUTCDay()];
    if (!hours || s.closed?.includes(day) || !hasRoom(s, load, day)) continue;
    const times: OpenDay['times'] = [];
    for (let m = mins(hours[0]); m + s.step <= mins(hours[1]); m += s.step) {
      const at = zonedTime(day, hhmm(m), s.zone);
      // Skip times a daylight-saving jump moves off the clock.
      if (localOf(at, s.zone).time !== hhmm(m)) continue;
      if (at < earliest || (count.get(at) ?? 0) >= s.perSlot) continue;
      times.push({ time: hhmm(m), at: new Date(at).toISOString() });
    }
    if (times.length) out.push({ day, times });
  }
  return out;
}

/** True when `at` is one of the open times right now. */
export function isOpenSlot(s: Schedule, now: Date, taken: string[], at: string, load?: Record<string, number>): boolean {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return false;
  return openSlots(s, now, taken, load).some((d) => d.times.some((t) => Date.parse(t.at) === ms));
}

/** "Thu, Nov 12 at 9:00 AM" (or Spanish), in the shop's zone. Plain characters so a text stays one segment. */
export function slotText(at: string, zone: string, lang: 'en' | 'es' = 'en'): string {
  const d = new Date(at);
  const day = d.toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).replace(/\./g, '');
  const time = d.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).replace(/ /g, ' ');
  return lang === 'es' ? `${day} a las ${time}` : `${day} at ${time}`;
}

/** When the day-before reminder goes out: 24 hours ahead, or null if the appointment is too soon for one. */
export function reminderDue(at: string, now: Date): string | null {
  const due = Date.parse(at) - 24 * 3_600_000;
  return due > now.getTime() + 3_600_000 ? new Date(due).toISOString() : null;
}
