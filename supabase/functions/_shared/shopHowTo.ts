// Talk Shops how-to assistant: POST /api/shop/howto. A signed-in shop's staff ask how to do a job
// (an oil change, pulling a component, a diagnostic question) and Gemini answers with steps, tools,
// parts, typical specs and safety notes. Answers are guidance only: the page tells staff to confirm
// specs in the manufacturer's service information. The Gemini key stays in Supabase secrets.

import type { Ctx, Res } from './handlers.ts';
import type { Narrator } from './dnd.ts';

type Body = Record<string, unknown>;

export const HOWTO_SYSTEM = `You are the repair how-to assistant inside Talk Shops, an app used by staff at independent auto repair shops. The people asking are working technicians and service writers. Answer like an experienced, careful master technician explaining a job to a coworker.

What to do:
- Answer the question for the vehicle given (year, make, model, engine) when one is given. If the procedure differs a lot by engine, trim or drivetrain, say so and describe the most common case.
- For a procedure, give clear numbered-style steps in order (one action per step, plain text, no numbering in the text itself), plus the tools, the parts and fluids, and the typical specs that matter (oil capacity and grade, torque values, gaps, pressures).
- For a diagnostic or "what does this mean" question, put the explanation in "answer" and use "steps" for the checks to perform, in order.
- Specs: give typical values only when you are reasonably confident, and label every one as typical, e.g. "Drain plug: typically 25-30 ft-lb (verify in service info)". If you do not know a spec for this vehicle, say to look it up rather than guessing. Never present a number as exact factory data.
- Safety: list the real hazards for this job in "safety", for example lifting and jack stands, hot fluids and exhaust, brake and suspension parts under load (springs, struts), airbags and SRS (disconnect battery and wait), hybrid and EV high-voltage systems (only trained, certified techs with proper PPE and isolation procedures), fuel systems (relieve pressure, no sparks), AC refrigerant (EPA 609 certification and recovery equipment), and torque-to-yield fasteners that must be replaced.
- Part numbers: in "partNumbers", list the main replacement parts for this job. Lead with the manufacturer (OEM) part number in "brand" and "number" (brand is the carmaker or its parts brand, for example "Honda" or "Motorcraft"), and add a well-known aftermarket equivalent in "altBrand" and "altNumber" when you know one (for example "Wix" "51515"). Give a number only when you are reasonably confident it fits the vehicle given. Part numbers vary by engine, trim, build date and VIN, so never invent one and never guess digits; leave a number empty when you are not sure, and use "note" for what decides the right part (engine size, build date, with or without towing package). Leave the list empty when no vehicle is given or no parts are replaced.
- Keep it practical and tight: usually 5 to 15 steps, each one or two sentences.
- Earlier turns of the conversation are given so follow-up questions make sense.

What not to do:
- Do not help defeat or remove emissions equipment (EGR or DPF deletes, catalytic converter removal without replacement, emissions tuning that defeats controls), roll back odometers, alter VINs, bypass immobilizers or anti-theft on a car the shop does not own, or permanently disable safety systems such as airbags or ABS. Briefly say you can't help with that and offer the legal repair instead.
- Stay on vehicle repair, maintenance, diagnostics, tools and shop work. Politely steer anything else back.
- Plain text only in every field: no markdown, no asterisks, no headings.

Return JSON:
"answer": one to three sentences that directly answer the question or summarize the job (include rough time and difficulty for a procedure).
"steps": the steps in order (empty if none apply).
"tools": tools needed (empty if none apply).
"parts": parts, fluids and supplies (empty if none apply).
"specs": typical specs, each labeled as typical and to verify (empty if none apply).
"partNumbers": up to 8 parts, each {"part": what it is, "brand": the OEM brand or empty, "number": the OEM part number or empty, "altBrand": an aftermarket brand or empty, "altNumber": that brand's part number or empty, "note": what to check, short or empty}.
"safety": safety cautions for this job (at least one for any hands-on procedure).
"ideas": two or three short follow-up questions a tech might ask next, each under 60 characters.`;

