// Learning from real use (Tyler, 2026-11-10: on by default, a shop can turn it off in Settings).
// When staff answer a customer's text, we keep the customer's text with personal details removed, what the
// text sorter thought it was, and whether staff used the suggested reply. Nothing ties a row to a shop, a job
// or a customer. Rows are deleted after 12 months. ml/sms-topics/train.mjs uses them in the monthly retrain.
import { classifyText, type SmsTopic } from './smsTopicModel.ts';

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
// VINs, plates, RO and order numbers: any word mixing letters and digits, or 3+ digits in a row.
const CODE = /\b(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9-]{4,}\b|\b\d{3,}\b/g;
const ADDRESS = /\b\d+\s+(?:[A-Za-z]+\s){0,3}(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|ct|court|way|hwy|highway)\b\.?/gi;
// "this is Mike", "it's Sarah", "my name is ...", and "Thanks, Tom" / "- Tom" at the end.
const INTRO = /\b(this is|it'?s|its|my name is|name'?s|from)\s+[A-Za-z][a-z'-]*(\s+[A-Z][a-z'-]*)?/gi;
const SIGN = /([,\-–—]\s*|\b(?:thanks|thank you|thx|ty)[,!.\s]+)[A-Z][a-z'-]+\s*[.!]?\s*$/;
// Capitalized words that are fine to keep (they help sorting and identify no one).
const KEEP = new Set(('I OK Ok Hi Hey Hello Yes No Yeah Yep Thanks Thank Is Are Can Could Will Would Do Does Did What When Where Why How Who ' +
  'Any Just The My Our Your You We It Its Please Pls Sorry Good Morning Afternoon Evening Great Perfect Sounds Go Ok Okay Sure Also And But ' +
  'Monday Tuesday Wednesday Thursday Friday Saturday Sunday AC A/C ' +
  'Honda Toyota Ford Chevy Chevrolet Subaru Nissan Dodge Ram Jeep Kia Hyundai BMW Audi VW Volkswagen Mazda GMC Buick Cadillac Lexus Acura ' +
  'Tesla Volvo Mercedes Chrysler Lincoln Infiniti Mitsubishi Civic Camry Accord Corolla Silverado Explorer Equinox Tahoe Tacoma Wrangler ' +
  'Outback Malibu Altima Odyssey Sienna Pilot Escape Focus Fusion Cherokee').split(' '));

/** The text with names, contact details, numbers and addresses taken out. */
export function scrubText(text: string): string {
  let t = String(text).slice(0, 600).replace(/[’‘]/g, "'");
  t = t.replace(EMAIL, ' ').replace(URL_RE, ' ').replace(PHONE, ' ').replace(ADDRESS, ' ').replace(CODE, ' ');
  t = t.replace(/\b[A-Za-z][a-z'-]+\s+(here|again|speaking)\b/gi, (m, w) => /^(it|its|im|i'm|is|are|we|me|you|car|truck|that|this)\s/i.test(m) ? m : '[name] ' + w);
  t = t.replace(INTRO, (_m, lead) => lead + ' [name]').replace(SIGN, (_m, lead) => lead + '[name]');
  // Any other capitalized word not starting a sentence and not on the keep list could be a name.
  t = t.replace(/(^|[.!?]\s+|\s)([A-Z][a-z'-]+)/g, (m, before, word) =>
    /^$|[.!?]\s+$/.test(before) || KEEP.has(word) ? m : before + '[name]');
  return t.replace(/\s+([?.!,])/g, '$1').replace(/\s{2,}/g, ' ').trim().slice(0, 300);
}

export type LearnOutcome = 'used' | 'edited' | 'own';
export interface LearnRow { text: string; topic: SmsTopic; p: number; outcome: LearnOutcome }

const words = (s: string) => new Set(s.toLowerCase().replace(/https?:\/\/\S+/g, ' link ').split(/[^a-z0-9]+/).filter((w) => w.length > 2));
/** How the staff reply relates to the suggested reply: sent as is, edited, or their own words. */
export function outcomeOf(reply: string, suggestions: string[]): LearnOutcome {
  const r = reply.trim().toLowerCase().replace(/\s+/g, ' ');
  if (suggestions.some((s) => s && s.trim().toLowerCase().replace(/\s+/g, ' ') === r)) return 'used';
  const rw = words(reply);
  for (const s of suggestions) {
    const sw = words(s);
    if (sw.size && [...sw].filter((w) => rw.has(w)).length / sw.size >= 0.6) return 'edited';
  }
  return 'own';
}

/** The row to save for one staff reply to one customer text, or null when there is nothing worth keeping. */
export function learnRow(customerText: string, reply: string, suggestions: string[]): LearnRow | null {
  const text = scrubText(customerText);
  if (text.replace(/\[name\]/g, '').replace(/[^a-z]/gi, '').length < 2) return null;
  const { topic, p } = classifyText(customerText);
  return { text, topic, p: Math.round(p * 1000) / 1000, outcome: outcomeOf(reply, suggestions) };
}
