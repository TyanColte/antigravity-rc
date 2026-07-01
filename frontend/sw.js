const CACHE_NAME = 'antigravity-rc-v29';

self.addEventListener('install', (e) => {
    self.skipWaiting(); // Force the waiting service worker to become the active service worker
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll([
            '/',
            '/index.html',
            '/style.css',
            '/app.js',
            '/icon-192.png',
            '/icon.png'
        ]))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key); // Delete old caches
                }
            }));
        }).then(() => self.clients.claim()) // Claim all clients immediately
    );
});

self.addEventListener('fetch', (e) => {
    // Ignore websockets and the webmanifest so the browser can handle credentials natively
    if (e.request.url.includes('/ws')) return;
    if (e.request.url.includes('manifest.json')) return;
    
    // Network first, falling back to cache
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
});
