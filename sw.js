const APP_CACHE = "luyenthi-v131-app-ads-prototype-01";
const BANK_CACHE = "luyenthi-v130-bank-releases";
const CAMPAIGN_CACHE = "luyenthi-v130-campaign-modules";
const APP_ASSETS = [
  "./index.html","./styles.css?v=v1.3.1-ads-prototype-01","./ads.css?v=v1.3.1-ads-prototype-01",
  "./ads-config.js?v=v1.3.1-ads-prototype-01","./ads.js?v=v1.3.1-ads-prototype-01","./app.js?v=v1.3.1-ads-prototype-01",
  "./manifest.webmanifest","./version.json",
  "./icon-192.png","./icon-512.png","./apple-touch-icon-180.png","./donate-qr.png"
];
const BASELINE_BANK_ASSETS = [
  "./release/latest.json","./release/1.0.0/manifest.json","./release/1.0.0/banks.json"
];
const CAMPAIGN_ASSETS = ["./campaigns/catalog.json"];
self.addEventListener("install", event => {
  event.waitUntil(Promise.all([
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_ASSETS)),
    caches.open(BANK_CACHE).then(cache => cache.addAll(BASELINE_BANK_ASSETS)),
    caches.open(CAMPAIGN_CACHE).then(cache => cache.addAll(CAMPAIGN_ASSETS))
  ]));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k =>
      (k.startsWith("luyenthi-v12-") || k.startsWith("luyenthi-v13-") || k.startsWith("luyenthi-v13field-")) &&
      ![APP_CACHE,BANK_CACHE,CAMPAIGN_CACHE].includes(k)
    ).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
function freshRequest(request){
  try{return new Request(request,{cache:"no-store"});}catch{return request;}
}
async function networkFirst(request, cacheName, forceFresh=false){
  const cache = await caches.open(cacheName);
  try{
    const response = await fetch(forceFresh?freshRequest(request):request);
    if(response && response.ok) await cache.put(request, response.clone());
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
  if(response && response.ok) await cache.put(request, response.clone());
  return response;
}
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if(event.request.method !== "GET") return;
  if(url.pathname.endsWith("/version.json")){
    event.respondWith(networkFirst(event.request, APP_CACHE, true));
    return;
  }
  if(url.pathname.endsWith("/campaigns/catalog.json")){
    event.respondWith(networkFirst(event.request, CAMPAIGN_CACHE, true));
    return;
  }
  if(url.pathname.includes("/campaigns/") && (url.pathname.endsWith("module.json") || url.pathname.endsWith("questions.json"))){
    event.respondWith(cacheFirst(event.request, CAMPAIGN_CACHE));
    return;
  }
  if(url.pathname.endsWith("/release/latest.json")){
    event.respondWith(networkFirst(event.request, BANK_CACHE, true));
    return;
  }
  if(url.pathname.includes("/release/") && (url.pathname.endsWith("banks.json") || url.pathname.endsWith("manifest.json"))){
    event.respondWith(cacheFirst(event.request, BANK_CACHE));
    return;
  }
  if(event.request.mode === "navigate"){
    event.respondWith(networkFirst(event.request, APP_CACHE, true).catch(()=>caches.match("./index.html")));
    return;
  }
  if(["script","style","manifest"].includes(event.request.destination)){
    event.respondWith(networkFirst(event.request, APP_CACHE, true));
    return;
  }
  event.respondWith(cacheFirst(event.request, APP_CACHE));
});
