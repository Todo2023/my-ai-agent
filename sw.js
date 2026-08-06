/**
 * Service Worker
 *
 * ゲーム一式をキャッシュして、オフラインでも起動できるようにする。
 * これがあると Android Chrome が「アプリをインストール」を提案してくれる。
 *
 * ファイルを更新したときは CACHE の版数を上げること。
 */
const CACHE = 'breakout-v3';

/**
 * 同じ Pages の下に別アプリが同居している（`todo_game/` `meshi/`）。
 * この Service Worker の担当範囲はリポジトリ直下なので、放っておくと
 * それらのページまで横取りしてしまう。とくに下の navigate フォールバックが
 * 効くと、別アプリを開いたはずが**ブロック崩しの画面**が出てしまう。
 * 各アプリは自前の sw.js を持っているので、ここでは触らない。
 */
const OTHER_APPS = ['/todo_game/', '/meshi/'];

const ASSETS = [
  './',
  './index.html',
  './game.html',
  './manifest.webmanifest',
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

  // 別アプリの領分には手を出さない（横取りするとそのアプリが開けなくなる）
  const path = new URL(req.url).pathname;
  if (OTHER_APPS.some((dir) => path.includes(dir))) return;

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