/** Gemini's response schema for how-to answers (OpenAPI subset). */
export const HOWTO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
    tools: { type: 'ARRAY', items: { type: 'STRING' } },
    parts: { type: 'ARRAY', items: { type: 'STRING' } },
    specs: { type: 'ARRAY', items: { type: 'STRING' } },
    partNumbers: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { part: { type: 'STRING' }, brand: { type: 'STRING' }, number: { type: 'STRING' }, altBrand: { type: 'STRING' }, altNumber: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['part'] },
    },
    safety: { type: 'ARRAY', items: { type: 'STRING' } },
    ideas: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['answer', 'steps', 'tools', 'parts', 'specs', 'safety', 'ideas'],
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, n: number, max: number) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean).slice(0, n);

const partNo = (v: unknown) => str(v, 40).replace(/[^A-Za-z0-9 .\-\/]/g, '');
/** Part numbers the assistant is confident about. Shown with "verify by VIN" on the page. */
export function partNumbers(v: unknown) {
  return (Array.isArray(v) ? v : []).map((x) => (x && typeof x === 'object' ? x as Body : {}))
    .map((x) => ({
      part: str(x.part, 100), brand: str(x.brand, 40), number: partNo(x.number),
      altBrand: str(x.altBrand, 40), altNumber: partNo(x.altNumber), note: str(x.note, 160),
    }))
    .filter((x) => x.part).slice(0, 8);
}

/** "2014 Honda Civic 1.8L" from whatever the page sent. */
export function vehicleLabel(v: unknown) {
  const o = (v && typeof v === 'object' ? v : {}) as Body;
  return [str(o.year, 4), str(o.make, 30), str(o.model, 40), str(o.engine, 40)].filter(Boolean).join(' ');
}

export function howToPrompt(body: Body) {
  const vehicle = vehicleLabel(body.vehicle);
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-4)
    .map((h) => (h && typeof h === 'object' ? h as Body : {}))
    .map((h) => ({ q: str(h.q, 400), a: str(h.a, 900) }))
    .filter((h) => h.q);
  return [
    history.length ? `<conversation>\n${history.map((h) => `Tech: ${h.q}\nYou: ${h.a}`).join('\n')}\n</conversation>` : '',
    `Vehicle: ${vehicle || 'not given (answer for the most common case and say what changes by vehicle)'}`,
    `Question: ${str(body.question, 500)}`,
  ].filter(Boolean).join('\n');
}

// ---- Saved answers ("how-to library") ----
// Every standalone answer is saved by vehicle and question. A repeat question for the same make and model
// (within a few model years, same engine when given) gets the saved answer back with no AI call. Shops rate
// answers ("this worked" / "not right"); answers rated wrong are retired so the next ask gets a fresh one.
// Techs can add tips to an answer. Answers expire after a year so specs don't go stale.

/** Answers and tips are shared across all shops (Tyler, 2026-11-09), so nothing shared may identify a shop or
 * customer: only the vehicle, the cleaned-up question, the AI answer, counts and tips go out. Shop ids stay in
 * the database (to count one rating per shop) and are never returned. Tips with contact details are refused. */
