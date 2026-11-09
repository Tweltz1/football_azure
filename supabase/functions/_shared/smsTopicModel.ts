// A small text sorter for customer texts, trained by ml/sms-topics/train.mjs (no AI service, no cost per text).
// It reads one incoming SMS and says which of these it is:
//   status   - "is my car done yet?"         hours  - "what time do you close?"
//   link     - "can you send the estimate?"  approval - "go ahead with the brakes"
//   review   - anything else, which stays with a person (prices, safety, scheduling, several questions...).
// The model is a softmax regression over hashed words, word pairs and letter triples, so typos still land.
// Its weights live in smsTopicWeights.ts as 8-bit numbers, regenerated whenever the model is retrained.
import { WEIGHTS } from './smsTopicWeights.ts';

export const TOPICS = ['status', 'hours', 'link', 'approval', 'review'] as const;
export type SmsTopic = typeof TOPICS[number];
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

let table: { scale: number; w: Int8Array } | null = null;
function load() {
  if (table) return table;
  const bin = atob(WEIGHTS.data);
  const w = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) w[i] = (bin.charCodeAt(i) << 24) >> 24;
  return (table = { scale: WEIGHTS.scale, w });
}

/** Chance of each topic for one text. */
export function topicScores(text: string): Record<SmsTopic, number> {
  const { scale, w } = load();
  const f = features(text);
  const z = TOPICS.map((_, k) => { let s = 0; for (const i of f) s += w[i * TOPICS.length + k]; return s * scale; });
  const m = Math.max(...z), e = z.map((v) => Math.exp(v - m)), sum = e.reduce((a, b) => a + b, 0);
  return Object.fromEntries(TOPICS.map((t, k) => [t, e[k] / sum])) as Record<SmsTopic, number>;
}

/** Best topic and how sure the model is. */
export function classifyText(text: string): { topic: SmsTopic; p: number } {
  const s = topicScores(text);
  let topic: SmsTopic = 'review';
  for (const t of TOPICS) if (s[t] > s[topic]) topic = t;
  return { topic, p: s[topic] };
}

// Things that must reach a person even if the text also asks for an update: safety, money, booking a time,
// complaints, and long or multi-part messages.
const KEEP_FOR_STAFF = /\b(safe|unsafe|danger\w*|smok\w*|fire|burn\w*|leak\w*|noise|tow\w*|accident|cost\w*|price\w*|charge\w*|owe|pay\w*|bill|discount|cheaper|quote|how much|warranty|refund\w*|complain\w*|manager|lawyer|insurance|claim|appointment|schedul\w*|book|reschedul\w*|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|call me|ride|loaner|rental|cancel\w*|wait|but|also|another|else)\b|\$|\d{1,2}(:\d\d)?\s*(am|pm)\b|\bat \d/i;

/**
 * Topic for an automatic reply: only when the model is very sure, the message is short and single-purpose,
 * and nothing in it needs a person. Approval is never automatic.
 */
export function autoTopic(text: string, minP = 0.9): SmsTopic {
  const t = text.trim();
  if (!t || t.length > 140 || KEEP_FOR_STAFF.test(t) || /\?[^?]*\?/.test(t)) return 'review';
  const { topic, p } = classifyText(t);
  return topic !== 'approval' && p >= minP ? topic : 'review';
}
