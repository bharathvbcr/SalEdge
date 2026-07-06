const CACHE = 'bsms-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/api')) return;

    event.respondWith(
        fetch(event.request)
            .then(res => {
                if (res.ok && url.origin === self.location.origin) {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(event.request, clone));
                }
                return res;
            })
            .catch(() => caches.match(event.request).then(r => r ?? caches.match('/index.html')))
    );
});
