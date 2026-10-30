// Keeps screenshots, favicons and fonts across visits. Everything else goes to the network
// as usual; the site is not meant to work offline.
const CACHE = 'cwa-assets-v1';
const MAX_ENTRIES = 1500;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== location.origin) return;
    const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);

    // Screenshots carry ?v=<hash> and fonts never change: the cached copy is always right.
    if ((path.startsWith('previews/') && url.searchParams.has('v')) || path.startsWith('fonts/')) {
        event.respondWith(cacheFirst(request, url));
    } else if (path.startsWith('previews/icons/')) {
        // Favicons have no version: show the cached one, refresh it in the background.
        event.respondWith(staleWhileRevalidate(event, request));
    }
});

async function cacheFirst(request, url) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const res = await fetch(request);
    if (res.ok) {
        // drop older versions of the same screenshot
        for (const key of await cache.keys(request, { ignoreSearch: true })) {
            if (new URL(key.url).search !== url.search) await cache.delete(key);
        }
        await cache.put(request, res.clone());
        trim(cache);
    }
    return res;
}

async function staleWhileRevalidate(event, request) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    const refresh = fetch(request).then(async res => {
        if (res.ok) { await cache.put(request, res.clone()); trim(cache); }
        return res;
    });
    if (hit) {
        event.waitUntil(refresh.catch(() => {}));
        return hit;
    }
    return refresh;
}

async function trim(cache) {
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(key);
}
