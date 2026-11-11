// Interactive bits: theme switch, the demo phone (draft, totes, route) and the price estimator.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- theme ---- */
  [].forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (themeBtn) { themeBtn.addEventListener('click', function () {
    var root = document.documentElement, cur = root.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('wc-theme', next); } catch (e) {}
  }); });

  /* ---- demo tabs ---- */
  var tabs = [].slice.call(document.querySelectorAll('.demo-tabs [role="tab"]'));
  var active = 'draft';
  function show(name) {
    active = name;
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-demo') === name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $('d-' + t.getAttribute('data-demo')).hidden = !on;
    });
    if (name === 'draft') draft.resume(); else draft.pause();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { show(t.getAttribute('data-demo')); });
    t.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus(); show(n.getAttribute('data-demo'));
    });
  });

  /* ---- draft: outbid the bots (made-up players) ---- */
  var draft = (function () {
    if (!$('d-draft')) return { pause: function () {}, resume: function () {} };
    var pool = [['RB', 'Marcus Hale', 13], ['WR', 'Dee Okafor', 10], ['QB', 'Cole Brannigan', 8], ['TE', 'Theo Varga', 5], ['WR', 'Jalen Pruitt', 9], ['RB', 'Rico Santana', 11], ['K', 'Lars Nyberg', 2]];
    var bots = ['Big Mike', 'Dana', 'Coach K', 'Tasha'];
    var WINDOW = 4000, budget = 60, team = [], idx = -1, price, leader, left, last = 0, running = false, visible = false, sold = false, botAt = 0, raf;
    var bar = $('dr-bar'), btn = $('dr-btn'), log = $('dr-log');
    function paint() {
      $('dr-price').textContent = '$' + price;
      $('dr-who').textContent = leader === 'you' ? 'You have the high bid' : leader ? leader + ' has the high bid' : 'Opening bid';
      $('dr-who').className = leader === 'you' ? 'me' : '';
      $('dr-budget').textContent = '$' + budget + ' left';
      btn.textContent = sold ? 'Next player coming up' : leader === 'you' ? 'You lead at $' + price : 'Bid $' + (price + 1);
      btn.disabled = sold || leader === 'you' || price + 1 > budget;
    }
    function bump() { var p = $('dr-price'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
    function next() {
      idx = (idx + 1) % pool.length; sold = false; price = 1; leader = null; left = WINDOW; botAt = 900 + Math.random() * 900;
      $('dr-pos').textContent = pool[idx][0]; $('dr-name').textContent = pool[idx][1];
      paint();
    }
    function bid(who) {
      price += 1; leader = who; left = WINDOW; botAt = 600 + Math.random() * 1300; bump(); paint();
      if (who !== 'you') log.textContent = who + ' bids $' + price + '. Your move.';
      else log.textContent = 'Nice. Holding at $' + price + '...';
    }
    function sell() {
      sold = true;
      var p = pool[idx];
      if (leader === 'you') {
        budget -= price; team.push(p[0] + ' ' + p[1].split(' ')[1] + ' $' + price);
        log.textContent = 'Sold! ' + p[1] + ' is yours for $' + price + '.';
        var box = $('dr-team'); box.innerHTML = '';
        team.slice(-5).forEach(function (t) { var s = document.createElement('span'); s.textContent = t; box.appendChild(s); });
      } else {
        log.textContent = p[1] + ' goes to ' + (leader || bots[0]) + ' for $' + price + '.';
      }
      paint();
      setTimeout(function () { if (running) next(); else pendingNext = true; }, 1700);
    }
    var pendingNext = false;
    function tick(now) {
      if (!running) return;
      var dt = Math.min(now - last, 100); last = now;
      if (!sold) {
        left -= dt; botAt -= dt;
        var worth = pool[idx][2] * (leader === 'you' ? 1 : 0.8);
        if (botAt <= 0 && price < worth && left > 500) {
          var others = bots.filter(function (b) { return b !== leader; });
          bid(others[Math.floor(Math.random() * others.length)]);
        }
        bar.style.transform = 'scaleX(' + Math.max(left / WINDOW, 0) + ')';
        if (left <= 0) sell();
      }
      raf = requestAnimationFrame(tick);
    }
    function start() {
      if (running || !visible || active !== 'draft' || document.hidden) return;
      running = true; last = performance.now();
      if (pendingNext) { pendingNext = false; next(); }
      raf = requestAnimationFrame(tick);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }
    btn.addEventListener('click', function () { if (!sold && leader !== 'you' && price + 1 <= budget) bid('you'); });
    next();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; visible ? start() : stop(); }, { threshold: 0.3 }).observe($('d-draft').closest('.phone'));
    } else { visible = true; start(); }
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    return { pause: stop, resume: start };
  })();

  /* ---- totes: search every bin ---- */
  (function () {
    var list = $('tt-list'), q = $('tt-q');
    if (!list) return;
    var totes = [
      ['Camping', 'Garage, shelf 2', '#dff3e6', '⛺', ['Tent stakes', 'Rain fly', 'Camp stove', 'Headlamps', 'Sleeping pads']],
      ['Holiday', 'Attic', '#fde4e1', '🎄', ['String lights', 'Tree topper', 'Stockings', 'Wreath hooks']],
      ['Kids outgrown', 'Basement', '#e6e4fb', '🧸', ['Rain boots size 9', 'Winter coat 3T', 'Board books']],
      ['Tools', 'Garage, floor', '#fdeccf', '🧰', ['Extension cord', 'Work lights', 'Zip ties', 'Tent repair kit']]
    ];
    function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function row(t, title, sub) {
      return '<div class="tt-row"><span class="tt-dot" style="background:' + t[2] + '">' + t[3] + '</span><span><b>' + title + '</b><small>' + sub + '</small></span></div>';
    }
    function render() {
      var term = q.value.trim().toLowerCase(), html = '', n = 0;
      if (!term) {
        totes.forEach(function (t) { html += row(t, esc(t[0]), esc(t[1]) + ' · ' + t[4].length + ' items'); });
        $('tt-count').textContent = totes.length + ' totes';
      } else {
        totes.forEach(function (t) {
          t[4].forEach(function (item) {
            var i = item.toLowerCase().indexOf(term);
            if (i < 0) return;
            n++;
            var m = esc(item.slice(0, i)) + '<mark>' + esc(item.slice(i, i + term.length)) + '</mark>' + esc(item.slice(i + term.length));
            html += row(t, m, 'In ' + esc(t[0]) + ' · ' + esc(t[1]));
          });
        });
        $('tt-count').textContent = n + (n === 1 ? ' match' : ' matches');
        if (!n) html = '<p class="tt-none">Nothing in any tote matches that. Try "tent", "lights" or "boots".</p>';
      }
      list.innerHTML = html;
    }
    q.addEventListener('input', render);
    render();
  })();

  /* ---- website: answer questions in the phone, watch it build ---- */
  var site = (function () {
    var ws = $('ws');
    if (!ws) return { reset: function () {} };
    var TYPES = {
      coffee: { label: 'Coffee shop', noun: 'coffee shop', icon: '☕', name: 'Maple Street Coffee', tag: 'Fresh coffee, made by neighbors.', list: 'Menu',
        items: [['Drip coffee', '$3'], ['Oat milk latte', '$5'], ['Breakfast burrito', '$8']], pics: ['☕', '🥐', '🧁'], review: 'Best latte in town, and they remember your name.' },
      barber: { label: 'Barber', noun: 'barbershop', icon: '💈', name: 'Main Street Barbers', tag: 'Sharp cuts, no long waits.', list: 'Services',
        items: [['Haircut', '$25'], ['Beard trim', '$15'], ['Kids cut', '$18']], pics: ['💈', '✂️', '🪒'], review: 'Booked online in ten seconds. Cleanest fade I have had.' },
      auto: { label: 'Auto repair', noun: 'auto repair shop', icon: '🔧', name: 'Riverside Auto', tag: 'Honest repairs, explained in plain English.', list: 'Services',
        items: [['Oil change', '$49'], ['Brake check', 'Free'], ['Check engine light', '$89']], pics: ['🚗', '🔧', '🛞'], review: 'They texted me photos of the problem before fixing anything.' },
      lawn: { label: 'Landscaping', noun: 'landscaping business', icon: '🌿', name: 'Greenline Lawn Care', tag: 'A yard you are proud of, every week.', list: 'Services',
        items: [['Weekly mowing', 'from $35'], ['Spring cleanup', '$150'], ['Mulch and beds', 'Quote']], pics: ['🌿', '🌷', '🌳'], review: 'On time every week, and the yard has never looked better.' },
      bakery: { label: 'Bakery', noun: 'bakery', icon: '🥐', name: 'Sunrise Bakery', tag: 'Baked from scratch before sunrise.', list: 'Menu',
        items: [['Sourdough loaf', '$8'], ['Custom cakes', 'from $45'], ['Cookie dozen', '$18']], pics: ['🥐', '🎂', '🍪'], review: 'The birthday cake was gone in five minutes. Ordering again.' },
      fitness: { label: 'Fitness studio', noun: 'fitness studio', icon: '🏋️', name: 'Ironwood Fitness', tag: 'Small classes, real coaching.', list: 'Classes',
        items: [['Drop-in class', '$15'], ['Monthly unlimited', '$89'], ['Personal training', '$60']], pics: ['🏋️', '🧘', '🚴'], review: 'Coaches know everyone by name. Best gym I have joined.' },
      boutique: { label: 'Boutique', noun: 'boutique', icon: '👗', name: 'Willow & Thread', tag: 'Hand-picked styles you won\'t see everywhere.', list: 'New arrivals',
        items: [['Linen sundress', '$58'], ['Denim jacket', '$74'], ['Gold hoop earrings', '$22']], pics: ['👗', '👜', '👡'], review: 'Every time I wear something from here, someone asks where it is from.' },
      running: { label: 'Running store', noun: 'running store', icon: '👟', name: 'Mile Marker Running', tag: 'Shoes fitted by runners, for runners.', list: 'Shop',
        items: [['Free gait analysis', 'Free'], ['Daily trainers', 'from $130'], ['Thursday group run', 'Free']], pics: ['👟', '🏃', '🏅'], review: 'They watched me run and found the first shoe that did not hurt my knees.' }
    };
    var COLORS = [['Ember', '#e0662a'], ['Forest', '#1f8a55'], ['Ocean', '#2563c9'], ['Plum', '#7a3fb8'], ['Charcoal', '#2b2925']];
    var Q = [
      { k: 'type', q: 'What kind of business is it?', type: 'pick', opts: Object.keys(TYPES).map(function (k) { return [k, TYPES[k].icon + ' ' + TYPES[k].label]; }) },
      { k: 'name', q: 'What is it called?', type: 'text', ph: function (a) { return TYPES[a.type].name; } },
      { k: 'town', q: 'Where are you located?', type: 'text', ph: function () { return 'Springfield'; } },
      { k: 'tag', q: 'What makes you different?', type: 'text', ph: function (a) { return TYPES[a.type].tag.replace(/\.$/, ''); }, skip: true },
      { k: 'cta', q: 'What should customers do first?', type: 'pick', opts: [['Book online', '📅 Book online'], ['Order ahead', '🛍️ Order ahead'], ['Shop online', '🛒 Shop online'], ['Get a quote', '💬 Get a quote'], ['Call us', '📞 Call us']] },
      { k: 'hours', q: 'When are you open?', type: 'pick', opts: [['Mon to Fri, 8am to 5pm', 'Weekdays'], ['Every day, 7am to 7pm', 'Every day'], ['Wed to Sun, 9am to 3pm', 'Wed to Sun'], ['By appointment', 'By appointment']] },
      { k: 'show', q: 'What should your site show?', type: 'multi', opts: [['list', 'Prices'], ['pics', 'Photos'], ['review', 'Reviews'], ['map', 'Map']] },
      { k: 'color', q: 'Pick your color', type: 'color' }
    ];
    var a, step;
    var LINES = ['Building your website…', 'Coding the homepage…', 'Mixing your colors…', 'Adding your {list}…', 'Making it fast on phones…', 'Polishing every pixel…', 'Publishing to the web…'];
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    var timers = [];
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      a = { type: 'coffee', name: '', town: '', tag: '', cta: 'Book online', hours: 'Mon to Fri, 8am to 5pm', show: ['list', 'review', 'map'], color: COLORS[0][1] };
      step = -1; intro();
    }
    function intro() {
      ws.className = 'ws ws-q';
      ws.innerHTML = '<div class="wq"><span class="wq-w">W</span><h4>Your website in 8 questions</h4><p>Answer a few quick questions and watch Weltzcraft build a site for your business.</p><button type="button" class="wq-go" data-go="1">Let\'s go</button></div>';
    }
    function ask() {
      var q = Q[step], h = '<div class="wq"><div class="wq-bar"><i style="width:' + Math.round(step / Q.length * 100) + '%"></i></div><small class="wq-n">Question ' + (step + 1) + ' of ' + Q.length + '</small><h4>' + q.q + '</h4>';
      if (q.type === 'pick') h += '<div class="wq-opts">' + q.opts.map(function (o) { return '<button type="button" class="wq-opt' + (a[q.k] === o[0] ? ' on' : '') + '" data-v="' + esc(o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
      if (q.type === 'multi') h += '<div class="wq-opts">' + q.opts.map(function (o) { return '<button type="button" class="wq-opt' + (a.show.indexOf(o[0]) > -1 ? ' on' : '') + '" data-m="' + o[0] + '" aria-pressed="' + (a.show.indexOf(o[0]) > -1) + '">' + o[1] + '</button>'; }).join('') + '</div><button type="button" class="wq-go" data-go="1">Next</button>';
      if (q.type === 'text') h += '<input class="wq-in" maxlength="40" value="' + esc(a[q.k]) + '" placeholder="' + esc(q.ph(a)) + '" aria-label="' + esc(q.q) + '"><button type="button" class="wq-go" data-go="1">' + (q.skip ? 'Next (or skip)' : 'Next') + '</button>';
      if (q.type === 'color') h += '<div class="wq-colors">' + COLORS.map(function (c) { return '<button type="button" class="wq-c' + (a.color === c[1] ? ' on' : '') + '" data-c="' + c[1] + '" style="background:' + c[1] + '" aria-label="' + c[0] + '"></button>'; }).join('') + '</div><button type="button" class="wq-go wq-build" data-go="1">Build my website</button>';
      if (step > 0) h += '<button type="button" class="wq-back" data-back="1">← Back</button>';
      ws.innerHTML = h + '</div>';
      var inp = ws.querySelector('.wq-in');
      if (inp && window.matchMedia('(hover:hover)').matches) inp.focus({ preventScroll: true });
    }
    function next() {
      var inp = ws.querySelector('.wq-in');
      if (inp) a[Q[step].k] = inp.value.trim();
      step++;
      if (step < Q.length) ask(); else build();
    }
    function siteUrl(intro) {
      var q = { t: a.type, n: a.name, town: a.town, tag: a.tag, cta: a.cta, h: a.hours, s: a.show.join(','), c: a.color.slice(1) };
      return '/sample?' + Object.keys(q).filter(function (k) { return q[k]; }).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&') + (intro ? '' : '&intro=0');
    }
    function build() {
      var t = TYPES[a.type];
      try { window.open(siteUrl(true), '_blank'); } catch (e) {}
      ws.className = 'ws ws-build';
      ws.innerHTML = '<div class="wb-scene"><span class="wb-w">W</span><div class="wb-log" aria-live="polite"></div><div class="wb-prog"><i></i></div><p class="wb-power">Welcome to the power of the W</p></div>';
      var log = ws.querySelector('.wb-log'), bar = ws.querySelector('.wb-prog i'), per = calm ? 120 : 520;
      LINES.forEach(function (line, i) {
        later(function () {
          var p = document.createElement('p');
          p.innerHTML = '<b>›</b> ' + esc(line.replace('{list}', t.list.toLowerCase()));
          log.appendChild(p);
          [].forEach.call(log.children, function (c, j) { c.className = j < log.children.length - 1 ? 'done' : ''; });
          bar.style.width = Math.round((i + 1) / LINES.length * 100) + '%';
        }, i * per);
      });
      later(function () { ws.classList.add('ws-power'); }, LINES.length * per + 150);
      later(render, LINES.length * per + (calm ? 600 : 2300));
    }
    function render() {
      var t = TYPES[a.type], name = a.name || t.name, town = a.town || 'Springfield', tag = a.tag || t.tag;
      var initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
      var on = function (k) { return a.show.indexOf(k) > -1; };
      ws.className = 'ws ws-site';
      ws.style.setProperty('--wc', a.color);
      ws.innerHTML =
        '<div class="ws-nav"><span class="ws-logo">' + esc(initials) + '</span><b>' + esc(name) + '</b><button type="button" class="ws-redo" data-redo="1">↺ Start over</button></div>' +
        '<div class="ws-hero"><span class="ws-emoji" aria-hidden="true">' + t.icon + '</span><h4>' + esc(name) + '</h4><p>' + esc(tag) + '</p><span class="ws-cta">' + esc(a.cta) + '</span></div>' +
        (on('list') ? '<div class="ws-sec"><h5>' + t.list + '</h5>' + t.items.map(function (it) { return '<div class="ws-row"><span>' + it[0] + '</span><b>' + it[1] + '</b></div>'; }).join('') + '</div>' : '') +
        (on('pics') ? '<div class="ws-sec"><h5>Photos</h5><div class="ws-pics">' + t.pics.map(function (p) { return '<span>' + p + '</span>'; }).join('') + '</div></div>' : '') +
        '<div class="ws-sec ws-info"><h5>Visit us</h5><p>📍 ' + esc(town) + '</p><p>🕘 ' + esc(a.hours) + '</p>' + (on('map') ? '<div class="ws-map" aria-hidden="true"><i></i></div>' : '') + '</div>' +
        (on('review') ? '<div class="ws-sec ws-review"><p>“' + t.review + '”</p><small>★★★★★ Google review</small></div>' : '') +
        '<div class="ws-end"><a class="wq-go ws-open" href="' + siteUrl(false) + '" target="_blank" rel="noopener">Open the full site ↗</a><button type="button" class="wq-go ws-want" data-want="1">I want this site</button><small>Starter sites from $500</small></div>' +
        '<p class="ws-foot">© ' + esc(name) + ' · Site by Weltzcraft</p>';
      ws.scrollTop = 0;
    }
    function want() {
      var f = $('brief'), t = TYPES[a.type];
      if (!f) return;
      var sel = f.elements.platform;
      [].slice.call(sel.options).forEach(function (o, i) { if (o.text === 'Website') sel.selectedIndex = i; });
      if (f.elements.org && !f.elements.org.value) f.elements.org.value = a.name || t.name;
      var note = 'Website for my ' + t.noun + ' in ' + (a.town || 'my town') + '.\n\n';
      f.elements.idea.value = note + f.elements.idea.value.replace(/^Website for my[\s\S]*?\n\n/, '');
      $('contact').scrollIntoView({ behavior: calm ? 'auto' : 'smooth' });
      setTimeout(function () { f.elements.name.focus({ preventScroll: true }); }, 600);
    }
    ws.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var q = Q[step];
      if (b.dataset.v !== undefined) { a[q.k] = b.dataset.v; if (q.k === 'type') a.cta = { coffee: 'Order ahead', bakery: 'Order ahead', barber: 'Book online', fitness: 'Book online', auto: 'Get a quote', lawn: 'Get a quote', boutique: 'Shop online', running: 'Book a fitting' }[b.dataset.v]; next(); }
      else if (b.dataset.m) { var i = a.show.indexOf(b.dataset.m); if (i > -1) a.show.splice(i, 1); else a.show.push(b.dataset.m); b.classList.toggle('on'); b.setAttribute('aria-pressed', i < 0); }
      else if (b.dataset.c) { a.color = b.dataset.c; [].forEach.call(ws.querySelectorAll('.wq-c'), function (c) { c.classList.toggle('on', c === b); }); }
      else if (b.dataset.go) next();
      else if (b.dataset.back) { var inp = ws.querySelector('.wq-in'); if (inp) a[q.k] = inp.value.trim(); step--; ask(); }
      else if (b.dataset.redo) reset();
      else if (b.dataset.want) want();
    });
    ws.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.classList.contains('wq-in')) { e.preventDefault(); next(); } });
    reset();
    var P = new URLSearchParams(location.search);
    if (P.get('site') && TYPES[P.get('site')]) {
      a.type = P.get('site'); a.name = P.get('sn') || ''; a.town = P.get('st') || '';
      setTimeout(want, 300);
    }
    return { reset: reset };
  })();

  /* ---- route: shortest walk through a store ---- */
  (function () {
    var svg = $('rt-map'), ol = $('rt-list'), btn = $('rt-btn');
    if (!svg) return;
    var NS = 'http://www.w3.org/2000/svg';
    var ax = [40, 80, 120, 160, 200], TOP = 26, BOT = 112, DOOR = [20, 138];
    // name, aisle index, y position in the aisle, aisle label
    var items = [['Ice cream', 4, 40, 'Frozen'], ['Bananas', 0, 96, 'Produce'], ['Pasta', 2, 60, 'Aisle 3'], ['Milk', 4, 92, 'Dairy'], ['Coffee', 1, 44, 'Aisle 2'], ['Apples', 0, 52, 'Produce'], ['Cereal', 3, 84, 'Aisle 4']];
    var planned = false;
    function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
    // Walk between two shelf spots: along the aisle to the nearer cross-walk, across, then down the next aisle.
    function leg(a, b) {
      if (a[0] === b[0]) return [[b[0], b[1]]];
      var viaTop = (a[1] - TOP) + (b[1] - TOP), viaBot = (BOT - a[1]) + (BOT - b[1]);
      var y = viaTop <= viaBot ? TOP : BOT;
      return [[a[0], y], [b[0], y], [b[0], b[1]]];
    }
    function path(order) {
      var pts = [DOOR, [ax[0], DOOR[1]]], cur = [ax[0], BOT];
      pts.push(cur);
      order.forEach(function (it) { var t = [ax[it[1]], it[2]]; leg(cur, t).forEach(function (p) { pts.push(p); }); cur = t; });
      leg(cur, [ax[4], BOT]).forEach(function (p) { pts.push(p); });
      pts.push([220, DOOR[1]]);
      var len = 0;
      for (var i = 1; i < pts.length; i++) len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
      return { pts: pts, len: len };
    }
    // Snake up one aisle and down the next, with the cold case (last aisle) saved for the end.
    function best() {
      var o = items.slice().sort(function (a, b) {
        if (a[1] !== b[1]) return a[1] - b[1];
        return a[1] % 2 === 0 ? b[2] - a[2] : a[2] - b[2];
      });
      return o;
    }
    var feet = function (len) { return Math.round(len * 1.1 / 5) * 5; };
    function draw(order, color, animate) {
      svg.innerHTML = '';
      ax.forEach(function (x, i) {
        svg.appendChild(el('rect', { x: x - 9, y: TOP + 6, width: 18, height: BOT - TOP - 12, rx: 5, fill: i === 4 ? '#d9ecfb' : i === 0 ? '#dff3e6' : '#efe9dc' }));
      });
      var t = el('text', { x: 20, y: 147, 'font-size': 8, fill: '#6b655a', 'font-family': 'Inter,sans-serif' }); t.textContent = 'In'; svg.appendChild(t);
      t = el('text', { x: 212, y: 147, 'font-size': 8, fill: '#6b655a', 'font-family': 'Inter,sans-serif' }); t.textContent = 'Pay'; svg.appendChild(t);
      var p = path(order);
      var line = el('polyline', { points: p.pts.map(function (q) { return q.join(','); }).join(' '), 'class': 'rt-path', stroke: color });
      svg.appendChild(line);
      if (animate && !calm && line.getTotalLength) {
        var L = line.getTotalLength();
        line.style.strokeDasharray = L; line.style.strokeDashoffset = L;
        line.getBoundingClientRect();
        line.style.transition = 'stroke-dashoffset 1.6s ease-in-out'; line.style.strokeDashoffset = 0;
      }
      order.forEach(function (it, i) {
        svg.appendChild(el('circle', { cx: ax[it[1]], cy: it[2], r: 7, fill: color }));
        var n = el('text', { x: ax[it[1]], y: it[2] + 3, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 700, fill: '#fff', 'font-family': 'Inter,sans-serif' });
        n.textContent = i + 1; svg.appendChild(n);
      });
      ol.innerHTML = '';
      order.forEach(function (it, i) {
        var li = document.createElement('li');
        li.style.animationDelay = (animate ? i * 70 : 0) + 'ms';
        li.innerHTML = '<i>' + (i + 1) + '</i>' + it[0] + '<small>' + it[3] + '</small>';
        ol.appendChild(li);
      });
      return p.len;
    }
    function reset() {
      planned = false;
      var len = draw(items, '#c9543a', false);
      $('rt-dist').textContent = 'List order: ' + feet(len) + ' ft';
      btn.textContent = 'Plan my route';
    }
    btn.addEventListener('click', function () {
      if (planned) return reset();
      planned = true;
      var before = path(items).len, after = draw(best(), '#1fa55a', true);
      $('rt-dist').textContent = feet(after) + ' ft · ' + Math.round((1 - after / before) * 100) + '% shorter';
      btn.textContent = 'Shuffle back';
    });
    reset();
  })();

  /* ---- estimator ---- */
  (function () {
    var box = $('est');
    if (!box) return;
    var money = function (n) { return '$' + n.toLocaleString('en-US'); };
    function calc() {
      var plat = box.querySelector('input[name="est-plat"]:checked');
      var feats = [].slice.call(box.querySelectorAll('.chips input:checked'));
      var low = +plat.getAttribute('data-p');
      feats.forEach(function (f) { low += +f.getAttribute('data-p'); });
      var high = Math.round(low * 1.4 / 100) * 100, base = +plat.getAttribute('data-w');
      var w = base + feats.length * 0.75, w1 = Math.round(w), w2 = Math.round(w * 1.4) + (Math.round(w * 1.4) === w1 ? 1 : 0);
      var price = money(low) + ' to ' + money(high), time = 'About ' + w1 + ' to ' + w2 + ' weeks';
      $('est-price').textContent = price; $('est-time').textContent = time;
      return { plat: plat.value, feats: feats.map(function (f) { return f.value; }), price: price, time: time };
    }
    box.addEventListener('change', calc);
    $('est-use').addEventListener('click', function () {
      var r = calc(), form = $('brief');
      if (!form) return;
      var sel = form.elements.platform;
      [].slice.call(sel.options).forEach(function (o, i) { if (o.text === r.plat) sel.selectedIndex = i; });
      var note = 'Features I need: ' + (r.feats.length ? r.feats.join(', ') : 'not sure yet') + '.\nSite estimate: ' + r.price + ', ' + r.time.toLowerCase() + '.\n\n';
      var idea = form.elements.idea;
      idea.value = note + idea.value.replace(/^Features I need:[\s\S]*?\n\n/, '');
      $('contact').scrollIntoView({ behavior: calm ? 'auto' : 'smooth' });
      setTimeout(function () { form.elements.name.focus({ preventScroll: true }); }, 600);
    });
    calc();
  })();
})();
