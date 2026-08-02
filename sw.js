const CACHE='yb-v335-stable';
const ASSETS=[
  './','./index.html','./style.css?v=335','./app.js?v=335',
  './manifest.json?v=335','./config.json?v=335','./favicon-v20.png?v=335',
  './icon-192-v20.png?v=335','./icon-512-v20.png?v=335',
  './app-logo-v20.png?v=335','./preview-v26.png?v=335','./room-list.csv'
];
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.hostname.includes('script.google.com')||url.hostname.includes('googleusercontent.com')||url.hostname.includes('docs.google.com')) return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  })));
});
