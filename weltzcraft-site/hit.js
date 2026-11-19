// First-party click counter. Sends one tiny POST to /api/hit/<event> when a visitor clicks something that
// shows intent (Start a project, build a sample, merch, an app link). No cookies, no ids, nothing personal:
// the daily review counts these requests in Cloudflare's own analytics, and bots rarely click.
(function () {
  function hit(e) {
    try {
      var u = '/api/hit/' + encodeURIComponent(e);
      if (navigator.sendBeacon) navigator.sendBeacon(u);
      else if (window.fetch) fetch(u, { method: 'POST', keepalive: true });
    } catch (x) {}
  }
  window.wcHit = hit;
  function eventFor(el) {
    var t = el.getAttribute('data-track');
    if (t) return t;
    var h = el.getAttribute('href') || '';
    if (/#contact$/.test(h)) return 'start';
    if (/^\/build\b/.test(h)) return 'build_open';
    if (/^\/merch\b/.test(h) && location.pathname.indexOf('/merch') !== 0) return 'merch_open';
    if (/apps\.apple\.com/.test(h)) return 'appstore';
    if (/^\/apps\/[a-z-]+$/.test(h)) return 'app_page';
    if (el.id === 'm-checkout') return 'merch_checkout';
    return '';
  }
  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('a,button') : null;
    if (!el) return;
    var e = eventFor(el);
    if (e) hit(e);
  }, true);
})();
