// The Start/Sit chat bar's AI answers: POST /api/startsit/ask. The page works the question out with its own
// model first (projections, lineup, trades), then sends that answer and the team's data here, and Gemini turns
// it into a conversational reply grounded in those numbers. If this route fails, the page keeps its own answer.
// It reuses the Hood Quest narrator (Gemini Flash, then Flash Lite), which returns { narration, ideas } as JSON:
// narration is the reply and ideas are follow-up questions shown as chips.
// Every turn (question, our model's answer, Gemini's reply) is saved to the ask_log table. When Gemini is down,
// an earlier reply to the same question with the same model answer is reused, and the export-ask-log workflow
// dumps the table so the free rule-based model can be taught the questions people actually ask.

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

/** One saved chat turn: the question, what our model said, and what Gemini said (null when it failed). */
export interface AskLogRow {
  user_id: string | null;
  week: number | null;
  question: string;
  /** Lowercased, trimmed question plus our model's answer text: two turns with the same key got the same model answer. */
  match_key: string;
  model_kind: string | null;
  model_text: string | null;
  model_answer: unknown;
  ai_answer: string | null;
  ideas: string[];
  /** gemini (fresh reply), saved (an earlier reply reused while Gemini was down) or failed (no reply). */
  source: 'gemini' | 'saved' | 'failed';
}

/** Where chat turns are saved (Supabase table ask_log). Missing in tests that don't need it. */
export interface AskLogStore {
  save(row: AskLogRow): Promise<void>;
  /** The newest Gemini reply saved for this key, or null. */
  findReply(matchKey: string): Promise<{ ai_answer: string; ideas: string[] } | null>;
}

const normalize = (q: string) => q.toLowerCase().replace(/[^a-z0-9.' ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const askMatchKey = (question: string, modelText: string) => `${normalize(question)}|${modelText.trim()}`;

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

export async function askRoute(
  ctx: Ctx, narrator: Narrator | null | undefined, method: string, parts: string[], data: unknown, store?: AskLogStore | null,
): Promise<Res | null> {
  if (parts[0] !== 'startsit' || parts[1] !== 'ask' || parts.length !== 2) return null;
  if (method !== 'POST') return { status: 405 };
  const body = (data && typeof data === 'object' ? data : {}) as Body;
  const question = str(body.question, 400);
  if (!question) return { status: 400, body: 'Ask a question.' };

  const siteData = (body.data && typeof body.data === 'object' ? body.data : {}) as Body;
  const modelAnswer = (siteData.modelAnswer && typeof siteData.modelAnswer === 'object' ? siteData.modelAnswer : null) as Body | null;
  const modelText = str(modelAnswer?.text, 2000);
  const week = Number.isFinite(Number(siteData.week)) && siteData.week !== null && siteData.week !== '' ? Number(siteData.week) : null;
  const matchKey = askMatchKey(question, modelText);
  const save = async (ai: string | null, ideas: string[], source: AskLogRow['source']) => {
    if (!store) return;
    try {
      await store.save({
        user_id: ctx.userId,
        week,
        question,
        match_key: matchKey,
        model_kind: str(modelAnswer?.kind, 60) || null,
        model_text: modelText || null,
        model_answer: modelAnswer,
        ai_answer: ai,
        ideas,
        source,
      });
    } catch (error) {
      ctx.log.warn('Saving the chat turn failed.', error);
    }
  };
  // While Gemini is down, reuse a reply it gave earlier to the same question with the same model answer.
  const fallback = async (status: number, message: string): Promise<Res> => {
    if (store && modelText) {
      try {
        const old = await store.findReply(matchKey);
        if (old?.ai_answer) {
          await save(old.ai_answer, old.ideas || [], 'saved');
          return { status: 200, body: { answer: old.ai_answer, ideas: old.ideas || [], saved: true } };
        }
      } catch (error) {
        ctx.log.warn('Looking up a saved chat reply failed.', error);
      }
    }
    await save(null, [], 'failed');
    return { status, body: message };
  };


  const key = ctx.userId || 'anon';
  const cap = ctx.userId ? ASK_PER_HOUR : ANON_PER_HOUR;
  const now = ctx.now().getTime();
  const times = (recent.get(key) || []).filter((t) => now - t < 3600_000);
  if (times.length >= cap) return { status: 429, body: 'The AI needs a breather. Try again in a bit.' };
  if (ctx.userId && times.length && now - times[times.length - 1] < 1000) return { status: 429, body: 'One at a time.' };
  times.push(now);
  recent.set(key, times);

  if (!narrator) return fallback(503, 'AI answers are not set up yet.');

  try {
    const text = await narrator.complete({ system: ASK_SYSTEM, prompt: askPrompt(body) });
    const parsed = JSON.parse(text) as { narration?: unknown; ideas?: unknown };
    const answer = str(parsed.narration, 1500);
    if (!answer) return fallback(502, 'The AI came back empty.');
    const ideas = Array.isArray(parsed.ideas) ? parsed.ideas.slice(0, 3).map((i) => str(i, 80)).filter(Boolean) : [];
    await save(answer, ideas, 'gemini');
    return { status: 200, body: { answer, ideas } };
  } catch (error) {
    ctx.log.warn('Ask AI failed.', error);
    return fallback(502, 'The AI is unavailable right now.');
  }
}