export const SHARE_ANSWERS = true;
export const SHARE_TIPS = true;

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/i;
const RO = /\b(?:RO|R\/O|repair order|invoice|inv)\s*[#:-]?\s*\d{3,}\b/i;
/** True when text has contact details or a VIN or repair order number that must not be shared. */
export const hasPersonalInfo = (t: string) => [EMAIL, URL_RE, PHONE, VIN, RO].some((re) => re.test(t));
/** The question as other shops see it: contact details, VINs, RO numbers and "Maria's" style names removed. */
export function cleanQuestion(t: string) {
  let out = t;
  for (const re of [EMAIL, URL_RE, PHONE, VIN, RO]) out = out.replace(new RegExp(re.source, re.flags + 'g'), '');
  return out.replace(/\b(?:for|on)\s+(?:mr|mrs|ms|miss|dr)\.?\s+[A-Z][a-z]+\b/g, '').replace(/\b[A-Z][a-z]+'s\b/g, "the customer's")
    .replace(/\s+([?.!,])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}
const MAX_AGE_DAYS = 365;
const YEAR_WINDOW = 3;

export interface SavedAnswer {
  id: string; shopId: string; makeModel: string; year: number | null; engine: string; qKey: string;
  question: string; vehicle: string; answer: Body; ratings: Record<string, boolean>; uses: number; retired: boolean; createdAt: string;
}
export interface Tip { text: string; createdAt: string; mine: boolean }
/** Where saved answers live (Supabase tables howto_answers and howto_tips). */
export interface HowToLibrary {
  candidates(makeModel: string, opts: { qKey?: string; shopId?: string; since: string; limit: number }): Promise<SavedAnswer[]>;
  get(id: string): Promise<SavedAnswer | null>;
  save(row: Omit<SavedAnswer, 'id' | 'createdAt'>): Promise<string>;
  update(id: string, patch: { ratings?: Record<string, boolean>; uses?: number; retired?: boolean }): Promise<void>;
  tips(answerId: string, shopId: string | null): Promise<{ text: string; createdAt: string; shopId: string }[]>;
  addTip(answerId: string, shopId: string, text: string): Promise<void>;
}

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('how to do i you we the a an on in for my of with what is are does should can please and it its this that me step steps way best proper properly correct correctly guide procedure need car vehicle'.split(' '));
const SAME: Record<string, string> = {
  replacement: 'replace', replacing: 'replace', replaced: 'replace', change: 'replace', changing: 'replace', swap: 'replace', swapping: 'replace', new: 'replace',
  removal: 'remove', removing: 'remove', take: 'remove', off: 'remove', pull: 'remove', pulling: 'remove',
  installation: 'install', installing: 'install', put: 'install', diagnose: 'diagnose', diagnosing: 'diagnose', diagnosis: 'diagnose',
  brakes: 'brake', breaks: 'brake', break: 'brake', tyres: 'tire', tires: 'tire', tyre: 'tire',
};

export function vehicleKey(v: unknown) {
  const o = (v && typeof v === 'object' ? v : {}) as Body;
  const make = norm(o.make), model = norm(o.model);
  const y = Number(String(o.year ?? '').trim());
  return {
    makeModel: make && model ? `${make}|${model}` : '',
    year: Number.isInteger(y) && y > 1900 && y < 2100 ? y : null,
    engine: norm(o.engine).replace(/\s+/g, ''),
    words: new Set([...make.split(' '), ...model.split(' ')].filter(Boolean)),
  };
}

/** The question's meaningful words, sorted, so "oil change" and "how do I change the oil" match. */
export function questionKey(question: string, vehicleWords: Set<string> = new Set()) {
  const words = norm(question).split(' ')
    .filter((w) => w && !STOP.has(w) && !vehicleWords.has(w) && !/^(19|20)\d\d$/.test(w) && !/^\d(\.\d)?l?$/.test(w))
    .map((w) => SAME[w] ?? (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return [...new Set(words)].sort().join(' ');
}

const score = (a: SavedAnswer) => {
  const r = Object.values(a.ratings || {});
  return r.filter(Boolean).length * 3 - r.filter((x) => !x).length * 4 + Math.min(a.uses, 50) * 0.1;
};
const counts = (a: SavedAnswer) => { const r = Object.values(a.ratings || {}); return { worked: r.filter(Boolean).length, notRight: r.filter((x) => !x).length }; };
const fits = (a: SavedAnswer, k: ReturnType<typeof vehicleKey>) => !a.retired
  && (a.year === null || k.year === null || Math.abs(a.year - k.year) <= YEAR_WINDOW)
  && (!a.engine || !k.engine || a.engine === k.engine);
const sinceDate = (ctx: Ctx) => new Date(ctx.now().getTime() - MAX_AGE_DAYS * 86_400_000).toISOString();

async function tipsFor(lib: HowToLibrary, answerId: string, shopId: string): Promise<Tip[]> {
  // Other shops' tips come back with no shop id; only "mine" says which tips this shop wrote.
  const rows = await lib.tips(answerId, SHARE_TIPS ? null : shopId);
  return rows.slice(-10).map((t) => ({ text: t.text, createdAt: t.createdAt, mine: t.shopId === shopId }));
}

async function savedOut(lib: HowToLibrary, a: SavedAnswer, shopId: string, vehicle: string, reused: boolean) {
  const mine = a.ratings?.[shopId];
  return {
    ...a.answer, vehicle: vehicle || a.vehicle, libraryId: a.id,
    saved: reused ? { uses: a.uses, ...counts(a), firstAsked: a.createdAt, askedFor: a.vehicle, question: a.question } : null,
    myRating: mine === undefined ? null : mine,
    tips: await tipsFor(lib, a.id, shopId).catch(() => []),
  };
}

// Free-tier friendly limits per shop, for AI calls only (saved answers are free). Kept in memory, like the Start/Sit chat.
const recent = new Map<string, number[]>();
export const HOWTO_PER_HOUR = 40;
export const clearHowToLimits = () => recent.clear();

/** Handles shop/howto[/suggest|/rate|/tip] for a shop that is already signed in and set up. */
export async function howToRoute(ctx: Ctx, narrator: Narrator | null | undefined, shopId: string, method: string, data: unknown,
  sub?: string, lib?: HowToLibrary | null): Promise<Res> {
  if (method !== 'POST') return { status: 405 };
  const body = (data && typeof data === 'object' ? data : {}) as Body;
  const k = vehicleKey(body.vehicle);
  const vehicle = vehicleLabel(body.vehicle);

  if (sub === 'suggest') {
    if (!lib || !k.makeModel) return { status: 200, body: { suggestions: [] } };
    const q = questionKey(str(body.q, 200), k.words).split(' ').filter(Boolean);
    const rows = (await lib.candidates(k.makeModel, { since: sinceDate(ctx), limit: 300, shopId: SHARE_ANSWERS ? undefined : shopId })).filter((a) => fits(a, k));
    const best = new Map<string, SavedAnswer>();
    for (const a of rows) { const b = best.get(a.qKey); if (!b || score(a) > score(b)) best.set(a.qKey, a); }
    const ranked = [...best.values()].map((a) => {
      const words = a.qKey.split(' ');
      const hit = q.length ? q.filter((w) => words.some((x) => x.startsWith(w))).length / q.length : 0;
      return { a, rank: hit * 10 + score(a) };
    }).filter((x) => !q.length || x.rank >= 5).sort((x, y) => y.rank - x.rank).slice(0, 6);
    return { status: 200, body: { suggestions: ranked.map(({ a }) => ({ id: a.id, question: a.question, vehicle: a.vehicle, uses: a.uses, ...counts(a) })) } };
  }

  if (sub === 'rate' || sub === 'tip') {
    if (!lib) return { status: 503, body: 'Saved answers are not available right now.' };
    const a = await lib.get(str(body.id, 60));
    if (!a) return { status: 404, body: 'That answer is no longer saved.' };
    if (sub === 'rate') {
      if (typeof body.worked !== 'boolean') return { status: 400, body: 'Choose this worked or not right.' };
      const ratings = { ...(a.ratings || {}), [shopId]: body.worked };
      const c = counts({ ...a, ratings });
      // Retire an answer once shops say it's wrong more than right, so the next ask gets a fresh one.
      const retired = c.notRight >= 2 && c.notRight > c.worked || (c.notRight >= 1 && c.worked === 0 && a.shopId === shopId);
      await lib.update(a.id, { ratings, retired });
      return { status: 200, body: { ...c, myRating: body.worked, retired } };
    }
    const text = str(body.text, 300);
    if (text.length < 3) return { status: 400, body: 'Type a tip for the next tech.' };
    if (hasPersonalInfo(text)) return { status: 400, body: 'Tips are shared with other shops, so leave out phone numbers, emails, VINs, links and RO numbers.' };
    await lib.addTip(a.id, shopId, text);
    return { status: 200, body: { tips: await tipsFor(lib, a.id, shopId) } };
  }
  if (sub) return { status: 404 };

  const question = str(body.question, 500);
  if (question.length < 3) return { status: 400, body: 'Type a question, like "oil change on a 2018 F-150 5.0".' };
  const followUp = Array.isArray(body.history) && body.history.length > 0;
  const qKey = questionKey(question, k.words);

  // A saved answer: picked from the suggestions, or the same question asked before for this vehicle.
  if (lib && !body.fresh) {
    try {
      let hit: SavedAnswer | null = null;
      if (body.answerId) { const a = await lib.get(str(body.answerId, 60)); if (a && !a.retired) hit = a; }
      else if (k.makeModel && qKey && !followUp) {
        hit = (await lib.candidates(k.makeModel, { qKey, since: sinceDate(ctx), limit: 20, shopId: SHARE_ANSWERS ? undefined : shopId }))
          .filter((a) => fits(a, k) && score(a) > -4).sort((a, b) => score(b) - score(a))[0] ?? null;
      }
      if (hit) {
        hit.uses += 1;
        await lib.update(hit.id, { uses: hit.uses }).catch(() => {});
        return { status: 200, body: await savedOut(lib, hit, shopId, vehicle, true) };
      }
    } catch (error) {
      ctx.log.warn('How-to library lookup failed.', error);
    }
  }

  const now = ctx.now().getTime();
  const times = (recent.get(shopId) || []).filter((t) => now - t < 3600_000);
  if (times.length >= HOWTO_PER_HOUR) return { status: 429, body: 'Your shop has asked a lot of questions this hour. Try again in a bit.' };
  if (times.length && now - times[times.length - 1] < 1500) return { status: 429, body: 'One question at a time.' };
  times.push(now);
  recent.set(shopId, times);

  if (!narrator) return { status: 503, body: 'The how-to assistant is not set up yet.' };
  try {
    const parsed = JSON.parse(await narrator.complete({ system: HOWTO_SYSTEM, prompt: howToPrompt({ ...body, question: cleanQuestion(question) || question }) })) as Body;
    const answer = str(parsed.answer, 1500);
    if (!answer) return { status: 502, body: 'The assistant came back empty. Try asking again.' };
    const out = {
      answer,
      steps: list(parsed.steps, 30, 600),
      tools: list(parsed.tools, 25, 160),
      parts: list(parsed.parts, 25, 160),
      specs: list(parsed.specs, 20, 240),
      partNumbers: partNumbers(parsed.partNumbers),
      safety: list(parsed.safety, 10, 400),
      ideas: list(parsed.ideas, 3, 80),
    };
    let libraryId: string | null = null;
    if (lib && k.makeModel && qKey && !followUp) {
      try {
        // Only the vehicle (no VIN or plate), the cleaned-up question and the AI's answer are saved for sharing.
        const shared = cleanQuestion(question);
        if (shared.length >= 3) libraryId = await lib.save({ shopId, makeModel: k.makeModel, year: k.year, engine: k.engine, qKey, question: shared, vehicle, answer: out, ratings: {}, uses: 1, retired: false });
      } catch (error) { ctx.log.warn('Saving the how-to answer failed.', error); }
    }
    return { status: 200, body: { ...out, vehicle, libraryId, saved: null, myRating: null, tips: [] } };
  } catch (error) {
    ctx.log.warn('How-to assistant failed.', error);
    return { status: 502, body: 'The assistant is busy right now. Try again in a minute.' };
  }
}
