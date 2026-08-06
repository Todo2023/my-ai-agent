/**
 * Service Worker
 *
 * 役目は2つ。
 *   1. 一式をキャッシュして、圏外でも起動できるようにする
 *   2. 共有シート（manifest の share_target）から飛んでくる POST を受け止める。
 *      共有は普通のページでは受け取れず、ここで formData を開いて inbox に置き、
 *      アプリへ転送する。これが「スクショを共有→勝手にストック」の実体。
 *
 * ファイルを更新したら CACHE の版数を上げること。
 */
importScripts("./db.js");

const CACHE = "sukusho-meshi-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.html",
  "./app.css",
  "./app.js",
  "./db.js",
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

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname.endsWith("/share")) {
    e.respondWith(receiveShare(req));
    return;
  }

  if (req.method !== "GET" || url.origin !== self.location.origin) return;

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

/** 共有されたものを inbox に積んで、アプリを開く。取り込み自体はアプリ側でやる */
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const now = Date.now();
    const items = [];

    for (const file of form.getAll("shots")) {
      if (file && file.size) items.push({ id: `${now}-${items.length}-${Math.random().toString(36).slice(2, 8)}`, kind: "file", blob: file, at: now });
    }

    const title = form.get("title") || "";
    const text = form.get("text") || "";
    const link = form.get("url") || "";
    if (!items.length && (title || text || link)) {
      items.push({ id: `${now}-t-${Math.random().toString(36).slice(2, 8)}`, kind: "text", title, text, url: link, at: now });
    }

    if (items.length) await self.MeshiDB.put("inbox", ...items);
  } catch (err) {
    // 受け取りに失敗しても画面は開く。空振りだと何が起きたか分からないため
    console.warn("share failed", err);
  }

  // すでに開いているアプリがあれば、そちらにも引き取りを促す
  try {
    const clients = await self.clients.matchAll({ type: "window" });
    for (const c of clients) c.postMessage({ type: "shared" });
  } catch (_) { /* 無視してよい */ }

  return Response.redirect(new URL("./app.html?shared=1", self.location).href, 303);
}
