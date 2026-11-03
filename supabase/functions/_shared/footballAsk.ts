// The Start/Sit chat bar's AI answers: POST /api/startsit/ask. The page works the question out with its own
// model first (projections, lineup, trades), then sends that answer and the team's data here, and Gemini turns
// it into a conversational reply grounded in those numbers. If this route fails, the page keeps its own answer.
// It reuses the Hood Quest narrator (Gemini Flash, then Flash Lite), which returns { narration, ideas } as JSON:
// narration is the reply and ideas are follow-up questions shown as chips.

import type { Ctx, Res } from './handlers.ts';
import type { Narrator } from './dnd.ts';

export const ASK_SYSTEM = `You are the fantasy football assistant on Hood League, a fantasy football site. You answer the user's question about their team, players, lineups, trades, waivers and their league, like a sharp friend who knows the numbers.

Ground every answer in the <site_data> block: it holds this week's projections, the user's roster and best lineup, league details, and "model_answer", which is what the site's own projection model worked out for this exact question. Treat model_answer as the best source for numbers and the call it makes (start, sit, accept, decline). Agree with it unless the data clearly says otherwise, and if you disagree, say why.

Rules:
- Use the projected points, ranks, matchups and injury tags from the data. Do not invent stats, injuries, news or trades that are not in the data. If you mention something from general football knowledge (a player's role, a team's offense), keep it brief and do not present it as this week's news.
- If the data doesn't cover the question, say what you can from it and suggest what to ask instead. General fantasy football questions (rules, strategy, terms) are fine to answer from your own knowledge.
- Be direct: lead with the answer, then the one to three reasons that matter. Two to five sentences, plain text, no markdown, no bullet lists, no headings.
- Earlier turns of the conversation are given so "him" or "that trade" make sense.
- Stay on football. Politely steer anything else back to football.

Return JSON: "narration" is your reply. "ideas" is two or three short follow-up questions the user might ask next, each under 60 characters, written as the user would type them.`;

type Body = Record<string, unknown>;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const DATA_CAP = 14_000;

/** The user message: the conversation so far, the site's data (trimmed to fit) and the question. */
export function askPrompt(body: Body) {
  const question = str(body.question, 400);
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-4)
    .map((h) => (h && typeof h === 'object' ? h as Body : {}))
    .map((h) => ({ q: str(h.q, 300), a: str(h.a, 700) }))
    .filter((h) => h.q);
  let data = JSON.stringify(body.data ?? {});
  if (data.length > DATA_CAP) {
    // Drop the biggest optional lists first, then cut whatever is left.
    const d = { ...((body.data && typeof body.data === 'object') ? body.data as Body : {}) };
    for (const key of ['topPlayers', 'freeAgents', 'bench', 'leagueTeams']) {
      if (data.length <= DATA_CAP) break;
      delete d[key];
      data = JSON.stringify(d);
    }
    data = data.slice(0, DATA_CAP);
  }
  return [
    history.length ? `<conversation>\n${history.map((h) => `User: ${h.q}\nYou: ${h.a}`).join('\n')}\n</conversation>` : '',
    '<site_data>',
    data,
    '</site_data>',
    `Question: ${question}`,
  ].filter(Boolean).join('\n');
}

// Free-tier friendly limits, per signed-in user; everyone signed out shares one bucket.
const recent = new Map<string, number[]>();
export const ASK_PER_HOUR = 60;
const ANON_PER_HOUR = 200;
export const clearAskLimits = () => recent.clear();

export async function askRoute(ctx: Ctx, narrator: Narrator | null | undefined, method: string, parts: string[], data: unknown): Promise<Res | null> {
  if (parts[0] !== 'startsit' || parts[1] !== 'ask' || parts.length !== 2) return null;
  if (method !== 'POST') return { status: 405 };
  if (!narrator) return { status: 503, body: 'AI answers are not set up yet.' };
  const body = (data && typeof data === 'object' ? data : {}) as Body;
  const question = str(body.question, 400);
  if (!question) return { status: 400, body: 'Ask a question.' };

  const key = ctx.userId || 'anon';
  const cap = ctx.userId ? ASK_PER_HOUR : ANON_PER_HOUR;
  const now = ctx.now().getTime();
  const times = (recent.get(key) || []).filter((t) => now - t < 3600_000);
  if (times.length >= cap) return { status: 429, body: 'The AI needs a breather. Try again in a bit.' };
  if (ctx.userId && times.length && now - times[times.length - 1] < 1000) return { status: 429, body: 'One at a time.' };
  times.push(now);
  recent.set(key, times);

  try {
    const text = await narrator.complete({ system: ASK_SYSTEM, prompt: askPrompt(body) });
    const parsed = JSON.parse(text) as { narration?: unknown; ideas?: unknown };
    const answer = str(parsed.narration, 1500);
    if (!answer) return { status: 502, body: 'The AI came back empty.' };
    const ideas = Array.isArray(parsed.ideas) ? parsed.ideas.slice(0, 3).map((i) => str(i, 80)).filter(Boolean) : [];
    return { status: 200, body: { answer, ideas } };
  } catch (error) {
    ctx.log.warn('Ask AI failed.', error);
    return { status: 502, body: 'The AI is unavailable right now.' };
  }
}
