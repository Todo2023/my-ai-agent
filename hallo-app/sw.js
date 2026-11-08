/* Ciao Hallo の Service Worker：一度開けば通信なしでも動くようにする。
   ページ本体は「通信優先。ただし2.5秒で返事がなければ保存済みを出す」。
   海外の弱い電波で読み込みが止まったままになるのを防ぐため（新しい版は裏で取り込み、次に開いたとき反映）。
   アイコンとフォントは「保存済み優先」。アイコンを変えたら VERSION を上げる。 */
const VERSION = "hallo-app-v2";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
const PAGE = "./index.html";

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
    const net = fetch(r).then(async res => {
      if (res.ok) { const c = await caches.open(VERSION); await c.put(PAGE, res.clone()); }
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    e.respondWith((async () => {
      const saved = await caches.match(PAGE);
      if (!saved) return net;
      const slow = new Promise(ok => setTimeout(() => ok(saved), 2500));
      return Promise.race([net.then(res => res.ok ? res : saved, () => saved), slow]);
    })());
    return;
  }
  if (u.origin === location.origin || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => {
      if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(VERSION).then(c => c.put(r, cp)); }
      return res;
    })));
  }
});
