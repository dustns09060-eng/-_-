const CACHE='yb-ys2-v340-fast';
const ASSETS=[
  './',
  './index.html',
  './style.css?v=340',
  './app.js?v=340',
  './manifest.json?v=340',
  './config.json?v=340',
  './favicon-v20.png?v=340',
  './icon-192-v20.png?v=340',
  './icon-512-v20.png?v=340',
  './app-logo-v20.png?v=340',
  './room-list.csv'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);

  // API와 Google 데이터는 서비스워커가 가로채지 않습니다.
  if(url.hostname.includes('script.google.com') ||
     url.hostname.includes('googleusercontent.com') ||
     url.hostname.includes('docs.google.com')) return;

  // 정적 파일은 캐시 우선: 재접속이 빠릅니다.
  event.respondWith(
    caches.match(event.request).then(cached=>{
      if(cached) return cached;
      return fetch(event.request).then(response=>{
        if(response && response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      });
    })
  );
});
