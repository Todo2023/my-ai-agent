// 圏外でも遊べるように、必要なファイルを丸ごと抱えておく。
const CACHE = "baa-v15";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=15",
  "./app.js?v=15",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
];

/* 取り込むときは必ず網から取る。
   addAll のままだと、ブラウザが持っている古い写し（GitHub Pages は
   Cache-Control: max-age で10分ほど持たせる）をそのまま抱え込んでしまい、
   新しくしたのに古い画面が出続ける。実際そうなった。 */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) =>
        fetch(new Request(u, { cache: "reload" })).then((res) => c.put(u, res))
      )))
      .then(() => self.skipWaiting())
  );
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
