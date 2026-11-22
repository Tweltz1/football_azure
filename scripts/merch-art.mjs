// Generates realistic, embroidery-style animal art for merch hats with Gemini image generation.
//   node scripts/merch-art.mjs   (reads merch/art/prompts.json, writes merch/art/raw/<key>-<n>.png)
// Env: GEMINI_KEY. Skips images that already exist, so re-runs only make new or renamed prompts.
import fs from 'node:fs';

const KEY = process.env.GEMINI_KEY;
if (!KEY) { console.log('::warning::No Gemini key set (GEMINI_IMAGE_KEY or GEMINI_API_KEY), skipping.'); process.exit(0); }
const MODELS = (process.env.MODELS || 'gemini-2.5-flash-image,gemini-3-pro-image-preview').split(',');
const cfg = JSON.parse(fs.readFileSync('merch/art/prompts.json', 'utf8'));
fs.mkdirSync('merch/art/raw', { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gen(prompt) {
  let last = '';
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.status === 429 && /current quota/.test(JSON.stringify(body))) { last = `${model} no image quota on this key`; break; }
      if (r.status === 429 || r.status >= 500) { last = `${model} ${r.status} ${JSON.stringify(body).slice(0, 300)}`; await sleep(20000); continue; }
      if (!r.ok) { last = `${model} ${r.status} ${JSON.stringify(body).slice(0, 300)}`; break; }
      const part = (body.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data);
      if (part) return { model, data: Buffer.from(part.inlineData.data, 'base64') };
      last = `${model} no image ${JSON.stringify(body).slice(0, 300)}`; break;
    }
  }
  throw new Error(last);
}

let ok = 0, failed = 0;
for (const it of cfg.items) {
  for (let n = 1; n <= (it.count || 2); n++) {
    const f = `merch/art/raw/${it.key}-${n}.png`;
    if (fs.existsSync(f)) continue;
    try {
      const { model, data } = await gen(`${cfg.style}\n\n${it.prompt}`);
      fs.writeFileSync(f, data); ok++; console.log(`✓ ${f} (${model})`);
    } catch (e) { failed++; console.log(`::warning::${f}: ${e.message}`); }
    await sleep(3000);
  }
}
console.log(`art: ${ok} made, ${failed} failed`);
