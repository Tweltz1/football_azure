// Copy-email buttons and the project brief form (builds an email to hello@weltzcraft.com; no server needed).
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
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form.elements, ok = true;
    ['name', 'idea'].forEach(function (k) {
      var bad = !f[k].value.trim();
      f[k].setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad && ok) { f[k].focus(); ok = false; }
    });
    if (!ok) { document.getElementById('brief-hint').textContent = 'Add your name and a sentence about the app first.'; return; }
    var org = f.org.value.trim();
    var subject = 'App project: ' + (org || f.name.value.trim());
    var body = [
      'Name: ' + f.name.value.trim(),
      org ? 'Business or project: ' + org : '',
      'Platform: ' + f.platform.value,
      'Timeline: ' + f.timeline.value,
      '',
      f.idea.value.trim()
    ].filter(function (l, i) { return l !== '' || i === 4; }).join('\n');
    window.location.href = 'mailto:hello@weltzcraft.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    document.getElementById('brief-hint').textContent = 'Your email app should open now. If it doesn’t, email hello@weltzcraft.com directly.';
  });
})();
