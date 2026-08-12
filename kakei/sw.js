/**
 * Service Worker
 *
 * 役目は1つだけ。一式をキャッシュして、圏外でも起動できるようにする。
 * このアプリは外と通信しない（計算も保存も端末の中）ので、
 * 一度入れてしまえば、あとは電波が無くても最後まで動く。
 *
 * ファイルを更新したら CACHE の版数を上げること。上げないと古いまま開かれる。
 */

const CACHE = "kakei-mirai-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./app.html",
  "./check.html",
  "./app.css",
  "./app.js",
  "./sim.js",
  "./secret.js",
  "./preset.enc.json",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  // addAll は1つでも取れないと全部が失敗する。Service Worker が入らないと
  // Chrome は「インストールできるアプリ」と見なさない（＝入れるボタンが出ない）。
  // 1枚欠けたくらいで丸ごと諦めないよう、1つずつ入れて結果は問わない
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(ASSETS.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // まずキャッシュを返して起動を速くし、裏で新しい版を取り込む
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) return cached;
    const net = await fresh;
    if (net) return net;

    if (req.mode === "navigate") {
      const fallback = await cache.match("./app.html");
      if (fallback) return fallback;
    }
    return new Response("offline", { status: 503, statusText: "offline" });
  }));
});
