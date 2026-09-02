/**
 * Service Worker
 *
 * ゲーム一式をキャッシュして、オフラインでも起動できるようにする。
 * これがあると Android Chrome が「アプリをインストール」を提案してくれる。
 *
 * ファイルを更新したときは CACHE の版数を上げること。
 */
const CACHE = 'breakout-v4';

const ASSETS = [
  './',
  './index.html',
  './game.html',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  // キャッシュを即返して起動を速くしつつ、裏で新しい版を取り込む
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });

      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) return cached;

      const fresh = await network;
      if (fresh) return fresh;

      // オフラインで未キャッシュのページを開かれたときの保険
      if (req.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      return new Response('offline', { status: 503, statusText: 'offline' });
    })
  );
});
