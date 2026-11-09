// Price list import: POST /api/shop/price-import. An owner uploads whatever their shop already uses for prices
// (a PDF menu, a photo of the price board, a spreadsheet with its own columns) and Gemini reads it into saved items.
// Nothing is saved here: the app shows every item for review and the owner saves through POST shop/me.

import type { Ctx, Res } from './handlers.ts';
import { amount, type ChargeKind } from './shopBilling.ts';

type Body = Record<string, unknown>;

/** One price the reader found. `check` marks an item the owner should look at (a guess, or something missing). */
export interface FoundPrice { name: string; kind: ChargeKind; rate: number; hours?: number; check?: boolean; note?: string }
export interface PriceReader { read(input: { file?: { mime: string; data: string }; text?: string }): Promise<{ items: FoundPrice[]; laborRate?: number }> }

export const PRICE_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
/** Base64 characters, about 4.5 MB of file. */
export const MAX_PRICE_FILE = 6_000_000;
export const MAX_PRICE_TEXT = 60_000;
export const MAX_FOUND = 250;
const PER_HOUR = 30;

export const PRICE_SYSTEM = `You read price lists from independent auto repair shops and turn them into a list of saved items for the shop's estimating app. Every shop formats prices its own way: service menus, labor rate sheets, fee schedules, parts lists, spreadsheets with odd columns, photos of a price board, or invoices.

Each item has:
- "name": a short plain description a customer would understand, e.g. "Synthetic oil change (up to 5 qt)", "Front brake pads", "Diagnostic fee". Keep sizes and limits that change the price. Up to 100 characters.
- "kind", one of:
  "labor": priced per hour. "rate" is dollars per hour. If the list gives a job's labor time (book hours, "1.5 hr"), put it in "hours".
  "part": a part, fluid or material sold by the unit. "rate" is the unit price.
  "fee": a flat-priced service, package or shop charge (oil change special, diagnostic fee, tire mount and balance, disposal fee). "rate" is the price.
  "percent": a charge stated as a percent (shop supplies 8% of labor). "rate" is the percent, 0 to 100.
- "rate": a number in dollars (or percent) with up to 2 decimals, no symbols.
- "hours": only for labor items whose time is listed; otherwise 0.
- "check": true when the owner should look at it: you guessed the kind, the price is a range ("$89-$129", use the lowest and say so), it says "starting at" or "call", a number was hard to read, or a labor time has no hourly rate.
- "note": when check is true, a few words on why (e.g. "Price is a range, used the low end"). Otherwise empty.

Rules:
- If the list states the shop's hourly labor rate, return it as "laborRate" and also as its own labor item named "Labor" (hours 0).
- A job listed with labor hours but no price: kind labor, hours as listed, rate = the shop's hourly labor rate if stated, otherwise 0 with check true.
- A job listed with both hours and a total price: kind fee at the total price, and mention the hours in the name, e.g. "Front brake pads (1.5 hr)".
- Several prices for one service (by vehicle size, by quart, by tier such as good/better/best): one item per price, with the variant in the name.
- Skip headings, phone numbers, addresses, totals, taxes, dates, coupons with no price, and anything that is not something the shop charges for.
- Never invent items or prices that are not in the document. If there are no prices, return an empty list.
- Text only, no markdown. At most ${MAX_FOUND} items.`;

export const PRICE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    laborRate: { type: 'NUMBER' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          kind: { type: 'STRING', enum: ['labor', 'part', 'fee', 'percent'] },
          rate: { type: 'NUMBER' },
          hours: { type: 'NUMBER' },
          check: { type: 'BOOLEAN' },
          note: { type: 'STRING' },
        },
        required: ['name', 'kind', 'rate'],
      },
    },
  },
  required: ['items'],
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** Keeps only items the app can save; fixes rounding and drops duplicates (same name and kind). */
export function cleanFound(list: unknown): FoundPrice[] {
  if (!Array.isArray(list)) return [];
  const out: FoundPrice[] = [], seen = new Set<string>();
  for (const raw of list) {
    if (out.length >= MAX_FOUND) break;
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Body;
    const name = typeof r.name === 'string' ? r.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    const kind = (['labor', 'part', 'fee', 'percent'] as const).find((k) => k === r.kind);
    const rate = typeof r.rate === 'number' && Number.isFinite(r.rate) ? cents(Math.abs(r.rate)) : NaN;
    if (!name || !kind || !amount(rate, kind === 'percent' ? 100 : 1_000_000)) continue;
    const key = kind + '|' + name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const item: FoundPrice = { name, kind, rate };
    const hours = typeof r.hours === 'number' && Number.isFinite(r.hours) ? Math.round(r.hours * 100) / 100 : 0;
    if (kind === 'labor' && hours > 0 && hours <= 1000) item.hours = hours;
    const note = typeof r.note === 'string' ? r.note.trim().slice(0, 120) : '';
    if (r.check === true || (kind === 'labor' && rate === 0)) { item.check = true; item.note = note || (rate === 0 ? 'No hourly rate found' : 'Please check'); }
    out.push(item);
  }
  return out;
}

