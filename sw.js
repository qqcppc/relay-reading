/* F3 only: app shell cache. Never cache shared API responses, keys or recordings. Approved static music may be cached. */
const VERSION='52';
const ROOT=new URL('./',self.location.href);
const PREFIX='relay-reading:'+ROOT.pathname+':';
const CACHE=PREFIX+VERSION;
const ASSETS=['./','index.html','settings.css?v='+VERSION,'f14-background.css?v='+VERSION,'f14-background.js?v='+VERSION,'settings.js?v='+VERSION,
  'audio-tools.js?v='+VERSION,'f10-trim.js?v='+VERSION,'f11-queue.js?v='+VERSION,'f12-chapter.js?v='+VERSION,'f13-progress.js?v='+VERSION,'drafts.js?v='+VERSION,'f15-audio.js?v='+VERSION,'f15-music.js?v='+VERSION,'assets/music/catalog.json','basics.js?v='+VERSION,'welcome.js?v='+VERSION,'sound-checks.js?v='+VERSION,'f16-completed.js?v='+VERSION,'assets/chapters/catalog.json','access.js?v='+VERSION,'features.js?v='+VERSION,'storage.js?v='+VERSION,'f2-locks.js?v='+VERSION,
  'f9-groups.js?v='+VERSION,'f8-import.js?v='+VERSION,'f7-quality.js?v='+VERSION,'f5-assignments.js?v='+VERSION,'f4-continuation.js?v='+VERSION,'f3-app.js?v='+VERSION,'ui.js?v='+VERSION,'manifest.webmanifest?v='+VERSION,
  'assets/bg/genesis-creation.webp','icons/icon-192.png','icons/icon-512.png'].map(path=>new URL(path,ROOT).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys()) if(key.startsWith(PREFIX)&&key!==CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  const navigation=event.request.mode==='navigate' && (url.pathname===ROOT.pathname || url.pathname===new URL('index.html',ROOT).pathname);
  const music=url.pathname.startsWith(new URL('assets/music/',ROOT).pathname)&&/\.(mp3|ogg|wav|m4a)$/i.test(url.pathname);
  const background=url.pathname.startsWith(new URL('assets/bg/',ROOT).pathname)&&/\.(webp|png|jpg)$/i.test(url.pathname);
  if(!navigation && !music && !background && !ASSETS.includes(url.href)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const canonical=navigation?new URL('index.html',ROOT).href:url.href;
    try {
      const response=await fetch(event.request);
      if(response.ok) {await cache.put(canonical,response.clone()).catch(()=>{});return response;}
      return await cache.match(canonical)||response;
    } catch(error) {const cached=await cache.match(canonical);if(cached)return cached;throw error;}
  })());
});
