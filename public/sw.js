/**
 * SalEdge service worker.
 *
 * Strategies:
 * - Navigations (index.html): network-first with cache fallback so new
 *   deploys are picked up immediately, but cold-offline starts still work.
 * - Hashed static assets (/assets/*): cache-first — they are immutable,
 *   so serving them from cache is always correct and skips the network
 *   round-trip on flaky shop Wi-Fi.
 * - API traffic: never intercepted.
 *
 * The old worker served cached HTML as a fallback for JS/CSS requests, which
 * produced MIME-mismatch failures and a blank app on first offline start.
 */
const SHELL_CACHE = 'bsms-shell-v2';
const ASSET_CACHE = 'bsms-assets-v2';
const MAX_ASSET_ENTRIES = 60;

const SHELL = ['/', '/index.html', '/manifest.json', '/logo.svg', '/icon.svg'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then(cache => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== ASSET_CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

function isHashedAsset(url) {
    // Vite emits content-hashed filenames under /assets/; also cover other
    // fingerprint-looking static files (e.g. foo.abc123.css at the root).
    if (url.pathname.startsWith('/assets/')) return true;
    return /\.[0-9a-f]{8}\.[jt]s$|/\.[0-9a-f]{8}\.css$/.test(url.pathname);
}

/** Bounded runtime cache: evict oldest entries beyond the cap. */
async function putCapped(cacheName, request, response) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
    const keys = await cache.keys();
    if (keys.length > MAX_ASSET_ENTRIES) {
        // keys() is insertion-ordered per spec implementations; trim from the front.
        for (const stale of keys.slice(0, keys.length - MAX_ASSET_ENTRIES)) {
            await cache.delete(stale);
        }
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api')) return;

    // Navigations: network-first, fall back to the cached app shell.
    if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(SHELL_CACHE).then(c => c.put('/index.html', clone)).catch(() => {});
                    }
                    return res;
                })
                .catch(() =>
                    caches.match('/index.html').then(cached => cached ||
                        new Response('Offline and no cached copy available.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
                    )
                )
        );
        return;
    }

    // Immutable hashed assets: cache-first.
    if (isHashedAsset(url)) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(res => {
                    if (res.ok) {
                        putCapped(ASSET_CACHE, request, res.clone()).catch(() => {});
                    }
                    return res;
                });
            })
        );
        return;
    }

    // Other same-origin static files (icons, manifest): stale-while-revalidate.
    event.respondWith(
        caches.match(request).then(cached => {
            const network = fetch(request)
                .then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(SHELL_CACHE).then(c => c.put(request, clone)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});
