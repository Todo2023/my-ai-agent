/**
 * アプリの入れ物（ガワ）だけをキャッシュする。
 * 記録そのものは Apps Script 側にあるため、ここでは何も保存しない。
 */
const CACHE = "taijuu-shell-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // 自分の置き場のGETだけを扱う。Apps Script への通信には一切手を触れない。
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).catch(() => caches.match("./index.html")))
  );
});
