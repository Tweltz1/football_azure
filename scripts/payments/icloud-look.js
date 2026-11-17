// Read-only: checks each iCloud Photos share link in icloud-link.txt opens for anyone, prints what's in it,
// and prints the preview image as base64 (to see which app the video shows).
const fs = require('fs');
const ids = fs.readFileSync('scripts/payments/icloud-link.txt', 'utf8').trim().split(/\s+/).map((l) => l.split('/').pop());
(async () => {
  for (const id of ids) {
    console.log('== ' + id);
    const page = await fetch(`https://share.icloud.com/photos/${id}`);
    console.log('share page', page.status);
    const r = await fetch('https://ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/public/records/resolve', {
      method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'https://www.icloud.com' },
      body: JSON.stringify({ shortGUIDs: [{ value: id }] }),
    });
    const t = await r.text();
    let d; try { d = JSON.parse(t); } catch { console.log(t.slice(0, 500)); continue; }
    const f = d.results?.[0]?.rootRecord?.fields;
    if (!f) { console.log(t.slice(0, 800)); continue; }
    for (const k of Object.keys(f)) {
      const v = f[k]?.value;
      if (v && typeof v === 'object' && v.downloadURL) {
        const b = Buffer.from(await (await fetch(v.downloadURL)).arrayBuffer());
        console.log(k, b.length, 'bytes B64START' + b.toString('base64') + 'B64END');
      } else console.log(k, JSON.stringify(v));
    }
  }
})().catch((e) => console.log('FAIL', e.message));
