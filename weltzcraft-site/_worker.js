// weltzcraft.com: serves the static site and takes the project brief form.
// POST /api/brief emails the brief to sales@weltzcraft.com through Resend (RESEND_API_KEY is a Pages secret,
// set by the deploy workflow). With no key set it answers 503 and the page falls back to opening an email.
// /api/merch/* is the merch shop (Stripe Checkout, then a Printful order); see below.
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

// ---- Merch shop -------------------------------------------------------------------------------------------
// POST /api/merch/checkout {items: [{slug, size, qty}], code?} -> Stripe Checkout URL. Prices and Printful ids come only from
// /merch-catalog.json (written by the merch build), never from the browser.
// POST /api/merch/stripe-webhook: Stripe says a merch checkout is paid -> a Printful order for the same items,
// shipped to the buyer, plus an email to sales@. Pages secrets (set by the deploy workflow): STRIPE_SECRET_KEY,
// STRIPE_MERCH_WEBHOOK_SECRET, PRINTFUL_API_TOKEN, optional PRINTFUL_STORE_ID.
const SHIPPING_CENTS = 599;      // first piece
const EXTRA_ITEM_CENTS = 150;    // each extra piece
const SHIPPING_CAP_CENTS = 1499;
const MAX_QTY = 10;
const MAX_LINES = 20;
// Promo codes. FAMILY (or the MERCH_FAMILY_CODE secret) prices every item at what Printful charges us plus
// FAMILY_MARKUP_CENTS, which covers the Stripe fee. Any other code is looked up as a Stripe promotion code
// (made in the Stripe dashboard under Product catalog > Coupons). With no code, Stripe's own promo box shows.
const FAMILY_MARKUP_CENTS = 200;
const familyCode = (env) => String(env.MERCH_FAMILY_CODE || 'FAMILY').trim().toUpperCase();

/** What Printful charges for one of our store variants, in cents (its catalog price for that blank). */
async function printfulCostCents(env, syncVariantId) {
  const sv = await printful(env, '/store/variants/' + syncVariantId);
  const catalogId = sv.ok && sv.out && sv.out.result && (sv.out.result.variant_id || (sv.out.result.product && sv.out.result.product.variant_id));
  if (!catalogId) throw new Error('printful variant ' + syncVariantId);
  const c = await printful(env, '/products/variant/' + catalogId);
  const price = Number(c.ok && c.out && c.out.result && c.out.result.variant && c.out.result.variant.price);
  if (!(price > 0)) throw new Error('printful price ' + catalogId);
  return Math.round(price * 100);
}

async function catalog(request, env) {
  const r = await env.ASSETS.fetch(new Request(new URL('/merch-catalog.json', request.url)));
  if (!r.ok) return null;
  try { return await r.json(); } catch (e) { return null; }
}

async function stripe(env, path, form) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: form ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('stripe ' + r.status + ' ' + (body.error && body.error.message || ''));
  return body;
}

