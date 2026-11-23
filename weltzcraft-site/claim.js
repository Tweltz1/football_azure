// "Claim this site": the business an outreach sample was made for enters its email and gets its own edit link.
// Loaded by sample.js only when the "Claim this site" button is tapped.
(function () {
  var C = window.WC_CLAIM; if (!C) return;
  var css = document.createElement('style');
  css.textContent = '.clm{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:16px;background:rgba(10,8,6,.6)}' +
    '.clm-b{width:100%;max-width:440px;background:var(--bg,#fff);color:var(--ink,#1b1712);border:1px solid var(--line,#ddd);border-radius:18px;padding:24px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35);font:16px/1.5 var(--fb,system-ui,sans-serif)}' +
    '.clm-b h2{margin:0 0 6px;font:700 22px/1.25 var(--fd,system-ui,sans-serif)}' +
    '.clm-b p{margin:0 0 14px;opacity:.85}' +
    '.clm-b label{display:block;font-weight:600;font-size:14px;margin-bottom:6px}' +
    '.clm-b input[type=email]{width:100%;box-sizing:border-box;font:inherit;padding:12px 14px;border-radius:12px;border:1px solid var(--line,#ccc);background:transparent;color:inherit}' +
    '.clm-b .row{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}' +
    '.clm-b button{font:700 15px var(--fb,system-ui,sans-serif);padding:12px 18px;border-radius:999px;border:0;cursor:pointer}' +
    '.clm-b .go{background:linear-gradient(135deg,#ff8a3c,#ffc061);color:#12100c;flex:1}' +
    '.clm-b .no{background:none;color:inherit;border:1px solid var(--line,#ccc)}' +
    '.clm-b .err{color:#c0392b;font-size:14px;margin:10px 0 0}' +
    '.clm-b .hp{position:absolute;left:-9999px}' +
    '.clm-b small{display:block;margin-top:12px;opacity:.65;font-size:12.5px}';
  document.head.appendChild(css);
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  window.wcClaimOpen = function () {
    var w = document.createElement('div'); w.className = 'clm'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-labelledby', 'clm-h');
    w.innerHTML = '<form class="clm-b" novalidate><h2 id="clm-h">Claim ' + esc(C.name || 'this site') + '</h2>' +
      '<p>This sample website is free to keep and edit. Enter your email and we\'ll send you your own link to change the words, photos and colors.</p>' +
      '<label for="clm-e">Your email</label><input id="clm-e" type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com">' +
      '<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="err" hidden></p><div class="row"><button class="go" type="submit">Send my link</button><button class="no" type="button">Not now</button></div>' +
      '<small>No payment needed. We only use your email for this site. Putting it on your own web address is optional, from $500.</small></form>';
    document.body.appendChild(w);
    var f = w.querySelector('form'), inp = w.querySelector('#clm-e'), err = w.querySelector('.err'), go = w.querySelector('.go');
    function close() { w.remove(); document.removeEventListener('keydown', key); }
    function key(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', key);
    w.addEventListener('click', function (e) { if (e.target === w) close(); });
    w.querySelector('.no').addEventListener('click', close);
    setTimeout(function () { inp.focus(); }, 30);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = inp.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { err.textContent = 'That email doesn\'t look right. Check it and try again.'; err.hidden = false; inp.focus(); return; }
      go.disabled = true; go.textContent = 'Sending…'; err.hidden = true;
      fetch('/api/preview/' + C.slug + '/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, website: f.website.value }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) { err.textContent = x.j.error || 'Something went wrong. Try again in a minute.'; err.hidden = false; go.disabled = false; go.textContent = 'Send my link'; return; }
          if (window.wcHit) window.wcHit('claim_done');
          f.innerHTML = '<h2 id="clm-h">Check your email</h2><p>We sent your link to <b>' + esc(x.j.email) + '</b>. Open it on any phone or computer and tap "Edit page" to make this site your own.</p>' +
            '<p>Don\'t see it in a few minutes? Check your spam folder, or email sales@weltzcraft.com.</p><div class="row"><button class="go" type="button">Done</button></div>';
          f.querySelector('.go').addEventListener('click', close);
          var b = document.getElementById('claim'); if (b) b.remove();
        }, function () { err.textContent = 'We couldn\'t reach the site. Try again in a minute.'; err.hidden = false; go.disabled = false; go.textContent = 'Send my link'; });
    });
  };
})();
