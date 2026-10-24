// Lets hood-league.com open with no internet, for drafts saved to this device (see src/offline/).
// Pages load from the network when it's there and from this cache when it isn't. The site's own files are
// cached; Supabase, Sleeper and other sites never are, so live data is never served stale from here.

const CACHE = 'hood-league-v2';
const SHELL = '/index.html';

// A response that came through a redirect (Cloudflare sends /index.html to /) can't answer a page load,
// so store a plain copy of it.
async function storable(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), { status: response.status, headers: response.headers });
}

// Every file of the current build, so pages not opened yet (and the offline draft engine) work offline too.
// The page itself is stored last, and only once every file it needs is here, so the cached page never
// points at files the cache doesn't have.
async function cacheBuild() {
  const cache = await caches.open(CACHE);
  const response = await fetch('/asset-manifest.json', { cache: 'no-store' });
  if (!response.ok) return;
  const manifest = await response.json();
  const urls = Object.values(manifest.files || {})
    .filter((url) => typeof url === 'string' && !url.endsWith('.map') && url !== SHELL);
  const wanted = [...new Set(['/manifest.json', '/icon-192.png', ...urls])];
  const results = await Promise.all(wanted.map(async (url) => {
    // Hashed files never change, so only fetch what's missing.
    if (await cache.match(url)) return true;
    try {
      const fresh = await fetch(url, { cache: 'no-store' });
      if (!fresh.ok || isHtmlFallback(url, fresh)) return false;
      await cache.put(url, await storable(fresh));
      return true;
    } catch (error) {
      return false; // Offline or one file failed; the next visit tries again.
    }
  }));
  if (results.some((ok) => !ok)) return;
  const shell = await fetch(SHELL, { cache: 'no-store' });
  if (shell.ok) await cache.put(SHELL, await storable(shell));
}

// For a file that no longer exists the host answers with the site's page instead; never store that as a script.
const isHtmlFallback = (url, response) => /\.(js|css)$/.test(new URL(url, self.location.origin).pathname)
  && (response.headers.get('content-type') || '').includes('text/html');

async function deleteEverywhere(request) {
  const names = await caches.keys();
  await Promise.all(names.map(async (name) => (await caches.open(name)).delete(request)));
}

// Earlier versions could store the site's page in place of a script or stylesheet during a deploy
// (unstyled white page). Clear any such copies.
async function dropBadCopies() {
  const names = await caches.keys();
  await Promise.all(names.map(async (name) => {
    const cache = await caches.open(name);
    const requests = await cache.keys();
    await Promise.all(requests.map(async (request) => {
      const response = await cache.match(request);
      if (response && isHtmlFallback(request.url, response)) await cache.delete(request);
    }));
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(dropBadCopies().catch(() => {}).then(() => cacheBuild()).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop older caches only once this one holds a complete copy of the site; until then they still work offline.
    const current = await caches.open(CACHE);
    if (await current.match(SHELL)) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
    }
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
        const cached = (await (await caches.open(CACHE)).match(SHELL)) || await caches.match(SHELL);
        return cached ? storable(cached) : Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/static/')) {
    // Build files have a hash in their name, so a good cached copy is always right.
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached && !isHtmlFallback(request.url, cached)) return cached;
      if (cached) await deleteEverywhere(request);
      const fresh = await fetch(request);
      if (fresh.ok && !isHtmlFallback(request.url, fresh)) {
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