async function merchCheckout(request, env) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { error: 'Wrong site' });
  let b;
  try { b = await request.json(); } catch (e) { return json(400, { error: 'Bad request' }); }
  if (!env.STRIPE_SECRET_KEY) return json(503, { error: 'The shop is not open yet' });
  const cat = await catalog(request, env);
  if (!cat || !cat.items) return json(503, { error: 'The shop is restocking. Try again in a minute.' });
  // A cart is {items: [{slug, size, qty}]}; a single {slug, size, qty} still works.
  const wanted = Array.isArray(b && b.items) ? b.items : [b];
  if (!wanted.length || wanted.length > MAX_LINES) return json(400, { error: 'Your cart can hold up to ' + MAX_LINES + ' different items.' });
  const code = oneLine(b && b.code, 40).toUpperCase();
  const family = !!code && code === familyCode(env);
  let promo = null;
  if (code && !family) {
    const found = await stripe(env, 'promotion_codes?active=true&limit=1&code=' + encodeURIComponent(code)).catch(() => null);
    promo = found && found.data && found.data[0];
    if (!promo) return json(400, { error: 'That promo code isn\'t valid.' });
  }
  if (family && !env.PRINTFUL_API_TOKEN) return json(503, { error: 'Family pricing isn\'t available right now.' });
  const site = new URL(request.url).origin;
  const form = {
    mode: 'payment',
    success_url: site + '/merch?order=thanks',
    cancel_url: site + '/merch?order=cancelled',
  };
  const lines = [];
  let count = 0;
  for (const w of wanted) {
    const slug = String(w && w.slug || '');
    const item = Object.prototype.hasOwnProperty.call(cat.items, slug) ? cat.items[slug] : null;
    if (!item) return json(400, { error: 'One of your items is not available any more. Remove it and try again.' });
    const v = item.variants.length === 1 ? item.variants[0] : item.variants.find((x) => x.size === w.size);
    if (!v) return json(400, { error: 'Pick a size.' });
    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(w.qty) || 1)));
    const [pk, ck, lk] = slug.split('-');
    const prod = cat.products.find((p) => p.key === pk) || { name: pk, colors: [] };
    const color = (prod.colors.find((c) => c.key === ck) || {}).name || ck;
    const logo = (cat.logos[lk] || {}).name || lk;
    const name = prod.name + (v.size && item.variants.length > 1 ? ' (' + v.size + ')' : '');
    const i = lines.length;
    let cents = Math.round(v.price * 100);
    if (family) {
      let cost;
      try { cost = await printfulCostCents(env, v.id); } catch (e) { return json(503, { error: 'Family pricing isn\'t available right now. Try again in a minute.' }); }
      cents = Math.min(cents, cost + FAMILY_MARKUP_CENTS);
    }
    form['line_items[' + i + '][quantity]'] = String(qty);
    form['line_items[' + i + '][price_data][currency]'] = 'usd';
    form['line_items[' + i + '][price_data][unit_amount]'] = String(cents);
    form['line_items[' + i + '][price_data][product_data][name]'] = 'Weltzcraft ' + name + (family ? ' (family price)' : '');
    form['line_items[' + i + '][price_data][product_data][description]'] = color + ' · ' + logo + ' logo';
    form['line_items[' + i + '][price_data][product_data][images][0]'] = site + '/img/merch/' + slug + '.webp';
    lines.push({ id: v.id, qty, label: slug + (v.size && item.variants.length > 1 ? ' ' + v.size : '') + ' x' + qty });
    count += qty;
  }
  if (count > MAX_QTY * 2) return json(400, { error: 'That is a big order! Email hello@weltzcraft.com and we will set it up.' });
  // Flat shipping, plus a little for each extra piece (Printful charges per item too).
  const ship = Math.min(SHIPPING_CENTS + EXTRA_ITEM_CENTS * (count - 1), SHIPPING_CAP_CENTS);
  Object.assign(form, {
    'shipping_address_collection[allowed_countries][0]': 'US',
    'shipping_options[0][shipping_rate_data][type]': 'fixed_amount',
    'shipping_options[0][shipping_rate_data][display_name]': 'Standard shipping',
    'shipping_options[0][shipping_rate_data][fixed_amount][amount]': String(ship),
    'shipping_options[0][shipping_rate_data][fixed_amount][currency]': 'usd',
    'shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]': 'business_day',
    'shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]': '5',
    'shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]': 'business_day',
    'shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]': '10',
    'phone_number_collection[enabled]': 'true',
    'payment_intent_data[description]': ('Weltzcraft merch: ' + lines.map((l) => l.label).join(', ')).slice(0, 1000),
    'metadata[shop]': 'weltzcraft-merch',
    'metadata[slug]': lines.map((l) => l.label).join(', ').slice(0, 500),
    'metadata[items]': lines.map((l) => l.id + 'x' + l.qty).join(','),
  });
  if (family) form['metadata[promo]'] = 'family';
  else if (promo) { form['discounts[0][promotion_code]'] = promo.id; form['metadata[promo]'] = code; }
  else form.allow_promotion_codes = 'true';
  const s = await stripe(env, 'checkout/sessions', form);
  return json(200, { url: s.url });
}

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function stripeSignatureOk(raw, header, secret) {
  const parts = Object.fromEntries((header || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2 && p[0] === 't'));
  const sigs = (header || '').split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 600) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + raw)));
  return sigs.some((s) => s.length === want.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ want.charCodeAt(i)), 0) === 0);
}

async function printful(env, path, body) {
  const r = await fetch('https://api.printful.com' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + env.PRINTFUL_API_TOKEN, 'Content-Type': 'application/json', ...(env.PRINTFUL_STORE_ID ? { 'X-PB-Store-Id': env.PRINTFUL_STORE_ID } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, out };
}

async function emailSales(env, subject, text) {
  if (!env.RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [TO], subject, text }),
  }).catch(() => {});
}


// Buyer emails come from the site (Printful's own customer emails aren't on for API stores).
const SHOP_FROM = 'Weltzcraft Studios <sales@weltzcraft.com>';
async function emailBuyer(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to || '')) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: SHOP_FROM, to: [to], reply_to: 'sales@weltzcraft.com', subject, text }),
  }).catch(() => {});
}
// "tee-black-58 2XL x1, mug-black-55 x2" -> ["Tee, Black, Three-stripe W logo, size 2XL (x1)", ...]
function itemNames(labels, cat) {
  return String(labels || '').split(', ').filter(Boolean).map((l) => {
    const m = l.match(/^(\S+)(?: (\S+))? x(\d+)$/);
    if (!m || !cat) return l;
    const [pk, ck, lk] = m[1].split('-');
    const prod = (cat.products || []).find((p) => p.key === pk);
    if (!prod) return l;
    const color = (prod.colors.find((c) => c.key === ck) || {}).name || ck;
    return prod.name + ', ' + color + ', ' + ((cat.logos[lk] || {}).name || lk) + ' logo' + (m[2] ? ', size ' + m[2] : '') + ' (x' + m[3] + ')';
  });
}
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'there';
const printfulHookKey = async (env) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('wc-printful-hook:' + env.PRINTFUL_API_TOKEN))).slice(0, 32);

