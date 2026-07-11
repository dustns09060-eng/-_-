const CACHE="yeowoobang-v16-simple-1";
const ASSETS=["./","./index.html","./style.css?v=16","./app.js?v=16","./manifest.json?v=16","./icon-192.png","./icon-512.png","./favicon.png","./config.json","./room-list.csv"];
self.addEventListener("install",event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.hostname.includes("docs.google.com")||url.hostname.includes("cdn.jsdelivr.net")){event.respondWith(fetch(event.request));return;}
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request)));
});
