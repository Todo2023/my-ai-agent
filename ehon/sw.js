/**
 * Service Worker
 *
 * 役目は2つ。
 *   1. 画面一式をキャッシュして、圏外でも開けるようにする
 *   2. 一度読んだえほんの絵を端末に残す
 *
 * 2つ目が大事で、絵本は「同じものを何度も読む」もの。
 * キャッシュしておけば2回目からは通信ゼロになり、配信の帯域を使わない。
 * これが無料の範囲で運ぶための土台になっている（sekkei/platform-kids.md）。
 *
 * ファイルを更新したら CACHE の版数を上げること。
 */

const CACHE = "ehon-v12";

// 画面のもと。これだけは先に入れておく
const SHELL = [
  "./",
  "./index.html",
  "./read.html",
  "./style.css",
  "./app.js",
  "./reader.js",
  "./ruby.js",
  "./make.html",
  "./make.js",
  "./config.js",
  "./supa.js",
  "./books.json",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  // 1つでも取れないと addAll は丸ごと失敗する。アイコンが1枚欠けたくらいで
  // Service Worker が入らないほうが困るので、1つずつ入れて結果は問わない
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isBook = url.pathname.includes("/books/");

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    // えほんの絵と本文は変わらない。あるものをそのまま返して、取りに行かない
    if (cached && isBook) return cached;

    const fresh = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    // 画面のもとは、まずキャッシュを返して起動を速くし、裏で新しい版を入れる
    if (cached) return cached;

    const net = await fresh;
    if (net) return net;

    if (req.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    return new Response("offline", { status: 503, statusText: "offline" });
  })());
});