async function merchWebhook(request, env) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  if (!env.STRIPE_MERCH_WEBHOOK_SECRET) return json(503, { error: 'Not set up' });
  const raw = await request.text();
  if (!(await stripeSignatureOk(raw, request.headers.get('Stripe-Signature'), env.STRIPE_MERCH_WEBHOOK_SECRET))) return json(400, { error: 'Bad signature' });
  const event = JSON.parse(raw);
  const s = event.data && event.data.object || {};
  if (event.type !== 'checkout.session.completed' || s.mode !== 'payment' || (s.metadata || {}).shop !== 'weltzcraft-merch') return json(200, { ignored: true });
  if (s.payment_status !== 'paid') return json(200, { ignored: 'unpaid' });
  const ship = s.shipping_details || (s.collected_information || {}).shipping_details || {};
  const a = ship.address || {};
  const cust = s.customer_details || {};
  const items = String(s.metadata.items || '').split(',').map((x) => x.split('x').map(Number))
    .filter(([id, q]) => id > 0 && q > 0).map(([id, q]) => ({ sync_variant_id: id, quantity: q }));
  // Printful order ids are short; the Stripe session id hashed keeps a retried webhook from ordering twice.
  const external_id = 'wc' + hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.id))).slice(0, 28);
  const order = {
    external_id,
    shipping: 'STANDARD',
    recipient: {
      name: ship.name || cust.name || '', address1: a.line1 || '', address2: a.line2 || '', city: a.city || '',
      state_code: a.state || '', country_code: a.country || 'US', zip: a.postal_code || '',
      email: cust.email || '', phone: cust.phone || '',
    },
    items,
  };
  const summary = ['Order ' + s.id, 'Paid: $' + ((s.amount_total || 0) / 100).toFixed(2), 'Items: ' + s.metadata.slug + ' (' + s.metadata.items + ')',
    'Ship to: ' + [order.recipient.name, a.line1, a.line2, a.city, a.state, a.postal_code].filter(Boolean).join(', '), 'Buyer: ' + order.recipient.email];
  if (!env.PRINTFUL_API_TOKEN || !items.length) {
    await emailSales(env, 'Merch order needs a hand: ' + s.metadata.slug, summary.concat(['', 'Not sent to Printful (no token or no items). Place it by hand.']).join('\n'));
    return json(200, { ok: true, printful: false });
  }
  const existing = await printful(env, '/orders/@' + external_id);
  if (existing.ok) return json(200, { ok: true, duplicate: true });
  // Stripe rates every payment for fraud. A risky one is saved as a Printful draft (nothing printed or charged)
  // so Tyler can look before it ships: confirm it in Printful, or refund in Stripe and delete the draft.
  let risk = 'unknown';
  try {
    const pi = typeof s.payment_intent === 'string' ? await stripe(env, 'payment_intents/' + s.payment_intent + '?expand[]=latest_charge') : null;
    risk = (pi && pi.latest_charge && pi.latest_charge.outcome && pi.latest_charge.outcome.risk_level) || 'unknown';
  } catch (e) { /* can't read it: treat as normal */ }
  summary.push('Stripe fraud risk: ' + risk);
  if (risk === 'elevated' || risk === 'highest') {
    const d = await printful(env, '/orders', order);
    await emailSales(env, 'REVIEW merch order (fraud risk ' + risk + '): ' + s.metadata.slug, summary.concat(['',
      d.ok ? 'Held as a DRAFT in Printful, nothing printed yet. If it looks real, confirm it in Printful > Orders. If not, refund it in Stripe and delete the draft.'
        : 'Printful refused the draft too. Place it by hand if it looks real.',
      'Stripe payment: https://dashboard.stripe.com/payments/' + s.payment_intent]).join('\n'));
    const names = itemNames(s.metadata.slug, await catalog(request, env));
    await emailBuyer(env, order.recipient.email, 'Your Weltzcraft order is confirmed', ['Hi ' + firstName(order.recipient.name) + ',', '',
      'Thanks for your order! Here is what we are making for you:', '', ...names.map((n) => '  - ' + n), '',
      'We will email you a tracking link as soon as it ships. Questions? Just reply to this email.', '', 'Weltzcraft Studios'].join('\n'));
    return json(200, { ok: true, held: true });
  }
  let r = await printful(env, '/orders?confirm=true', order);
  let note = 'Sent to Printful and confirmed for printing.';
  if (!r.ok) {
    // Most likely no card in Printful billing yet: keep it as a draft so nothing is lost.
    const first = (r.out && (r.out.error && r.out.error.message || r.out.result)) || r.status;
    // If Printful made the order but couldn't charge, it already exists; don't make a second one.
    const made = await printful(env, '/orders/@' + external_id);
    r = made.ok ? made : await printful(env, '/orders', order);
    note = r.ok ? 'Saved in Printful as a DRAFT (confirming failed: ' + first + '). Open Printful > Orders and confirm it.'
      : 'Printful refused the order (' + first + '). Place it by hand.';
  }
  await emailSales(env, (r.ok ? 'Merch order: ' : 'Merch order FAILED: ') + s.metadata.slug, summary.concat(['', note]).join('\n'));
  const names = itemNames(s.metadata.slug, await catalog(request, env));
  await emailBuyer(env, order.recipient.email, 'Your Weltzcraft order is confirmed', ['Hi ' + firstName(order.recipient.name) + ',', '',
    'Thanks for your order! Here is what we are making for you:', '', ...names.map((n) => '  - ' + n), '',
    'Total paid: $' + ((s.amount_total || 0) / 100).toFixed(2),
    'Shipping to: ' + [order.recipient.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', '), '',
    'Each piece is printed just for you, which usually takes 2 to 5 business days. We will email you a tracking link as soon as it ships.', '',
    'Questions? Just reply to this email.', '', 'Weltzcraft Studios', 'https://weltzcraft.com/merch'].join('\n'));
  return r.ok ? json(200, { ok: true }) : json(502, { error: 'Printful refused' });
}

