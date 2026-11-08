// Walk-around photos: the eight angles customers are guided through, the damage marks a shop confirms,
// and the Gemini call that suggests marks. Suggestions stay hidden from the customer until the shop confirms them.

export const ANGLES = ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'] as const;
export type Angle = typeof ANGLES[number];
export const isAngle = (v: unknown): v is Angle => typeof v === 'string' && (ANGLES as readonly string[]).includes(v);
const ANGLE_LABEL: Record<Angle, string> = {
  front: 'front', front_right: 'front passenger corner', right: 'passenger side', rear_right: 'rear passenger corner',
  rear: 'rear', rear_left: 'rear driver corner', left: 'driver side', front_left: 'front driver corner',
};
export const angleLabel = (a: Angle) => ANGLE_LABEL[a];

export const DAMAGE_KINDS = ['scratch', 'dent', 'crack', 'chip', 'scuff', 'rust', 'broken', 'other'] as const;
export type DamageKind = typeof DAMAGE_KINDS[number];

/** A box on the photo, as fractions of its width and height (0 to 1). */
export interface DamageMark { id: string; x: number; y: number; w: number; h: number; kind: DamageKind; note?: string; source: 'ai' | 'shop'; confirmed: boolean }
export interface WalkPhoto { id: string; angle: Angle; src: string; addedAt: string; marks: DamageMark[]; aiAt?: string }

export const MAX_MARKS = 20;
const frac = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, Math.round(v * 1000) / 1000)) : NaN;

/** Validates marks sent by the shop (or found by the AI). Unknown or broken entries are dropped. */
export function cleanMarks(list: unknown, newId: () => string, max = MAX_MARKS): DamageMark[] {
  if (!Array.isArray(list)) return [];
  const out: DamageMark[] = [];
  for (const m of list.slice(0, max)) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    const x = frac(r.x), y = frac(r.y);
    let w = frac(r.w), h = frac(r.h);
    if ([x, y, w, h].some(Number.isNaN)) continue;
    w = Math.round(Math.min(w, 1 - x) * 1000) / 1000; h = Math.round(Math.min(h, 1 - y) * 1000) / 1000;
    if (w < 0.01 || h < 0.01) continue;
    const kind = (DAMAGE_KINDS as readonly string[]).includes(r.kind as string) ? r.kind as DamageKind : 'other';
    const note = typeof r.note === 'string' ? r.note.trim().slice(0, 140) : '';
    const id = typeof r.id === 'string' && /^[\w-]{1,64}$/.test(r.id) ? r.id : newId();
    out.push({ id, x, y, w, h, kind, ...(note ? { note } : {}), source: r.source === 'ai' ? 'ai' : 'shop', confirmed: r.confirmed === true });
  }
  return out;
}

export interface DamageFinder { find(jpegDataUrl: string, angle: Angle): Promise<Omit<DamageMark, 'id'>[]> }

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    damage: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
          kind: { type: 'STRING', enum: [...DAMAGE_KINDS] },
          note: { type: 'STRING' },
        },
        required: ['box_2d', 'kind'],
      },
    },
  },
  required: ['damage'],
};

const SYSTEM = 'You inspect photos of customer cars at a repair shop check-in. Find visible body or glass damage on the car: scratches, dents, cracks, chips, scuffs, rust, or broken parts. ' +
  'Ignore reflections, dirt, water drops, shadows, badges, panel gaps and anything not on the car. Only report damage you can clearly see; return an empty list when unsure. ' +
  'Give each one a tight box_2d as [ymin, xmin, ymax, xmax] scaled 0-1000, its kind, and a short note naming the panel (for example "Rear bumper, left side"). At most 8 items.';

/** Gemini vision. Tries `models` in order when one is busy. */
export function geminiDamageFinder(apiKey: string, fetchFn: typeof fetch = fetch, models = ['gemini-flash-latest', 'gemini-flash-lite-latest']): DamageFinder {
  return {
    async find(src, angle) {
      const data = src.replace(/^data:image\/jpeg;base64,/, '');
      let last: unknown;
      for (const model of models) {
        try {
          const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM }] },
              contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data } }, { text: `Photo of the ${ANGLE_LABEL[angle]} of the car.` }] }],
              generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2, maxOutputTokens: 2048 },
            }),
            signal: AbortSignal.timeout(25_000),
          });
          if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}`), { status: res.status });
          const out = await res.json();
          const text = (out?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string; thought?: boolean }) => p.thought ? '' : p.text ?? '').join('');
          const list = (JSON.parse(text || '{}').damage ?? []) as { box_2d?: number[]; kind?: string; note?: string }[];
          return list.flatMap((d) => {
            const b = d.box_2d;
            if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === 'number')) return [];
            const [y0, x0, y1, x1] = b.map((n) => Math.min(1000, Math.max(0, n)) / 1000);
            if (x1 <= x0 || y1 <= y0) return [];
            return [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: d.kind as DamageKind, note: d.note, source: 'ai' as const, confirmed: false }];
          }).slice(0, 8);
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
