const CACHE = 'yeowoobang-v35-1-static-352';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=352',
  './app.js?v=352',
  './config.json?v=352',
  './manifest.json?v=352',
  './favicon-v20.png?v=352',
  './icon-192-v20.png?v=352',
  './icon-512-v20.png?v=352',
  './app-logo-v20.png?v=352',
  './preview-v35.png?v=352'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com') ||
      url.hostname.includes('docs.google.com') ||
      url.hostname.includes('cdn.jsdelivr.net')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
