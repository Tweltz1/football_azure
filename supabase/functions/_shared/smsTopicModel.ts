// A small text sorter for customer texts, trained by ml/sms-topics/train.mjs (no AI service, no cost per text).
// It reads one incoming SMS and says which of these it is:
//   status   - "is my car done yet?"         hours  - "what time do you close?"
//   link     - "can you send the estimate?"  approval - "go ahead with the brakes"
//   tech     - a car question ("why does it shake when I brake?"): staff get a How-to shortcut, never automatic
//   review   - anything else, which stays with a person (prices, safety, scheduling, several questions...).
// The model is a softmax regression over hashed words, word pairs and letter triples, so typos still land.
// Its weights live in smsTopicWeights.ts as 8-bit numbers, regenerated whenever the model is retrained.
import { WEIGHTS } from './smsTopicWeights.ts';
import { TECH_WEIGHTS } from './smsTechWeights.ts';

export const TOPICS = ['status', 'hours', 'link', 'approval', 'review'] as const;
export type SmsTopic = typeof TOPICS[number] | 'tech';
export const DIM = 1 << 14;

/** Lower case, plain apostrophes and quotes, digits folded to 0, words only. Shared by training and the app. */
export function words(text: string): string[] {
  return text.toLowerCase().replace(/[’‘`']/g, '').replace(/https?:\/\/\S+/g, ' url ').replace(/\d+/g, '0')
    .split(/[^a-z0]+/).filter(Boolean).slice(0, 80);
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % DIM;
}

/** Feature ids for a text (index 0 is the bias). Duplicates are kept so repeated words count more. */
export function features(text: string): number[] {
  const w = words(text);
  const out = [0];
  for (let i = 0; i < w.length; i++) {
    out.push(hash('w:' + w[i]));
    if (i + 1 < w.length) out.push(hash('b:' + w[i] + ' ' + w[i + 1]));
    const p = '<' + w[i] + '>';
    for (let j = 0; j + 3 <= p.length; j++) out.push(hash('c:' + p.slice(j, j + 3)));
  }
  out.push(hash('n:' + Math.min(w.length, 12)));
  if (/\?[^?]*\?/.test(text)) out.push(hash('x:two-questions'));
  return out;
}

type Table = { scale: number; w: Int8Array };
const tables = new Map<string, Table>();
function load(t: { scale: number; data: string }): Table {
  const hit = tables.get(t.data.slice(0, 64));
  if (hit) return hit;
  const bin = atob(t.data);
  const w = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) w[i] = (bin.charCodeAt(i) << 24) >> 24;
  const out = { scale: t.scale, w };
  tables.set(t.data.slice(0, 64), out);
  return out;
}
function softmax(t: { scale: number; data: string }, f: number[], K: number) {
  const { scale, w } = load(t);
  const z = Array.from({ length: K }, (_, k) => { let s = 0; for (const i of f) s += w[i * K + k]; return s * scale; });
  const m = Math.max(...z), e = z.map((v) => Math.exp(v - m)), sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

/** How sure the tech detector must be (chosen 2026-11-10: catches 32 of 33 test car questions, 9 false alarms in 98). */
export const TECH_MIN = 0.9;

/** Chance that a text is a car question (how it works, a symptom, a part, maintenance advice). A second small model. */
export function techScore(text: string): number {
  return TECH_WEIGHTS.data ? softmax(TECH_WEIGHTS, features(text), 2)[1] : 0;
}

/** Chance of each topic for one text (the main sorter; tech is decided separately). */
export function topicScores(text: string): Record<typeof TOPICS[number], number> {
  const s = softmax(WEIGHTS, features(text), TOPICS.length);
  return Object.fromEntries(TOPICS.map((t, k) => [t, s[k]])) as Record<typeof TOPICS[number], number>;
}

/** Best topic and how sure the model is. A text the main sorter leaves for staff may be a car question (tech). */
export function classifyText(text: string): { topic: SmsTopic; p: number } {
  const s = topicScores(text);
  let topic: typeof TOPICS[number] = 'review';
  for (const t of TOPICS) if (s[t] > s[topic]) topic = t;
  if (topic === 'review') { const t = techScore(text); if (t >= TECH_MIN) return { topic: 'tech', p: t }; }
  return { topic, p: s[topic] };
}

// Things that must reach a person even if the text also asks for an update: safety, money, booking a time,
// complaints, and long or multi-part messages.
const KEEP_FOR_STAFF = /\b(safe|unsafe|danger\w*|smok\w*|fire|burn\w*|leak\w*|noise|tow\w*|accident|cost\w*|price\w*|charge\w*|owe|pay\w*|bill|discount|cheaper|quote|how much|warranty|refund\w*|complain\w*|manager|lawyer|insurance|claim|appointment|schedul\w*|book|reschedul\w*|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|call me|ride|loaner|rental|cancel\w*|wait|but|also|another|else)\b|\$|\d{1,2}(:\d\d)?\s*(am|pm)\b|\bat \d/i;

/**
 * Topic for an automatic reply: only when the model is very sure, the message is short and single-purpose,
 * and nothing in it needs a person. Only status, hours and link are ever answered automatically.
 */
export function autoTopic(text: string, minP = 0.9): SmsTopic {
  const t = text.trim();
  if (!t || t.length > 140 || KEEP_FOR_STAFF.test(t) || /\?[^?]*\?/.test(t)) return 'review';
  const { topic, p } = classifyText(t);
  return (topic === 'status' || topic === 'hours' || topic === 'link') && p >= minP ? topic : 'review';
}
