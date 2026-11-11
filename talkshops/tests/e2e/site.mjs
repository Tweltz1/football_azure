// End-to-end check of the live talkshops.app against its Supabase project, run by
// .github/workflows/talkshops-e2e.yml. It signs in as a throwaway test owner, sets up a shop,
// checks in a car, builds and sends an estimate, approves it as the customer, moves stages,
// opens every tab and calls the shop API. Test data only (fake names, 555 numbers and
// Resend's delivered@resend.dev test inbox). Everything it made is deleted at the end.
// The repo is public: the report holds no tokens, links or real customer data.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

// talkshops.app sits behind Cloudflare's bot challenge, which stops headless browsers from
// GitHub's servers, so the check uses the same deployment at its pages.dev address.
const SITE = process.env.SITE_URL || 'https://talkshops.pages.dev';
const SB = process.env.SB_URL;            // https://<ref>.supabase.co
const ANON = process.env.SB_ANON;         // publishable key
const SERVICE = process.env.SB_SERVICE;   // secret key, only for creating and deleting test users
const OUT = process.env.OUT_DIR || 'e2e-out';
fs.mkdirSync(OUT, { recursive: true });

const results = [];      // { step, ok, note }
const problems = [];     // console errors, page errors, failed requests
const made = { users: [], shops: [], phones: [] };
const rand = Math.random().toString(36).slice(2, 8);
const pass = 'E2e-' + rand + '-Pw!9';
const phoneDigits = '55501' + String(Math.floor(Math.random() * 90) + 10) + String(Math.floor(Math.random() * 900) + 100);
const phone = `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
const scrub = (s) => String(s).replace(/[?&]c=[\w-]+/g, '?c=…').replace(/eyJ[\w.-]+/g, 'jwt…').replace(/sb_(secret|publishable)_[\w-]+/g, 'sb_…').slice(0, 300);

async function step(name, fn) {
  const t = Date.now();
  try { const note = await fn(); results.push({ step: name, ok: true, note: note ? scrub(note) : '', ms: Date.now() - t }); console.log('PASS', name, note ? '· ' + scrub(note) : ''); }
  catch (e) { results.push({ step: name, ok: false, note: scrub(e.message || e), ms: Date.now() - t }); console.log('FAIL', name, '·', scrub(e.message || e)); }
}

async function admin(method, path, body) {
  const r = await fetch(SB + path, { method, headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path.split('?')[0]} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
async function newUser(tag) {
  const email = `e2e-${tag}-${rand}@talkshops.app`;
  const u = await admin('POST', '/auth/v1/admin/users', { email, password: pass, email_confirm: true });
  made.users.push(u.id);
  return { email, id: u.id };
}
async function tokenFor(email) {
  const r = await fetch(SB + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('password sign-in failed: ' + r.status + ' ' + (j.error_description || j.msg || ''));
  return j.access_token;
}
async function shopApi(token, method, path, body) {
  const r = await fetch(`${SITE}/shop-api/${path}`, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data = text; try { data = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, data };
}

function watch(page, label) {
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${label}] console: ${scrub(m.text())}`); });
  page.on('pageerror', (e) => problems.push(`[${label}] page error: ${scrub(e.message)}`));
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && (u.pathname.startsWith('/shop-api/') || u.pathname.startsWith('/account-api/') || u.pathname.includes('/auth/v1') || u.hostname.endsWith('talkshops.app')))
      problems.push(`[${label}] ${r.request().method()} ${scrub(u.pathname)} → ${r.status()}`);
  });
  page.on('requestfailed', (r) => { if (!/google|youtube|analytics|fonts/.test(r.url())) problems.push(`[${label}] request failed: ${scrub(new URL(r.url()).pathname)} ${r.failure()?.errorText || ''}`); });
}
let shotN = 0;
const shot = (page, name) => page.screenshot({ path: `${OUT}/${String(++shotN).padStart(2, '0')}-${name}.png`, fullPage: true }).catch(() => {});
const toastText = async (page) => (await page.locator('.toast').first().textContent({ timeout: 8000 }).catch(() => '')) || '';
const tab = (page, v) => page.evaluate((v) => { const b = document.querySelector(`.tab[data-view="${v}"]`); if (!b) throw new Error('no tab ' + v); b.click(); }, v);

