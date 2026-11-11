// Records the guided tour for the homepage walkthrough video; see talkshops/README.md.
// Records the guided tour at 1280x720 and logs when each narration clip starts and ends.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: 'vid', size: { width: 1280, height: 720 } } });
  const t0 = Date.now();
  const events = [];
  await ctx.exposeFunction('__log', (kind, src) => events.push({ kind, src, t: (Date.now() - t0) / 1000 }));
  await ctx.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.__hooked) { this.__hooked = true; this.addEventListener('playing', () => window.__log('play', this.src)); this.addEventListener('ended', () => window.__log('end', this.src)); }
      return play.apply(this, arguments);
    };
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8765/demo.html?tour=1'); await p.waitForTimeout(1500);
  await p.click('#tsGo');
  const deadline = Date.now() + 9 * 60000;
  while (Date.now() < deadline) {
    await p.waitForTimeout(1000);
    if (await p.$('#tSkip')) { await p.waitForTimeout(6000); await p.click('#tSkip').catch(() => {}); }
    if (events.some(e => e.kind === 'end' && /wrap/.test(e.src))) break;
  }
  await p.waitForTimeout(1000);
  await ctx.close(); await b.close();
  fs.writeFileSync('events.json', JSON.stringify(events, null, 1));
  console.log(events.filter(e=>e.kind==='play').map(e => e.t.toFixed(1) + ' ' + e.src.split('/').pop()).join('\n'));
})();
