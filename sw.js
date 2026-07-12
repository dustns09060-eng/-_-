const CACHE='yb-v290';
const ASSETS=[
  './',
  './index.html',
  './style.css?v=290',
  './app.js?v=290',
  './manifest.json?v=290',
  './config.json?v=290',
  './favicon-v20.png?v=290',
  './icon-192-v20.png?v=290',
  './icon-512-v20.png?v=290',
  './app-logo-v20.png?v=290',
  './preview-v26.png?v=290',
  './room-list.csv'
];
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.hostname.includes('script.google.com')||url.hostname.includes('googleusercontent.com')||url.hostname.includes('docs.google.com'))return;
  event.respondWith(
    fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match(event.request))
  );
});