const jobsNow = async () => { const d = (await shopApi(owner.token, 'GET', 'shop/jobs')).data; return Array.isArray(d) ? d : d?.jobs || []; };
const clickEl = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) throw new Error('not found: ' + sel); el.click(); }, sel);
const browser = await chromium.launch();
let owner, shopId, jobLink;
try {
  // ---------- Public pages ----------
  const pub = await browser.newPage();
  watch(pub, 'public');
  for (const p of ['/', '/demo.html', '/privacy.html', '/terms.html', '/sms-opt-in.png']) {
    await step(`Public page ${p} loads`, async () => {
      const r = await pub.goto(SITE + p, { waitUntil: 'networkidle', timeout: 45000 });
      if (!r || r.status() !== 200) throw new Error('status ' + r?.status());
      if (p === '/') await shot(pub, 'home');
      return String(r.status());
    });
  }
  await step('Talk Shops API health', async () => {
    const r = await fetch(SB + '/functions/v1/api/health');
    const j = await r.json();
    if (!j.ok || j.app !== 'talkshops') throw new Error(JSON.stringify(j));
    return 'ok';
  });

  // ---------- Owner signs in and sets up a shop ----------
  owner = await newUser('owner');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, 'shop');

  await step('Email sign-in', async () => {
    await page.goto(SITE + '/?login', { waitUntil: 'networkidle' });
    await shot(page, 'login');
    await page.fill('#au-email', owner.email);
    await page.fill('#au-pass', pass);
    await page.click('#emailForm button[type=submit]');
    await page.waitForSelector('#setupForm, #myNameForm, .queue-top, .empty-board', { timeout: 30000 });
  });

  await step('Set up shop (name, phone, hours)', async () => {
    for (let i = 0; i < 6; i++) {
      if (await page.locator('#myNameForm').isVisible().catch(() => false)) {
        await page.fill('#myNameIn', 'Eddie Tester'); await page.click('#myNameForm button[type=submit]');
      } else if (await page.locator('#setupForm #sh-name').isVisible().catch(() => false) && !(await page.locator('.settings-wrap').count())) {
        if (!(await page.$eval('#sh-phone', (el) => el.required))) problems.push('shop phone is not required on first setup');
        await page.fill('#sh-name', 'E2E Test Garage'); await page.fill('#sh-phone', phone); await page.fill('#sh-hours', 'Mon–Fri 8am–5pm');
        await shot(page, 'setup');
        await page.click('#setupForm button[type=submit]');
      } else if (await page.locator('.prices-step').isVisible().catch(() => false)) {
        await shot(page, 'prices-step');
        await page.click('.prices-step [data-view="board"]');
      } else if (await page.locator('.queue-top, .empty-board').first().isVisible().catch(() => false)) break;
      await page.waitForTimeout(2500);
    }
    await page.waitForSelector('.queue-top, .empty-board', { timeout: 15000 });
    await shot(page, 'board-empty');
  });
  owner.token = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; return null; });

  await step('Shop and trial saved in the database', async () => {
    const me = await shopApi(owner.token, 'GET', 'shop/me');
    if (me.status !== 200 || !me.data.shop) throw new Error('GET shop/me ' + me.status);
    shopId = (await admin('GET', `/rest/v1/repair_shops?select=id&owner_id=eq.${owner.id}`))?.[0]?.id;
    if (shopId) made.shops.push(shopId);
    made.phones.push('+1' + phoneDigits);
    return `plan ${me.data.plan?.state}, ${me.data.plan?.daysLeft} days left`;
  });

  // ---------- Check in a car ----------
  await step('VIN decode', async () => {
    await tab(page, 'checkin');
    await page.waitForSelector('#checkinForm');
    await page.selectOption('#ci-method', 'staff').catch(() => {});
    await page.fill('#ci-vin', '1HGCM82633A004352');
    await page.click('#ci-vin-go');
    await page.waitForFunction(() => { const t = document.querySelector('#ci-vin-msg')?.textContent.trim(); return t && !/Looking up/i.test(t); }, null, { timeout: 25000 });
    return (await page.textContent('#ci-vin-msg')) + ' · make=' + (await page.inputValue('#ci-make'));
  });

  await step('Check in a car', async () => {
    await page.fill('#ci-name', 'Pat Example');
    await page.selectOption('#ci-channel', 'email');
    await page.waitForTimeout(300);
    await page.fill('#ci-email', 'delivered@resend.dev');
    if (await page.locator('#ci-phone').isVisible()) await page.fill('#ci-phone', '(555) 010-0199');
    if (!(await page.inputValue('#ci-year'))) await page.fill('#ci-year', '2003');
    if (!(await page.inputValue('#ci-make'))) await page.fill('#ci-make', 'Honda');
    if (!(await page.inputValue('#ci-model'))) await page.fill('#ci-model', 'Accord');
    await page.fill('#ci-plate', 'E2E' + rand.slice(0, 3).toUpperCase());
    await page.fill('#ci-concern', 'Brakes squeak when stopping.');
    await page.check('#ci-consent');
    await shot(page, 'checkin');
    await page.click('#checkinForm button[type=submit]');
    await page.waitForSelector('[data-open]', { timeout: 30000 });
    await shot(page, 'board-one-car');
    return await toastText(page);
  });

  // ---------- Work the repair ----------
  await step('Open the repair sheet', async () => {
    await page.waitForTimeout(3500); // let the "Saved" toast clear
    await clickEl(page, '[data-open]');
    await page.waitForSelector('.sheet', { timeout: 15000 });
    jobLink = await page.getAttribute('.sheet a:has-text("Customer Page")', 'href');
    if (!jobLink) throw new Error('no customer link');
  });
  await step('Recall lookup shows on the sheet', async () => {
    await page.waitForTimeout(4000);
    return (await page.locator('.sheet').textContent()).match(/recall[^.]{0,80}/i)?.[0] || 'no recall text';
  });
  await step('Add estimate line', async () => {
    await page.fill('#li-item', 'Front brake pads');
    await page.fill('#li-price', '189.99');
    await page.click('#addLine button[type=submit]');
    await page.waitForSelector('.sheet table.est', { timeout: 15000 });
  });
  await step('Post technician note', async () => {
    await page.fill('#noteIn', 'Pads at 2mm, rotors fine.');
    await page.click('#noteForm button[type=submit]');
    await page.waitForSelector('.sheet ul.notes li', { timeout: 15000 });
  });
  await step('Message customer (email)', async () => {
    await page.fill('#replyIn', 'Hi Pat, we are looking at your brakes now.');
    await page.click('#replyForm button[type=submit]');
    await page.waitForTimeout(8000);
    const j = (await jobsNow())[0];
    const m = j?.messages?.at(-1);
    if (!m) throw new Error('no message saved');
    return `delivery=${m.delivery}${m.note ? ' (' + m.note + ')' : ''}`;
  });
  await step('Send estimate for approval', async () => {
    await clickEl(page, '.sheet .est-send');
    await page.waitForSelector('#sendForm', { timeout: 10000 });
    await page.click('#sendForm button[type=submit]');
    await page.waitForTimeout(9000); // the move waits a few seconds with an Undo
    const j = (await jobsNow())[0];
    if (j?.stage !== 'approval') throw new Error('stage is ' + j?.stage);
    return 'stage=approval';
  });
  await shot(page, 'sheet');

  // ---------- Customer page ----------
  await step('Customer page: approve with signature', async () => {
    const cctx = await browser.newContext(devices['iPhone 13']);
    const c = await cctx.newPage();
    watch(c, 'customer');
    const link = new URL(jobLink, SITE); const here = new URL(SITE); link.protocol = here.protocol; link.host = here.host;
    await c.goto(link.href, { waitUntil: 'networkidle' });
    await shot(c, 'customer-page');
    await c.click('[data-decide][data-v="approved"]');
    await c.fill('#sig', 'Pat Example');
    await c.click('#submitApproval');
    await c.waitForTimeout(4000);
    await c.fill('#custMsg', 'Thanks, go ahead.').catch(() => {});
    await c.click('#custMsgSend').catch(() => {});
    await c.waitForTimeout(3000);
    await shot(c, 'customer-approved');
    await cctx.close();
    const j = (await jobsNow())[0];
    if (!j?.approval) throw new Error('approval not saved');
    return `approved by signature; customer message ${j.messages.some((m) => m.dir === 'in') ? 'saved' : 'missing'}`;
  });

  // ---------- Move through stages ----------
  await step('Move through repair stages', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    const seen = [];
    for (let i = 0; i < 3; i++) {
      if (!(await page.locator('.sheet').count())) await clickEl(page, '[data-open]');
      await page.waitForSelector('.sheet');
      const btn = page.locator('.sheet button.btn.primary[data-stage]').first();
      if (!(await btn.count())) break;
      seen.push((await btn.textContent()).trim());
      await btn.click();
      await page.waitForSelector('#sendForm', { timeout: 10000 });
      await page.uncheck('#m-send').catch(() => {});
      await page.click('#sendForm button[type=submit]');
      await page.waitForTimeout(3000);
      await page.keyboard.press('Escape').catch(() => {});
      await page.locator('.sheet [data-close]').first().click().catch(() => {});
    }
    const j = (await jobsNow())[0];
    return seen.join(' → ') + ` · now ${j?.stage}`;
  });

  // ---------- Every tab ----------
  for (const v of ['board', 'archive', 'howto', 'settings', 'plan', 'training', 'help', 'checkin']) {
    await step(`Tab: ${v}`, async () => {
      await tab(page, v);
      await page.waitForTimeout(2500);
      const err = await page.locator('.form-err').first().textContent({ timeout: 500 }).catch(() => '');
      await shot(page, 'tab-' + v);
      if (err) throw new Error('error on page: ' + err);
    });
  }
  await step('Settings: save hours', async () => {
    await tab(page, 'settings');
    await page.waitForSelector('#setupForm');
    await page.fill('#sh-hours', 'Mon–Sat 8am–6pm');
    await page.click('#setupForm button[type=submit]');
    return await toastText(page);
  });
  await step('Team: invite a technician (test inbox)', async () => {
    await tab(page, 'settings');
    await page.waitForSelector('#teamInviteForm', { timeout: 10000 });
    await page.fill('#tm-email', 'delivered@resend.dev');
    await page.fill('#tm-name', 'Tech Tester').catch(() => {});
    await page.click('#teamInviteForm button[type=submit]');
    await page.waitForSelector('.team-link, #teamPanel .form-err', { timeout: 20000 });
    return (await page.locator('.team-link span').first().textContent().catch(() => '')).replace(/https?:\S+/g, '').slice(0, 90) || (await page.locator('#teamPanel .form-err').first().textContent());
  });
  await step('How-to assistant answers', async () => {
    await tab(page, 'howto');
    await page.waitForSelector('#howtoForm');
    await page.fill('#howtoYear', '2016'); await page.fill('#howtoMake', 'Honda'); await page.fill('#howtoModel', 'Civic');
    await page.fill('#howtoQ', 'Replace the cabin air filter');
    await page.click('#howtoAsk');
    await page.waitForFunction(() => !document.querySelector('#howtoAsk')?.disabled, null, { timeout: 90000 });
    await shot(page, 'howto-answer');
    const err = await page.locator('#howtoForm ~ * .form-err, .howto .form-err').first().textContent({ timeout: 500 }).catch(() => '');
    if (err) throw new Error(err);
  });
  await step('Plan tab: Stripe checkout opens', async () => {
    const r = await shopApi(owner.token, 'POST', 'shop/plan/checkout', { plan: 'pro', interval: 'month' });
    if (r.status !== 200 || !String(r.data?.url).startsWith('https://checkout.stripe.com/')) throw new Error(`${r.status} ${typeof r.data === 'string' ? r.data : JSON.stringify(r.data).slice(0, 150)}`);
    return 'checkout url ok';
  });

  // ---------- API sweep (5xx = broken; 4xx noted) ----------
  const calls = [
    ['GET', 'shop/me'], ['GET', 'shop/plan'], ['GET', 'shop/jobs'], ['GET', 'shop/jobs/board'], ['GET', 'shop/staff'],
    ['GET', 'shop/recovery'], ['GET', 'shop/bookings'],
    ['POST', 'shop/archive', { q: '', days: 30 }], ['POST', 'shop/visits', { q: 'Pat' }], ['POST', 'shop/results', { days: 30 }],
    ['POST', 'shop/export', { days: 30 }], ['POST', 'shop/vehicle-options', { year: '2019', make: 'Tesla' }],
    ['POST', 'shop/recalls', { year: '2019', make: 'Honda', model: 'Civic' }], ['POST', 'shop/vin', { vin: '1HGCM82633A004352' }],
    ['POST', 'shop/price-import', { text: 'Oil change 49.99\nLabor rate 135/hr\nShop supplies 12.50' }],
  ];
  for (const [m, p, b] of calls) {
    await step(`API ${m} ${p}`, async () => {
      const r = await shopApi(owner.token, m, p, b);
      if (r.status >= 500) throw new Error(`${r.status} ${typeof r.data === 'string' ? r.data : JSON.stringify(r.data).slice(0, 150)}`);
      return String(r.status) + (r.status >= 400 ? ' ' + (typeof r.data === 'string' ? r.data : JSON.stringify(r.data)).slice(0, 120) : '');
    });
  }

  // ---------- One free trial per phone ----------
  await step('Second shop with the same phone gets no trial', async () => {
    const u2 = await newUser('dupe');
    const t2 = await tokenFor(u2.email);
    const r = await shopApi(t2, 'POST', 'shop/me', { name: 'E2E Repeat Garage', phone, hours: '' });
    const id2 = (await admin('GET', `/rest/v1/repair_shops?select=id&owner_id=eq.${u2.id}`))?.[0]?.id;
    if (id2) made.shops.push(id2);
    if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
    if (!r.data.trialUsed || r.data.plan?.state !== 'trial_ended') throw new Error(`trialUsed=${r.data.trialUsed} state=${r.data.plan?.state}`);
    return 'trial_ended as expected';
  });

  // ---------- Phone layout ----------
  await step('Phone layout: board and repair sheet', async () => {
    const state = await ctx.storageState();
    const mctx = await browser.newContext({ ...devices['iPhone 13'], storageState: state });
    const m = await mctx.newPage();
    watch(m, 'phone');
    await m.goto(SITE + '/?login', { waitUntil: 'networkidle' });
    await m.waitForSelector('.queue-top, .empty-board, [data-open]', { timeout: 20000 });
    await shot(m, 'phone-board');
    await m.click('.tab-more').catch(() => {});
    await m.waitForTimeout(800);
    await shot(m, 'phone-more');
    await mctx.close();
  });

  await step('Sign out', async () => {
    await tab(page, 'settings');
    await page.waitForSelector('#signOut2', { timeout: 10000 });
    await page.evaluate(() => document.querySelector('#signOut2, #signOut')?.click());
    await page.waitForFunction(() => !document.querySelector('.tab[data-view="board"]')?.offsetParent, null, { timeout: 15000 });
  });
} finally {
  // ---------- Clean up ----------
  for (const id of made.shops) await admin('DELETE', `/rest/v1/repair_shops?id=eq.${encodeURIComponent(id)}`).catch((e) => problems.push('cleanup shop: ' + scrub(e.message)));
  for (const p of made.phones) await admin('DELETE', `/rest/v1/talkshops_trial_phones?phone=eq.${encodeURIComponent(p)}`).catch((e) => problems.push('cleanup phone: ' + scrub(e.message)));
  for (const id of made.users) await admin('DELETE', `/auth/v1/admin/users/${id}`).catch((e) => problems.push('cleanup user: ' + scrub(e.message)));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  const md = [`## Talk Shops end-to-end check`, '', `${results.length - failed.length}/${results.length} steps passed.`, '',
    '| Step | Result | Note |', '|---|---|---|',
    ...results.map((r) => `| ${r.step} | ${r.ok ? '✅' : '❌'} | ${r.note.replace(/\|/g, '/').replace(/\n/g, ' ')} |`),
    '', `### Errors seen in the browser (${problems.length})`, '', ...[...new Set(problems)].slice(0, 80).map((p) => '- ' + p.replace(/\n/g, ' '))].join('\n');
  fs.writeFileSync(`${OUT}/report.md`, md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  console.log('\n' + md);
}