/** Gemini reads the file (PDF or photo) or the spreadsheet text. Tries `models` in order when one is busy. */
export function geminiPriceReader(apiKey: string, fetchFn: typeof fetch = fetch, models = ['gemini-flash-latest', 'gemini-flash-lite-latest']): PriceReader {
  return {
    async read(input) {
      const parts: unknown[] = input.file
        ? [{ inlineData: { mimeType: input.file.mime, data: input.file.data } }, { text: 'This is the shop\'s price list. Read every price.' }]
        : [{ text: 'This is the shop\'s price list, exported from a spreadsheet (one row per line, cells separated by tabs). Read every price.\n\n' + input.text }];
      let last: unknown;
      for (const model of models) {
        try {
          const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: PRICE_SYSTEM }] },
              contents: [{ role: 'user', parts }],
              generationConfig: { responseMimeType: 'application/json', responseSchema: PRICE_SCHEMA, temperature: 0.1, maxOutputTokens: 32768 },
            }),
            signal: AbortSignal.timeout(model === models.at(-1) ? 60_000 : 45_000),
          });
          if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}`), { status: res.status });
          const out = await res.json();
          const text = (out?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string; thought?: boolean }) => p.thought ? '' : p.text ?? '').join('');
          const parsed = JSON.parse(text || '{}') as Body;
          const laborRate = typeof parsed.laborRate === 'number' && parsed.laborRate > 0 && parsed.laborRate < 10_000 ? cents(parsed.laborRate) : undefined;
          return { items: Array.isArray(parsed.items) ? parsed.items as FoundPrice[] : [], laborRate };
        } catch (err) {
          last = err;
          const status = (err as { status?: number }).status;
          if (status && status !== 429 && status < 500) break;
        }
      }
      throw last;
    },
  };
}

const recent = new Map<string, number[]>();
/** Test hook. */
export function clearPriceImportLimits() { recent.clear(); }

export async function priceImportRoute(ctx: Ctx, reader: PriceReader | null | undefined, shopId: string, method: string, data: unknown): Promise<Res> {
  if (method !== 'POST') return { status: 405 };
  const body = (data && typeof data === 'object' ? data : {}) as Body;
  let input: { file?: { mime: string; data: string }; text?: string };
  if (typeof body.text === 'string') {
    const text = body.text.trim();
    if (!text) return { status: 400, body: 'That file looks empty.' };
    if (text.length > MAX_PRICE_TEXT) return { status: 400, body: 'That sheet is too long to read at once. Split it into smaller files.' };
    input = { text };
  } else {
    const mime = typeof body.mime === 'string' ? body.mime : '';
    const file = typeof body.data === 'string' ? body.data : '';
    if (!(PRICE_FILE_TYPES as readonly string[]).includes(mime)) return { status: 400, body: 'Upload a PDF, a photo (JPEG or PNG), an Excel .xlsx or a CSV file.' };
    if (!file || !/^[A-Za-z0-9+/]+=*$/.test(file)) return { status: 400, body: 'That file could not be read.' };
    if (file.length > MAX_PRICE_FILE) return { status: 400, body: 'That file is too big. Upload one under 4 MB, or one page at a time.' };
    input = { file: { mime, data: file } };
  }

  const now = ctx.now().getTime();
  const times = (recent.get(shopId) || []).filter((t) => now - t < 3600_000);
  if (times.length >= PER_HOUR) return { status: 429, body: 'Your shop has read a lot of price lists this hour. Try again in a bit.' };
  times.push(now);
  recent.set(shopId, times);

  if (!reader) return { status: 503, body: 'Reading price lists automatically is not set up yet. Use a CSV with name, type and rate columns instead.' };
  try {
    const found = await reader.read(input);
    return { status: 200, body: { items: cleanFound(found.items), laborRate: found.laborRate ?? null } };
  } catch (e) {
    ctx.log.warn('price import failed', { error: String(e) });
    return { status: 502, body: 'Could not read that price list right now. Try again in a minute, or try a clearer photo.' };
  }
}
