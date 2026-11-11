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
