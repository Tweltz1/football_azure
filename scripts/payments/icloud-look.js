// Read-only: checks an iCloud Photos share link opens for anyone, and prints what's in it (count, type,
// duration) and the first frame's time. Downloads a still if one is offered, for checking which app it shows.
const fs = require('fs');
const id = (process.env.LINK || fs.readFileSync('scripts/payments/icloud-link.txt', 'utf8')).trim().split('/').pop();
(async () => {
  const page = await fetch(`https://share.icloud.com/photos/${id}`);
  console.log('share page', page.status);
  const r = await fetch('https://ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/public/records/resolve', {
    method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'https://www.icloud.com' },
    body: JSON.stringify({ shortGUIDs: [{ value: id }] }),
  });
  const t = await r.text();
  console.log('resolve', r.status);
  let d; try { d = JSON.parse(t); } catch { console.log(t.slice(0, 500)); return; }
  const res = d.results?.[0];
  if (!res) { console.log(t.slice(0, 800)); return; }
  const rec = res.rootRecord || {};
  const f = rec.fields || {};
  console.log('record type', rec.recordType, 'keys', Object.keys(f).join(','));
  for (const k of Object.keys(f)) {
    const v = f[k]?.value;
    if (v && typeof v === 'object' && v.downloadURL) { console.log(k, 'asset', v.size, 'bytes'); continue; }
    const s = JSON.stringify(v);
    if (s && s.length < 200) console.log(k, s);
  }
  for (const k of ['resJPEGThumbRes', 'resJPEGMedRes', 'resOriginalRes', 'resVidSmallRes', 'resVidMedRes']) {
    const u = f[k]?.value?.downloadURL;
    if (u) {
      const b = Buffer.from(await (await fetch(u.replace('${f}', 'x'))).arrayBuffer());
      fs.mkdirSync('scripts/payments/shots', { recursive: true });
      console.log('downloaded', k, b.length);
    }
  }
})().catch((e) => console.log('FAIL', e.message));
