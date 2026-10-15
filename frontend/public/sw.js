// Lets hood-league.com open with no internet, for drafts saved to this device (see src/offline/).
// Pages load from the network when it's there and from this cache when it isn't. The site's own files are
// cached; Supabase, Sleeper and other sites never are, so live data is never served stale from here.

const CACHE = 'hood-league-v1';
const SHELL = '/index.html';

// Every file of the current build, so pages not opened yet (and the offline draft engine) work offline too.
async function cacheBuild() {
  const cache = await caches.open(CACHE);
  const response = await fetch('/asset-manifest.json', { cache: 'no-store' });
  if (!response.ok) return;
  const manifest = await response.json();
  const urls = Object.values(manifest.files || {}).filter((url) => typeof url === 'string' && !url.endsWith('.map'));
  const wanted = [...new Set([SHELL, '/manifest.json', '/icon-192.png', ...urls])];
  await Promise.all(wanted.map(async (url) => {
    // Hashed files never change, so only fetch what's missing; the shell is refreshed every time.
    if (url !== SHELL && await cache.match(url)) return;
    try {
      const fresh = await fetch(url, { cache: 'no-store' });
      if (fresh.ok) await cache.put(url, fresh);
    } catch (error) {
      // Offline or one file failed; the next visit tries again.
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheBuild().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'cache-build') event.waitUntil(cacheBuild().catch(() => {}));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js' || url.pathname === '/asset-manifest.json') return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        // A new deploy may have new files; pick them up in the background.
        if (fresh.ok) event.waitUntil(cacheBuild().catch(() => {}));
        return fresh;
      } catch (error) {
        const cached = await caches.match(SHELL);
        return cached || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/static/')) {
    // Build files have a hash in their name, so a cached copy is always right.
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    })());
    return;
  }

  // Icons, the manifest and other small files: network first, cache when offline.
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch (error) {
      const cached = await caches.match(request);
      return cached || Response.error();
    }
  })());
});
