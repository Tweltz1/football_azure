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
    safety: { type: 'ARRAY', items: { type: 'STRING' } },
    ideas: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['answer', 'steps', 'tools', 'parts', 'specs', 'safety', 'ideas'],
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, n: number, max: number) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean).slice(0, n);

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

// Free-tier friendly limits per shop. Kept in memory, like the Start/Sit chat.
const recent = new Map<string, number[]>();
export const HOWTO_PER_HOUR = 40;
export const clearHowToLimits = () => recent.clear();

/** Handles shop/howto for a shop that is already signed in and set up. */
export async function howToRoute(ctx: Ctx, narrator: Narrator | null | undefined, shopId: string, method: string, data: unknown): Promise<Res> {
  if (method !== 'POST') return { status: 405 };
  const body = (data && typeof data === 'object' ? data : {}) as Body;
  const question = str(body.question, 500);
  if (question.length < 3) return { status: 400, body: 'Type a question, like "oil change on a 2018 F-150 5.0".' };

  const now = ctx.now().getTime();
  const times = (recent.get(shopId) || []).filter((t) => now - t < 3600_000);
  if (times.length >= HOWTO_PER_HOUR) return { status: 429, body: 'Your shop has asked a lot of questions this hour. Try again in a bit.' };
  if (times.length && now - times[times.length - 1] < 1500) return { status: 429, body: 'One question at a time.' };
  times.push(now);
  recent.set(shopId, times);

  if (!narrator) return { status: 503, body: 'The how-to assistant is not set up yet.' };
  try {
    const parsed = JSON.parse(await narrator.complete({ system: HOWTO_SYSTEM, prompt: howToPrompt(body) })) as Body;
    const answer = str(parsed.answer, 1500);
    if (!answer) return { status: 502, body: 'The assistant came back empty. Try asking again.' };
    return {
      status: 200,
      body: {
        answer,
        steps: list(parsed.steps, 30, 600),
        tools: list(parsed.tools, 25, 160),
        parts: list(parsed.parts, 25, 160),
        specs: list(parsed.specs, 20, 240),
        safety: list(parsed.safety, 10, 400),
        ideas: list(parsed.ideas, 3, 80),
        vehicle: vehicleLabel(body.vehicle),
      },
    };
  } catch (error) {
    ctx.log.warn('How-to assistant failed.', error);
    return { status: 502, body: 'The assistant is busy right now. Try again in a minute.' };
  }
}
