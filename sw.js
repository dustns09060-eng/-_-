const CACHE='yeowoobang-v35-static-350';
const ASSETS=[
  './',
  './index.html',
  './style.css?v=350',
  './app.js?v=350',
  './config.json?v=350',
  './manifest.json?v=350',
  './favicon-v20.png?v=350',
  './icon-192-v20.png?v=350',
  './icon-512-v20.png?v=350',
  './app-logo-v20.png?v=350',
  './preview-v35.png?v=350',
  './room-list.csv'
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('docs.google.com')
  ) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