// POST /api/merch/printful-webhook?key=...: Printful says a package shipped -> email the buyer the tracking link.
// The key in the URL is derived from the Printful token (the deploy workflow registers the same URL), and the
// order is read back from Printful, so nothing in the request body is trusted.
async function printfulWebhook(request, env) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  if (!env.PRINTFUL_API_TOKEN) return json(503, { error: 'Not set up' });
  if (new URL(request.url).searchParams.get('key') !== (await printfulHookKey(env))) return json(403, { error: 'Bad key' });
  let b;
  try { b = await request.json(); } catch (e) { return json(400, { error: 'Bad request' }); }
  if (!b || b.type !== 'package_shipped') return json(200, { ignored: true });
  const id = Number(b.data && b.data.order && b.data.order.id);
  if (!id) return json(400, { error: 'No order' });
  const got = await printful(env, '/orders/' + id);
  if (!got.ok) return json(502, { error: 'Could not read the order' });
  const o = got.out.result || {};
  const want = Number(b.data.shipment && b.data.shipment.id);
  const sh = (o.shipments || []).find((x) => x.id === want) || (o.shipments || []).slice(-1)[0] || {};
  if (!sh.tracking_url && !sh.tracking_number) return json(200, { ignored: 'no tracking yet' });
  const r = o.recipient || {};
  await emailBuyer(env, r.email, 'Your Weltzcraft order has shipped', ['Hi ' + firstName(r.name) + ',', '',
    'Good news: your order is on its way.', '',
    'Carrier: ' + [sh.carrier, sh.service].filter(Boolean).join(' '), 'Tracking number: ' + (sh.tracking_number || '-'),
    sh.tracking_url ? 'Track it: ' + sh.tracking_url : '', '',
    'Questions? Just reply to this email.', '', 'Weltzcraft Studios', 'https://weltzcraft.com/merch'].filter((l) => l !== null).join('\n'));
  await emailSales(env, 'Merch shipped: order ' + (o.external_id || id), 'Printful order ' + id + ' shipped to ' + (r.name || '') + '. Tracking: ' + (sh.tracking_url || sh.tracking_number));
  return json(200, { ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/brief') {
      try { return await brief(request, env); } catch (e) { return json(500, { error: 'Something went wrong' }); }
    }
    if (url.pathname === '/api/merch/checkout') {
      try { return await merchCheckout(request, env); } catch (e) { return json(502, { error: 'Checkout is not available right now.' }); }
    }
    if (url.pathname === '/api/merch/printful-webhook') {
      try { return await printfulWebhook(request, env); } catch (e) { return json(500, { error: 'Something went wrong' }); }
    }
    if (url.pathname === '/api/merch/stripe-webhook') {
      try { return await merchWebhook(request, env); } catch (e) { return json(500, { error: 'Something went wrong' }); }
    }
    return env.ASSETS.fetch(request);
  },
};
