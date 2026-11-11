// weltzcraft.com: serves the static site and takes the project brief form.
// POST /api/brief emails the brief to sales@weltzcraft.com through Resend (RESEND_API_KEY is a Pages secret,
// set by the deploy workflow). With no key set it answers 503 and the page falls back to opening an email.
const TO = 'sales@weltzcraft.com';
const FROM = 'Weltzcraft site <hello@weltzcraft.com>';
const PLATFORMS = ['Not sure yet', 'iPhone app', 'Web app', 'Both'];
const TIMELINES = ['Flexible', 'Within a month', '1 to 3 months', '3 months or more'];

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, ' ');

async function brief(request, env) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  // Browsers send Origin on a cross-site POST; only our own pages may post here.
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { error: 'Wrong site' });
  if (Number(request.headers.get('Content-Length') || 0) > 20000) return json(413, { error: 'Too long' });
  let b;
  try { b = await request.json(); } catch (e) { return json(400, { error: 'Bad request' }); }
  if (!b || typeof b !== 'object') return json(400, { error: 'Bad request' });
  // Bots fill the hidden "website" box and submit instantly. Say OK and send nothing.
  if (clean(b.website, 200) || Number(b.elapsed) < 3) return json(200, { ok: true });

  const name = oneLine(b.name, 120), org = oneLine(b.org, 160), email = oneLine(b.email, 200), idea = clean(b.idea, 5000);
  const platform = PLATFORMS.includes(b.platform) ? b.platform : PLATFORMS[0];
  const timeline = TIMELINES.includes(b.timeline) ? b.timeline : TIMELINES[0];
  if (!name || !idea) return json(400, { error: 'Add your name and a sentence about the app.' });
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) return json(400, { error: 'Add an email address we can reply to.' });
  if (!env.RESEND_API_KEY) return json(503, { error: 'Email is not set up' });

  const text = ['New project brief from weltzcraft.com', '', 'Name: ' + name, 'Email: ' + email,
    org ? 'Business or project: ' + org : null, 'Platform: ' + platform, 'Timeline: ' + timeline, '', idea]
    .filter((l) => l !== null).join('\n');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [TO], reply_to: email, subject: 'App project: ' + (org || name), text }),
  });
  if (r.ok) return json(200, { ok: true });
  return json(502, { error: 'Could not send' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/brief') {
      try { return await brief(request, env); } catch (e) { return json(500, { error: 'Something went wrong' }); }
    }
    return env.ASSETS.fetch(request);
  },
};
