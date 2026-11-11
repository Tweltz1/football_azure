// Makes sample item photos for Curbsy's App Store screenshots with Gemini's image model and saves them to
// $PHOTO_OUT (the workflow commits them to the curbsy-store-photos branch). Env: GEMINI_API_KEY, PHOTO_OUT.
const fs = require('fs');
const path = require('path');

const OUT = process.env.PHOTO_OUT || 'photos';
const LOOK = 'Realistic smartphone photo taken by a regular person, natural daylight, slightly imperfect framing, no people, no text, no logos, square crop.';
const PHOTOS = {
  'armchair': 'A mid-century wooden armchair with mustard yellow cushions sitting at the end of a suburban driveway next to the curb.',
  'bike': 'A kids blue bicycle with training wheels leaning against a white picket fence on a sidewalk.',
  'dresser': 'A white six-drawer wooden dresser with brass knobs on a front porch, a little worn.',
  'plants': 'Three potted houseplants (a pothos, a snake plant and a small fern) in terracotta pots on porch steps.',
  'books': 'A cardboard box full of paperback novels and kids picture books on a front step.',
  'lamp': 'A brass floor lamp with a linen shade standing on a lawn next to the curb.',
  'desk': 'A small light oak writing desk with one drawer in a garage with the door open.',
  'toys': 'A plastic bin of wooden toy blocks, a toy truck and stuffed animals on a porch.',
};

(async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.log('GEMINI_API_KEY not set'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, prompt] of Object.entries(PHOTOS)) {
    let done = false;
    for (const model of ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview', 'gemini-3-pro-image-preview']) {
      if (done) break;
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts: [{ text: `${prompt} ${LOOK}` }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
        });
        const j = await res.json();
        if (!res.ok) { console.log(`${name} ${model}: ${res.status} ${JSON.stringify(j).slice(0, 200)}`); continue; }
        const part = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
        if (!part) { console.log(`${name} ${model}: no image`); continue; }
        const ext = (part.inlineData.mimeType || 'image/png').includes('jpeg') ? 'jpg' : 'png';
        fs.writeFileSync(path.join(OUT, `${name}.${ext}`), Buffer.from(part.inlineData.data, 'base64'));
        console.log(`OK   ${name} (${model})`);
        done = true;
      } catch (e) { console.log(`${name} ${model}: ${e.message}`); }
    }
  }
})();
