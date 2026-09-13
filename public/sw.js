// Service Worker for Vinterdöd - Survival Project (Complete Offline PWA)
const CACHE_NAME = 'vinterdod-v4';

// Essential static assets to pre-cache on install
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.ico',
    '/icon-192.png',
    '/icon-512.png',
    '/assets/textures/asphalt_bump.png',
    '/assets/textures/bark_birch_bump.png',
    '/assets/textures/bark_rough_bump.png',
    '/assets/textures/brick_bump.png',
    '/assets/textures/concrete_bump.png',
    '/assets/textures/snow_bump.png',
    '/assets/textures/stone_bump.png',
    '/assets/textures/water_ripple.png'
];

// Install event: pre-cache core assets and skip waiting
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Pre-caching core assets for offline play');
                return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                    console.warn('[SW] Pre-cache partial warning:', err);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event: clean up old caches and claim clients immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event: complete offline fallback & asset caching
self.addEventListener('fetch', (event) => {
    // Only handle GET requests from the same origin
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // Bypass internal Vite HMR & source file dev requests to allow hot-reloading in dev mode
    const isViteDevInternal = url.pathname.startsWith('/@vite') ||
                              url.pathname.startsWith('/@fs') ||
                              url.pathname.startsWith('/@id') ||
                              url.pathname.includes('/node_modules/') ||
                              (url.pathname.startsWith('/src/') && (url.pathname.endsWith('.tsx') || url.pathname.endsWith('.ts')));

    if (isViteDevInternal) {
        return; // Fallback to standard browser fetch behavior for dev HMR
    }

    // 1. Navigation requests (HTML document): Network-First with offline cache fallback
    if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put('/', copy.clone());
                            cache.put('/index.html', copy);
                        });
                    }
                    return response;
                })
                .catch(async () => {
                    console.log('[SW] Network unavailable. Serving offline cached index.html');
                    const cached = await caches.match('/index.html') || await caches.match('/');
                    if (cached) return cached;
                    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
                })
        );
        return;
    }

    // 2. Static Assets (JS, CSS, Textures, Images, Audio, Fonts): Cache-First with background revalidation
    event.respondWith(
        caches.match(event.request).then(async (cachedResponse) => {
            if (cachedResponse) {
                // If cached, return immediately & update cache in background if online
                fetch(event.request)
                    .then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                        }
                    })
                    .catch(() => { /* Silent network catch when offline */ });
                return cachedResponse;
            }

            // If not cached, fetch from network and cache
            try {
                const networkResponse = await fetch(event.request);
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return networkResponse;
            } catch (err) {
                console.warn('[SW] Fetch failed offline for asset:', event.request.url);
                return new Response('', { status: 404, statusText: 'Not Found' });
            }
        })
    );
});
