// Scores Curbsy's photo naming (Gemini, supabase/functions/_shared/junk.ts) on public photos from Wikimedia
// Commons, for the current instructions and an older set, so a prompt change can be checked before it ships.
// Gemini can't be retrained; its instructions and examples are what we improve, and this is the scorecard.
//
//   GEMINI_API_KEY=... node ml/curbsy-detect-eval/eval.mjs [old-prompt.txt]
//
// Each case searches Commons and takes the first photo found, so the exact photos can change over time; both
// prompts always see the same photos in one run. Scores: right category, title uses an expected word, and
// allowed/not allowed right. Prints counts and short titles only.
import { readFileSync } from 'node:fs';
import { DETECT_SYSTEM, geminiJunkDetector } from '../../supabase/functions/_shared/junk.ts';

const here = new URL('.', import.meta.url);
const key = process.env.GEMINI_API_KEY;
if (!key) { console.log('No GEMINI_API_KEY: nothing to score.'); process.exit(0); }
const oldPrompt = readFileSync(new URL(process.argv[2] ?? 'prompt-2026-11-10.txt', here), 'utf8').trim();
const cases = JSON.parse(readFileSync(new URL('cases.json', here), 'utf8'));
const UA = { 'user-agent': 'curbsy-detect-eval/1.0 (prompt test)' };

async function photo(search) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${search} filetype:bitmap`, gsrnamespace: '6',
    gsrlimit: '5', prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '768' }).forEach(([k, v]) => u.searchParams.set(k, v));
  const pages = Object.values((await (await fetch(u, { headers: UA })).json())?.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || ii.mime !== 'image/jpeg' || !ii.thumburl) continue;
    const r = await fetch(ii.thumburl, { headers: UA });
    if (r.ok) return { title: p.title, b64: Buffer.from(await r.arrayBuffer()).toString('base64') };
  }
  return null;
}

const runs = { before: geminiJunkDetector(key, fetch, undefined, oldPrompt), now: geminiJunkDetector(key, fetch, undefined, DETECT_SYSTEM) };
const score = Object.fromEntries(Object.keys(runs).map((k) => [k, { category: 0, categoryOf: 0, title: 0, titleOf: 0, allowed: 0, allowedOf: 0, failed: 0 }]));
for (const c of cases) {
  const img = await photo(c.search).catch(() => null);
  if (!img) { console.log(`skip (no photo) | ${c.search}`); continue; }
  const line = [c.search];
  for (const [name, det] of Object.entries(runs)) {
    const s = score[name];
    let d;
    try { d = await det.detect(img.b64); } catch (e) { s.failed++; line.push(`${name}: failed ${e.status ?? ''}`); continue; }
    const wantAllowed = c.allowed ?? true;
    s.allowedOf++; if (d.allowed === wantAllowed) s.allowed++;
    if (wantAllowed && c.category) { s.categoryOf++; if (d.category === c.category) s.category++; }
    if (wantAllowed && c.words?.length) { s.titleOf++; if (c.words.some((w) => d.title.toLowerCase().includes(w))) s.title++; }
    line.push(`${name}: ${d.allowed ? `${d.category} "${d.title}" ${d.condition}` : 'NOT ALLOWED'}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(line.join(' | '));
}
const pct = (a, b) => (b ? `${a}/${b} (${Math.round((a / b) * 100)}%)` : '-');
console.log('\n           category      title word    allowed right  failed');
for (const [name, s] of Object.entries(score)) {
  console.log(`${name.padEnd(10)} ${pct(s.category, s.categoryOf).padEnd(13)} ${pct(s.title, s.titleOf).padEnd(13)} ${pct(s.allowed, s.allowedOf).padEnd(14)} ${s.failed}`);
}
