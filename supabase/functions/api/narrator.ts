// The Hood Quest AI narrator: one model call per narration, returning { narration, ideas } as JSON.
// GEMINI_API_KEY (free tier from aistudio.google.com) turns on Google Gemini. ANTHROPIC_API_KEY turns on Claude
// instead, if that's the only key set. DND_NARRATOR_MODEL overrides the model for whichever provider is on.
// With no key, or if a call fails, the phones fall back to the built-in narrator.

import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { NARRATION_SCHEMA, type Narrator } from '../_shared/dnd.ts';

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
// Tried next when the first model is busy (Google returns 503/429 at peak times on the free tier).
const GEMINI_BACKUP_MODEL = 'gemini-flash-lite-latest';
export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';

interface Keys { gemini?: string; anthropic?: string; model?: string }

/** Picks the narrator from whichever key is set. Gemini wins when both are. */
export function createNarrator({ gemini, anthropic, model }: Keys): Narrator | null {
  if (gemini) return geminiNarrator(gemini, model?.startsWith('gemini') ? model : DEFAULT_GEMINI_MODEL);
  if (anthropic) return claudeNarrator(anthropic, model?.startsWith('claude') ? model : DEFAULT_CLAUDE_MODEL);
  return null;
}

// Gemini's response schema is an OpenAPI subset without additionalProperties.
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    narration: { type: 'STRING' },
    ideas: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['narration', 'ideas'],
};

export function geminiNarrator(apiKey: string, model: string, fetchFn: typeof fetch = fetch): Narrator {
  const models = model === GEMINI_BACKUP_MODEL ? [model] : [model, GEMINI_BACKUP_MODEL];
  const once = async (name: string, system: string, prompt: string) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`;
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, temperature: 1, maxOutputTokens: 4096 },
      }),
      // Two tries must fit inside the 20 seconds the TV waits before narrating on its own.
      signal: AbortSignal.timeout(9_000),
    });
    if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status });
    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).map((p: { text?: string; thought?: boolean }) => (p.thought ? '' : p.text ?? '')).join('');
    if (!text) throw new Error(`No narration (finish reason ${candidate?.finishReason ?? data?.promptFeedback?.blockReason ?? 'unknown'}).`);
    return text;
  };
  return {
    async complete({ system, prompt }) {
      let last: unknown;
      for (const name of models) {
        try {
          return await once(name, system, prompt);
        } catch (err) {
          last = err;
          const status = (err as { status?: number }).status;
          // Only a busy or slow model is worth a second try; a bad key or request fails the same way twice.
          if (status && status !== 429 && status < 500) break;
        }
      }
      throw last;
    },
  };
}

export function claudeNarrator(apiKey: string, model: string): Narrator {
  const client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  return {
    async complete({ system, prompt }) {
      const response = await client.messages.create({
        model,
        max_tokens: 2000,
        // Narration is short and latency-sensitive: low effort keeps it quick.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: NARRATION_SCHEMA } },
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.stop_reason === 'refusal') throw new Error('The narrator declined this one.');
      const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      if (!text) throw new Error(`No narration (stop reason ${response.stop_reason}).`);
      return text;
    },
  };
}
