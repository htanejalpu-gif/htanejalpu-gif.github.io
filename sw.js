const CACHE_NAME = 'playtv-v4.3';
const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './channels_data.js',
  './manifest.json',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_ASSETS).catch(err => {
        console.warn('Cache addAll warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Let stream video requests (.m3u8, .ts, etc.) and Firebase live data bypass service worker cache completely
  const url = event.request.url;
  if (url.includes('.m3u8') || url.includes('.ts') || url.includes('/live/') || url.includes('stream') || url.includes('firebaseio.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
