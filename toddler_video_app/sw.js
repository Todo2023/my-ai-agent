// 画面まわりの一式をキャッシュする。動画（YouTube）は毎回ネットから取る。
const CACHE = "todo-wanwan-v9";
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

/*
 * 画面を作るファイル（HTML / JS / CSS / manifest）は「まずネット」。
 * キャッシュを先に返すと、直したものが端末に届かず古い画面のままになる。
 * つながらないときだけキャッシュを使うので、オフラインでも開ける。
 *
 * 絵（アイコンなど）は変わらないので「まずキャッシュ」で速さを優先し、裏で更新する。
 */
const isShell = (request, url) =>
  request.mode === "navigate" || /\.(html|js|css|webmanifest)$/.test(url.pathname);

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  // YouTube など外部への通信には手を出さない（キャッシュもしない）
  if (url.origin !== self.location.origin) return;

  const put = (res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  };

  if (isShell(e.request, url)) {
    e.respondWith(
      // cache: "no-store" … ブラウザのキャッシュを通さず、必ずサーバーまで取りに行く。
      // GitHub Pages は10分間のキャッシュ指定を付けてくるので、これがないと
      // ネット優先にしても古いHTMLやJSがそのまま返ってくる。
      fetch(url.href, { cache: "no-store" })
        .then(put)
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match("./app.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then(put).catch(() => hit);
      return hit || net;
    })
  );
});
