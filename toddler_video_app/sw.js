// 画面まわりの一式をキャッシュする。動画（YouTube）は毎回ネットから取る。
const CACHE = "todo-wanwan-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./app.html",
  "./style.css",
  "./app.js",
  "./videos.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// まずキャッシュ、裏で更新（次に開いたときに新しくなる）
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // YouTube など外部への通信には手を出さない（キャッシュもしない）
  if (new URL(e.request.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
