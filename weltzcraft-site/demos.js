// Interactive bits: theme switch, the demo phone (draft, totes, route) and the price estimator.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- theme ---- */
  var themeBtn = $('theme');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var root = document.documentElement, cur = root.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('wc-theme', next); } catch (e) {}
  });

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
      var high = Math.round(low * 1.4 / 100) * 100;
      var w = 2 + feats.length * 0.75 + (plat.value === 'Both' ? 1 : 0), w1 = Math.round(w), w2 = Math.round(w * 1.4) + (Math.round(w * 1.4) === w1 ? 1 : 0);
      var price = money(low) + ' to ' + (high > 15000 ? '$15,000+' : money(high)), time = 'About ' + w1 + ' to ' + w2 + ' weeks';
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
