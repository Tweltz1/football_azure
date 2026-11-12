// Makes the App Store screenshots (6.7-inch iPhone, 1290x2796) for Hood League and Hood Games from the live
// site with Playwright: a 430x932 phone at 3x. Run locally: node scripts/payments/store-shots/capture-hood.js
// Writes scripts/payments/store-shots/com.hoodleague.draft/*.jpg and .../com.hoodleague.games/*.jpg.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const SITE = 'https://hood-league.com';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const GUEST = { userId: 'guest-store', userDetails: 'Coach', guest: true };

const SETS = {
  'com.hoodleague.draft': { ua: IPHONE, shots: [
    { name: '1-home', url: '/' },
    { name: '2-rankings', url: '/rankings', guest: true, act: async (p) => { await p.getByText('Season', { exact: true }).first().click(); await p.waitForTimeout(1500); await p.mouse.wheel(0, 420); } },
    { name: '3-create-league', url: '/create-league', guest: true },
    { name: '4-draft-games', url: '/games', guest: true },
  ] },
  'com.hoodleague.games': { ua: `${IPHONE} HoodGames`, shots: [
    { name: '1-hub', url: '/hood-games' },
    { name: '2-games-night', url: '/party' },
    { name: '3-hood-quest', url: '/dnd' },
    { name: '4-card-table', url: '/cards' },
  ] },
};

(async () => {
  const browser = await chromium.launch();
  for (const [bundle, set] of Object.entries(SETS)) {
    const dir = path.join(__dirname, bundle);
    fs.mkdirSync(dir, { recursive: true });
    for (const shot of set.shots) {
      const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: set.ua, colorScheme: 'dark' });
      if (shot.guest) await ctx.addInitScript((g) => localStorage.setItem('hl-offline:guest', JSON.stringify(g)), GUEST);
      // No intro animation in screenshots.
      await ctx.addInitScript(() => { try { localStorage.setItem('hl-crew-intro-seen', '1'); } catch (e) { /* ignore */ } });
      const page = await ctx.newPage();
      await page.goto(SITE + shot.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      // Skip the crew intro if it plays.
      await page.getByRole('button', { name: /^skip/i }).first().click({ timeout: 1000 }).catch(() => {});
      if (shot.act) await shot.act(page);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(dir, `${shot.name}.jpg`), type: 'jpeg', quality: 90 });
      console.log(bundle, shot.name);
      await ctx.close();
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
