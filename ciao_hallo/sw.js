/* Ciao Hallo の Service Worker：一度開けば通信なしでも動くようにする。
   ページ本体は「通信優先・失敗したらキャッシュ」（更新がすぐ届くように）、
   アイコンとフォントは「キャッシュ優先」。アイコンを変えたら VERSION を上げる。 */
const VERSION = "ciao-hallo-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then(res => {
      const cp = res.clone();
      caches.open(VERSION).then(c => c.put("./index.html", cp));
      return res;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  if (u.origin === location.origin || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => {
      if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(VERSION).then(c => c.put(r, cp)); }
      return res;
    })));
  }
});
