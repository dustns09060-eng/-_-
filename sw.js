const CACHE = 'yeowoobang-copy-number-v401';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=401',
  './app.js?v=401',
  './config.json?v=401',
  './manifest.json?v=401',
  './favicon-v20.png?v=401',
  './icon-192-v20.png?v=401',
  './icon-512-v20.png?v=401',
  './app-logo-v20.png?v=401',
  './preview-v35.png?v=401'
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
