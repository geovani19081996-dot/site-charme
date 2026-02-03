/* Charme Cosméticos PWA Service Worker */
(() => {
  const LOCAL_WORKBOX = '/js/vendor/workbox/workbox-sw.js';
  const CDN_WORKBOX = 'https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js';

  try {
    importScripts(LOCAL_WORKBOX);
  } catch (e) {}

  if (!self.workbox) {
    try {
      importScripts(CDN_WORKBOX);
    } catch (e) {}
  }

  if (!self.workbox) {
    const FALLBACK_CACHE = 'charme-fallback-v1';

    self.addEventListener('install', (event) => {
      event.waitUntil(
        caches
          .open(FALLBACK_CACHE)
          .then((cache) => cache.addAll(['/', '/sobre.html']))
          .then(() => self.skipWaiting())
      );
    });

    self.addEventListener('activate', (event) => {
      event.waitUntil(self.clients.claim());
    });

    self.addEventListener('fetch', (event) => {
      if (event.request.method !== 'GET') return;

      if (event.request.mode === 'navigate') {
        event.respondWith(fetch(event.request).catch(() => caches.match('/')));
        return;
      }

      if (
        event.request.url.includes('/data/') &&
        event.request.url.endsWith('.json')
      ) {
        event.respondWith(
          fetch(event.request)
            .then((response) => {
              const copy = response.clone();
              caches.open('charme-data').then((cache) => {
                cache.put(event.request, copy);
              });
              return response;
            })
            .catch(() => caches.match(event.request))
        );
        return;
      }

      event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request))
      );
    });

    return;
  }

  const { workbox } = self;

  workbox.core.setCacheNameDetails({ prefix: 'charme' });
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  workbox.precaching.precacheAndRoute(
    [
      { url: '/', revision: null },
      { url: '/sobre.html', revision: null },
      { url: '/manifest.webmanifest', revision: null },
      { url: '/css/base.css', revision: null },
      { url: '/css/avisos.css', revision: null },
      { url: '/css/home.css', revision: null },
      { url: '/css/vitrine.css', revision: null },
      { url: '/css/promocoes.css', revision: null },
      { url: '/css/quemsomos.css', revision: null },
      { url: '/js/site_content.js', revision: null },
      { url: '/js/vitrine.js', revision: null },
      { url: '/js/promocoes.js', revision: null },
      { url: '/img/logo-charme.png', revision: null },
      { url: '/img/logo-charme-icon.png', revision: null },
      { url: '/img/pwa/icon-192.png', revision: null },
      { url: '/img/pwa/icon-512.png', revision: null }
    ],
    {
      ignoreURLParametersMatching: [/^v$/]
    }
  );

  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'charme-pages',
      networkTimeoutSeconds: 3,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 20,
          maxAgeSeconds: 60 * 60 * 24 * 7
        })
      ]
    })
  );

  workbox.routing.registerRoute(
    ({ url }) => url.pathname.startsWith('/css/'),
    new workbox.strategies.CacheFirst({
      cacheName: 'charme-css',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 30
        })
      ]
    })
  );

  workbox.routing.registerRoute(
    ({ url }) => url.pathname.startsWith('/js/'),
    new workbox.strategies.CacheFirst({
      cacheName: 'charme-js',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 30
        })
      ]
    })
  );

  workbox.routing.registerRoute(
    ({ url }) => url.pathname.startsWith('/img/'),
    new workbox.strategies.CacheFirst({
      cacheName: 'charme-images',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 60
        })
      ]
    })
  );

  workbox.routing.registerRoute(
    ({ url }) => url.pathname.startsWith('/data/') && url.pathname.endsWith('.json'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'charme-data',
      networkTimeoutSeconds: 4,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 6
        })
      ]
    })
  );
})();
