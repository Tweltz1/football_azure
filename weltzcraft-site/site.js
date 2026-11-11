// Copy-email buttons and the project brief form (posts to /api/brief, see _worker.js; falls back to an email).
(function () {
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy');
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });


  // Motion: scroll reveal, card spotlight, hero icon parallax.
  var root = document.documentElement;
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !calm) {
    root.classList.add('js');
    var io = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.style.setProperty('--d', (n++ * 70) + 'ms');
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
    setTimeout(function () { items.forEach(function (el) { el.classList.add('in'); }); }, 4000); // never leave content hidden
  }
  document.querySelectorAll('.app').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
  var stack = document.getElementById('stack'), hero = document.querySelector('.hero');
  if (stack && hero && !calm && window.matchMedia('(hover: hover)').matches) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      stack.style.transform = 'rotate(-8deg) translate(' + (x * -22) + 'px,' + (y * -18) + 'px)';
    });
    hero.addEventListener('pointerleave', function () { stack.style.transform = ''; });
  }

  var form = document.getElementById('brief');
  if (!form) return;
  var hint = document.getElementById('brief-hint'), opened = Date.now(), busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var f = form.elements, ok = true;
    ['name', 'email', 'idea'].forEach(function (k) {
      var v = f[k].value.trim();
      var bad = !v || (k === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
      f[k].setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad && ok) { f[k].focus(); ok = false; }
    });
    if (!ok) { hint.textContent = 'Add your name, an email we can reply to, and a sentence about the app.'; return; }
    var data = {
      name: f.name.value.trim(), email: f.email.value.trim(), org: f.org.value.trim(), idea: f.idea.value.trim(),
      platform: f.platform.value, timeline: f.timeline.value, website: f.website.value,
      elapsed: Math.round((Date.now() - opened) / 1000)
    };
    // If the site can't send it (offline, server trouble), fall back to the visitor's own email app.
    var byEmail = function () {
      var body = ['Name: ' + data.name, data.org ? 'Business or project: ' + data.org : null,
        'Platform: ' + data.platform, 'Timeline: ' + data.timeline, '', data.idea]
        .filter(function (l) { return l !== null; }).join('\n');
      window.location.href = 'mailto:sales@weltzcraft.com?subject=' + encodeURIComponent('App project: ' + (data.org || data.name)) + '&body=' + encodeURIComponent(body);
      hint.textContent = 'We couldn\u2019t send it from here, so your email app should open with the brief filled in. If it doesn\u2019t, email sales@weltzcraft.com.';
    };
    var btn = form.querySelector('button[type="submit"]');
    busy = true; btn.disabled = true; btn.textContent = 'Sending\u2026';
    var done = function () { busy = false; btn.disabled = false; btn.textContent = 'Send this brief'; };
    if (!window.fetch) { done(); byEmail(); return; }
    fetch('/api/brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) {
        if (r.ok) {
          done(); form.reset(); opened = Date.now();
          hint.textContent = 'Sent. Thanks, ' + data.name.split(' ')[0] + '. We\u2019ll reply to ' + data.email + ', usually within a day.';
        } else if (r.status === 400) {
          return r.json().then(function (j) { done(); hint.textContent = (j && j.error) || 'Check the form and try again.'; });
        } else { done(); byEmail(); }
      })
      .catch(function () { done(); byEmail(); });
  });
})();
