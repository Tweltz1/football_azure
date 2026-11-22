// Built-in features of every Weltzcraft-generated site (free previews and live customer sites):
//   - an online booking calendar (#wc-book) and a contact / quote form (#wc-ask), drawn into the slots sample.js leaves
//   - the maker's Customize panel on a free preview (style, page top, color, sections, booking and form settings)
// sample.js calls wcFeatures.mount(page) after every render. The server side is /api/site/* in _worker.js.
// On a preview the booking and form are a working demo (nothing is saved or sent); on a live site they reach the owner.
(function () {
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var t0 = Date.now();
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hit(e) { if (window.wcHit) window.wcHit(e); }
  function mins(t) { return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); }
  function clock(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2); }
  function clock12(t) { var m = mins(t), h = Math.floor(m / 60); return ((h + 11) % 12 + 1) + (m % 60 ? ':' + ('0' + m % 60).slice(-2) : '') + (h < 12 ? 'am' : 'pm'); }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /** When the business takes bookings. Same rules as bookCfg in _worker.js. */
  function bookCfg(a, F) {
    var h = String(a.h || '');
    var base = /every day/i.test(h) ? { days: [0, 1, 2, 3, 4, 5, 6], open: '09:00', close: '18:00' }
      : /wed to sun/i.test(h) ? { days: [0, 3, 4, 5, 6], open: '09:00', close: '15:00' }
      : /appointment/i.test(h) ? { days: [1, 2, 3, 4, 5, 6], open: '09:00', close: '17:00' }
      : { days: [1, 2, 3, 4, 5], open: '08:00', close: '17:00' };
    return { days: F.days || base.days, open: F.open || base.open, close: F.close || base.close, len: F.len || 30 };
  }
  function localSlots(cfg, day) {
    var d = new Date(day + 'T12:00:00'), out = [], now = new Date();
    if (cfg.days.indexOf(d.getDay()) < 0) return out;
    for (var m = mins(cfg.open); m + cfg.len <= mins(cfg.close); m += cfg.len) out.push(clock(m));
    if (day === ymd(now)) out = out.filter(function (s) { return mins(s) > now.getHours() * 60 + now.getMinutes() + 60; });
    return out;
  }
  function post(path, body) {
    body.elapsed = Math.round((Date.now() - t0) / 1000);
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { j.status = r.status; return j; }); });
  }
  function contactFields(id) {
    return '<label>Your name<input name="name" maxlength="80" autocomplete="name" required></label>' +
      '<div class="two"><label>Phone<input name="phone" type="tel" maxlength="30" autocomplete="tel"></label><label>Email<input name="email" type="email" maxlength="120" autocomplete="email"></label></div>' +
      '<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp" id="' + id + '">';
  }
  function demoNote(p, what) {
    return p.live ? '' : '<p class="demo">👀 This is a preview, so nothing was sent. On the live site ' + what + '</p>';
  }

  // ---- booking ---------------------------------------------------------------------------------------------
  function booking(p) {
    var box = document.getElementById('wc-book');
    if (!box) return;
    var cfg = bookCfg(p.a, p.F), days = [], d = new Date(), pick = { day: '', slot: '' };
    for (var i = 0; i < 45 && days.length < 12; i++) {
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      if (cfg.days.indexOf(x.getDay()) > -1 && (i > 0 || localSlots(cfg, ymd(x)).length)) days.push(x);
    }
    var services = (p.t.items || []).slice(0, 6);
    box.innerHTML = '<div class="sec-h"><p class="eyebrow">Book online</p><h2>' + esc(p.t.bookTitle || 'Pick a time that works for you.') + '</h2><p>' + esc(p.t.bookNote || 'Choose a day and time. We\'ll confirm it right away.') + '</p></div>' +
      '<form class="bk" novalidate><div class="bk-l">' +
        (services.length ? '<p class="bk-h"><b>1</b> What do you need?</p><div class="chips" data-k="service">' + services.map(function (s, i) { return '<button type="button" class="chip' + (i ? '' : ' on') + '" data-v="' + esc(s[0]) + '">' + esc(s[0]) + (s[1] ? ' <small>' + esc(s[1]) + '</small>' : '') + '</button>'; }).join('') + '</div>' : '') +
        '<p class="bk-h"><b>' + (services.length ? 2 : 1) + '</b> Pick a day</p><div class="daystrip">' + days.map(function (x) { return '<button type="button" class="day" data-d="' + ymd(x) + '"><small>' + DAYS[x.getDay()] + '</small><b>' + x.getDate() + '</b><small>' + MONTHS[x.getMonth()] + '</small></button>'; }).join('') + '</div>' +
        '<p class="bk-h"><b>' + (services.length ? 3 : 2) + '</b> Pick a time</p><div class="times" aria-live="polite"><p class="hint">Pick a day to see open times.</p></div>' +
      '</div><div class="bk-r"><p class="bk-h"><b>' + (services.length ? 4 : 3) + '</b> Your details</p>' + contactFields('bk-hp') +
        '<label>Anything we should know? <small>(optional)</small><textarea name="note" maxlength="1500" rows="2"></textarea></label>' +
        '<p class="bk-sum" aria-live="polite"></p><p class="err" role="alert"></p><button class="btn" type="submit">Request this time</button></div></form>';
    var form = box.querySelector('form'), times = box.querySelector('.times'), sum = box.querySelector('.bk-sum'), err = box.querySelector('.err');
    function service() { var on = box.querySelector('.chip.on'); return on ? on.dataset.v : ''; }
    function summary() {
      if (!pick.day || !pick.slot) { sum.textContent = ''; return; }
      var x = new Date(pick.day + 'T12:00:00');
      sum.textContent = (service() ? service() + ' · ' : '') + DAYS[x.getDay()] + ', ' + MONTHS[x.getMonth()] + ' ' + x.getDate() + ' at ' + clock12(pick.slot) + ' (' + cfg.len + ' min)';
    }
    function showTimes(slots, taken) {
      var open = slots.filter(function (s) { return taken.indexOf(s) < 0; });
      times.innerHTML = open.length ? slots.map(function (s) { var gone = taken.indexOf(s) > -1; return '<button type="button" class="time"' + (gone ? ' disabled' : '') + ' data-s="' + s + '">' + clock12(s) + '</button>'; }).join('')
        : '<p class="hint">No open times that day. Try another day.</p>';
    }
    function loadDay(day) {
      pick.day = day; pick.slot = ''; summary();
      [].forEach.call(box.querySelectorAll('.day'), function (b) { b.classList.toggle('on', b.dataset.d === day); });
      var local = localSlots(cfg, day);
      if (!p.live || !p.site) return showTimes(local, []);
      times.innerHTML = '<p class="hint">Checking open times…</p>';
      fetch('/api/site/slots?site=' + encodeURIComponent(p.site) + '&day=' + day).then(function (r) { return r.json(); })
        .then(function (j) { if (pick.day === day) showTimes(j.slots || [], j.taken || []); }, function () { if (pick.day === day) showTimes(local, []); });
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('chip')) { [].forEach.call(b.parentNode.children, function (c) { c.classList.toggle('on', c === b); }); summary(); }
      else if (b.classList.contains('day')) loadDay(b.dataset.d);
      else if (b.classList.contains('time')) { pick.slot = b.dataset.s; [].forEach.call(times.children, function (c) { c.classList.toggle('on', c === b); }); summary(); err.textContent = ''; }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      var f = form.elements, name = f.name.value.trim(), phone = f.phone.value.trim(), email = f.email.value.trim();
      if (!pick.day || !pick.slot) { err.textContent = 'Pick a day and a time first.'; return; }
      if (!name) { err.textContent = 'Add your name.'; f.name.focus(); return; }
      if (!email && phone.replace(/\D/g, '').length < 7) { err.textContent = 'Add a phone number or an email so we can reach you.'; f.phone.focus(); return; }
      var btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Sending…';
      var x = new Date(pick.day + 'T12:00:00'), when = DAYS[x.getDay()] + ', ' + MONTHS[x.getMonth()] + ' ' + x.getDate() + ' at ' + clock12(pick.slot);
      function done(j) {
        hit('book_try');
        box.querySelector('form').outerHTML = '<div class="sent"><div class="tick">✓</div><h3>Request sent for ' + esc(when) + '</h3><p>' + (email ? 'We\'ll email ' + esc(email) + ' as soon as it\'s confirmed.' : 'We\'ll call or text ' + esc(phone) + ' to confirm.') + '</p>' +
          demoNote(p, 'the owner gets this request by email with a one-tap Confirm button and a calendar invite, the time is blocked off for everyone else, and the customer gets a confirmation email.') + '</div>';
      }
      if (!p.site) return setTimeout(function () { done({}); }, 500);
      post('/api/site/book', { site: p.site, day: pick.day, slot: pick.slot, service: service(), name: name, phone: phone, email: email, note: f.note.value, website: f.website.value }).then(function (j) {
        if (j.ok) return done(j);
        btn.disabled = false; btn.textContent = 'Request this time'; err.textContent = j.error || 'Something went wrong. Please try again.';
        if (j.status === 409) loadDay(pick.day);
      }, function () { btn.disabled = false; btn.textContent = 'Request this time'; err.textContent = 'We couldn\'t reach the server. Please try again.'; });
    });
    if (days.length) loadDay(ymd(days[0]));
  }

  // ---- contact / quote form --------------------------------------------------------------------------------
  function askForm(p) {
    var box = document.getElementById('wc-ask');
    if (!box) return;
    var quote = p.F.form === 'quote', qs = quote ? (p.t.quoteQs || []).slice(0, 3) : [];
    box.innerHTML = '<div class="ask"><div class="sec-h"><p class="eyebrow">' + (quote ? 'Free quote' : 'Contact') + '</p><h2>' + (quote ? 'Tell us what you need.' : 'Send us a message.') + '</h2><p>' +
      (quote ? 'Answer a few quick questions and we\'ll get back to you with a price.' : 'Questions, ideas or just want to say hi? We answer every message.') + '</p></div>' +
      '<form class="card" novalidate>' + contactFields('ask-hp') + qs.map(function (q, i) { return '<label>' + esc(q) + '<input name="q' + i + '" maxlength="300"></label>'; }).join('') +
      '<label>' + (quote ? 'Anything else?' : 'Your message') + '<textarea name="note" maxlength="1500" rows="4"></textarea></label><p class="err" role="alert"></p><button class="btn" type="submit">' + (quote ? 'Get my quote' : 'Send message') + '</button></form></div>';
    var form = box.querySelector('form'), err = box.querySelector('.err');
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      var f = form.elements, name = f.name.value.trim(), phone = f.phone.value.trim(), email = f.email.value.trim();
      var qa = qs.map(function (q, i) { return [q, f['q' + i].value.trim()]; }).filter(function (x) { return x[1]; });
      if (!name) { err.textContent = 'Add your name.'; f.name.focus(); return; }
      if (!email && phone.replace(/\D/g, '').length < 7) { err.textContent = 'Add a phone number or an email so we can reach you.'; f.phone.focus(); return; }
      if (!f.note.value.trim() && !qa.length) { err.textContent = 'Tell us a little about what you need.'; return; }
      var btn = form.querySelector('button[type=submit]'), label = btn.textContent; btn.disabled = true; btn.textContent = 'Sending…';
      function done() {
        hit('form_try');
        form.outerHTML = '<div class="card sent"><div class="tick">✓</div><h3>' + (quote ? 'Quote request sent' : 'Message sent') + '</h3><p>Thanks, ' + esc(name.split(/\s+/)[0]) + '. We\'ll get back to you soon.</p>' +
          demoNote(p, 'this lands in the owner\'s email inbox right away, and they can reply straight to the customer.') + '</div>';
      }
      if (!p.site) return setTimeout(done, 500);
      post('/api/site/message', { site: p.site, kind: quote ? 'quote' : 'contact', name: name, phone: phone, email: email, note: f.note.value, qa: qa, website: f.website.value }).then(function (j) {
        if (j.ok) return done();
        btn.disabled = false; btn.textContent = label; err.textContent = j.error || 'Something went wrong. Please try again.';
      }, function () { btn.disabled = false; btn.textContent = label; err.textContent = 'We couldn\'t reach the server. Please try again.'; });
    });
  }

  // ---- the maker's Customize panel (free previews only) ----------------------------------------------------
  var VIBES = [['warm', 'Warm'], ['clean', 'Clean'], ['bold', 'Bold'], ['classic', 'Classic'], ['playful', 'Playful'], ['rugged', 'Rugged']];
  var HEROES = [['photo', 'Big photo'], ['split', 'Side by side'], ['center', 'Centered']];
  var LOOKS = [['cards', 'Cards'], ['menu', 'Price list']];
  var COLORS = ['e0662a', '1f8a55', '2563c9', '7a3fb8', 'c2416b', '2b2925', 'c79a2b', '0e7c86'];
  var SECTIONS = [['list', 'Prices'], ['steps', 'How it works'], ['pics', 'Photos'], ['review', 'Reviews'], ['faq', 'Questions'], ['areas', 'Service area'], ['map', 'Map']];
  var panel = null, saveTimer = null, state = null;
  function keyFor(slug) { try { return localStorage.getItem('wck:' + slug) || ''; } catch (e) { return ''; } }
  function customize(p) {
    var key = p.slug && !p.live && !(window.WC_SITE && window.WC_SITE.id) ? keyFor(p.slug) : '';
    if (!key) { if (panel) { panel.remove(); panel = null; } return; }
    var cfg = bookCfg(p.a, p.F);
    state = { p: p, key: key, pending: state && state.p.slug === p.slug ? state.pending : null };
    function seg(k, opts, cur) { return '<div class="seg" data-k="' + k + '">' + opts.map(function (o) { return '<button type="button" class="' + (o[0] === cur ? 'on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
    var html = '<button type="button" class="cz-open" aria-expanded="false">🎨 Customize</button><div class="cz-box" hidden><div class="cz-top"><b>Make it yours</b><button type="button" class="cz-x" aria-label="Close">×</button></div>' +
      '<p class="cz-l">Style</p>' + seg('vibe', VIBES, p.d.vibe) +
      '<p class="cz-l">Top of the page</p>' + seg('hero', HEROES, p.d.hero) +
      '<p class="cz-l">Prices shown as</p>' + seg('items', LOOKS, p.d.items) +
      '<p class="cz-l">Color</p><div class="cz-colors">' + COLORS.map(function (c) { return '<button type="button" class="' + (c === p.a.c ? 'on' : '') + '" data-c="' + c + '" style="background:#' + c + '" aria-label="Color"></button>'; }).join('') + '<input type="color" value="#' + esc(p.a.c || 'e0662a') + '" aria-label="Any color"></div>' +
      '<p class="cz-l">Sections</p><div class="cz-checks">' + SECTIONS.map(function (s) { return '<label><input type="checkbox" data-s="' + s[0] + '"' + (p.show.indexOf(s[0]) > -1 ? ' checked' : '') + '> ' + s[1] + '</label>'; }).join('') + '</div>' +
      '<p class="cz-l">Built-in features</p><div class="cz-checks"><label><input type="checkbox" data-f="book"' + (p.F.book ? ' checked' : '') + '> Online booking</label></div>' +
      '<div class="cz-row"' + (p.F.book ? '' : ' hidden') + ' data-bookrow><label>Each visit <select data-f="len">' + [15, 30, 45, 60, 90, 120].map(function (m) { return '<option value="' + m + '"' + (m === cfg.len ? ' selected' : '') + '>' + (m < 60 ? m + ' min' : (m / 60) + (m === 60 ? ' hour' : ' hours')) + '</option>'; }).join('') + '</select></label>' +
        '<label>From <input type="time" data-f="open" value="' + cfg.open + '" step="900"></label><label>To <input type="time" data-f="close" value="' + cfg.close + '" step="900"></label>' +
        '<div class="cz-days">' + DAYS.map(function (n, i) { return '<button type="button" data-day="' + i + '" class="' + (cfg.days.indexOf(i) > -1 ? 'on' : '') + '">' + n[0] + '</button>'; }).join('') + '</div></div>' +
      '<p class="cz-l">Form on the site</p>' + seg('form', [['contact', 'Contact'], ['quote', 'Quote request'], ['none', 'None']], p.F.form) +
      '<p class="cz-l">Headline</p><input class="cz-in" data-tag maxlength="80" value="' + esc(p.a.tag || p.t.tag || '') + '">' +
      '<p class="cz-s" aria-live="polite">Changes save to your link automatically.</p></div>';
    var wasOpen = panel && !panel.querySelector('.cz-box').hidden, scroll = panel ? panel.querySelector('.cz-box').scrollTop : 0;
    if (!panel) {
      panel = document.createElement('div'); panel.className = 'cz'; document.body.appendChild(panel);
      panel.addEventListener('click', onClick); panel.addEventListener('change', onChange);
      panel.addEventListener('input', function (e) { if (e.target.type === 'color') change({ c: e.target.value.slice(1) }, true); });
    }
    panel.innerHTML = html;
    if (wasOpen) { panel.querySelector('.cz-box').hidden = false; panel.querySelector('.cz-box').scrollTop = scroll; panel.querySelector('.cz-open').setAttribute('aria-expanded', 'true'); }
  }
  function change(patch, quiet) {
    var p = state.p, a = {};
    Object.keys(p.a).forEach(function (k) { a[k] = p.a[k]; });
    if (patch.d) { a.d = {}; Object.keys(p.a.d || {}).forEach(function (k) { a.d[k] = p.a.d[k]; }); Object.keys(patch.d).forEach(function (k) { a.d[k] = patch.d[k]; }); }
    if (patch.f) { a.f = {}; Object.keys(p.a.f || {}).forEach(function (k) { a.f[k] = p.a.f[k]; }); Object.keys(patch.f).forEach(function (k) { a.f[k] = patch.f[k]; }); }
    ['s', 'c', 'tag'].forEach(function (k) { if (patch[k] !== undefined) a[k] = patch[k]; });
    state.pending = state.pending || {};
    ['d', 'f'].forEach(function (k) { if (patch[k]) { state.pending[k] = state.pending[k] || {}; Object.keys(patch[k]).forEach(function (x) { state.pending[k][x] = patch[k][x]; }); } });
    ['s', 'c', 'tag'].forEach(function (k) { if (patch[k] !== undefined) state.pending[k] = patch[k]; });
    var key = state.key, slug = p.slug, note = panel.querySelector('.cz-s');
    // A color drag or typing fires many times: only repaint what changed and keep the control focused.
    if (quiet) { p.a = a; document.documentElement.style.setProperty('--c', '#' + a.c); }
    else p.rerender(a);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var body = state.pending || {}; state.pending = null; body.key = key;
      var n = panel && panel.querySelector('.cz-s'); if (n) n.textContent = 'Saving…';
      fetch('/api/preview/' + slug, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(function (j) {
        var n2 = panel && panel.querySelector('.cz-s'); if (n2) n2.textContent = j.ok ? '✓ Saved to your link' : (j.error || 'Could not save. Try again.');
      }, function () { var n2 = panel && panel.querySelector('.cz-s'); if (n2) n2.textContent = 'Could not save. Check your connection.'; });
      hit('customize');
    }, 700);
    if (note) note.textContent = 'Saving…';
  }
  function onClick(e) {
    var b = e.target.closest('button'); if (!b) return;
    var box = panel.querySelector('.cz-box');
    if (b.classList.contains('cz-open') || b.classList.contains('cz-x')) { box.hidden = !box.hidden; panel.querySelector('.cz-open').setAttribute('aria-expanded', String(!box.hidden)); return; }
    var seg = b.closest('.seg');
    if (seg) { var k = seg.dataset.k, v = b.dataset.v; return change(k === 'form' ? { f: { form: v } } : { d: (function () { var o = {}; o[k] = v; return o; })() }); }
    if (b.dataset.c) return change({ c: b.dataset.c });
    if (b.dataset.day !== undefined) {
      b.classList.toggle('on');
      var days = [].filter.call(panel.querySelectorAll('.cz-days button'), function (x) { return x.classList.contains('on'); }).map(function (x) { return Number(x.dataset.day); });
      if (!days.length) { b.classList.add('on'); return; }
      return change({ f: { days: days } });
    }
  }
  function onChange(e) {
    var el = e.target;
    if (el.dataset.s) {
      var s = [].filter.call(panel.querySelectorAll('[data-s]'), function (x) { return x.checked; }).map(function (x) { return x.dataset.s; });
      return change({ s: s.join(',') });
    }
    if (el.dataset.f === 'book') return change({ f: { book: el.checked ? 1 : 0 } });
    if (el.dataset.f === 'len') return change({ f: { len: Number(el.value) } });
    if (el.dataset.f === 'open' || el.dataset.f === 'close') {
      var o = panel.querySelector('[data-f=open]').value, c = panel.querySelector('[data-f=close]').value;
      if (o && c && o < c) change({ f: { open: o, close: c } });
      return;
    }
    if (el.type === 'color') return change({ c: el.value.slice(1) });
    if (el.hasAttribute('data-tag')) return change({ tag: el.value.trim() });
  }

  window.wcFeatures = { mount: function (p) { booking(p); askForm(p); customize(p); } };
})();
