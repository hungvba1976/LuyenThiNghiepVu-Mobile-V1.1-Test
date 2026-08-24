const APP_CACHE = "luyenthi-app-v1.1.1";
const BANK_CACHE = "luyenthi-bank-releases";
const APP_ASSETS = [
  "./","./index.html","./styles.css","./app.js","./manifest.webmanifest",
  "./icon-192.png","./icon-512.png"
];
const BASELINE_BANK_ASSETS = [
  "./release/latest.json","./release/2026.08.1/manifest.json","./release/2026.08.1/banks.json"
];
self.addEventListener("install", event => {
  event.waitUntil(Promise.all([
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_ASSETS)),
    caches.open(BANK_CACHE).then(cache => cache.addAll(BASELINE_BANK_ASSETS))
  ]));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith("luyenthi-app-") && k !== APP_CACHE).map(k => caches.delete(k))
  )));
  self.clients.claim();
});
async function networkFirst(request, cacheName){
  const cache = await caches.open(cacheName);
  try{
    const response = await fetch(request);
    if(response && response.ok) cache.put(request, response.clone());
    return response;
  }catch(e){
    const cached = await cache.match(request);
    if(cached) return cached;
    throw e;
  }
}
async function cacheFirst(request, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if(cached) return cached;
  const response = await fetch(request);
  if(response && response.ok) cache.put(request, response.clone());
  return response;
}
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if(event.request.method !== "GET") return;
  if(url.pathname.endsWith("/release/latest.json")){
    event.respondWith(networkFirst(event.request, BANK_CACHE));
    return;
  }
  if(url.pathname.includes("/release/") && (url.pathname.endsWith("banks.json") || url.pathname.endsWith("manifest.json"))){
    event.respondWith(cacheFirst(event.request, BANK_CACHE));
    return;
  }
  if(event.request.mode === "navigate"){
    event.respondWith(networkFirst(event.request, APP_CACHE).catch(()=>caches.match("./index.html")));
    return;
  }
  if(["script","style","manifest"].includes(event.request.destination)){
    event.respondWith(networkFirst(event.request, APP_CACHE));
    return;
  }
  event.respondWith(cacheFirst(event.request, APP_CACHE));
});
