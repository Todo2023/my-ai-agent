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

const CACHE = "ehon-v16";

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

    /* ── えほんの絵と本文 ────────────────────────────
       中身は変わらない。あるものを そのまま返して、取りに行かない。
       ここが「圏外でも読める」を支えている                         */
    if (cached && isBook) return cached;

    /* ── 画面のもと（HTML・JS・CSS・books.json）───────────
       **まず新しいものを取りに行き、だめならキャッシュ**にした。

       前は逆（まずキャッシュ、裏で更新）だった。それだと直したものが
       出るまでに2回以上ひらく必要があり、「直したはずなのに
       変わらない」が何度も起きた。画面のもとは数十KBしかないので、
       毎回取りに行っても遅くならない。

       cache: "reload" を付けているのは、ブラウザ自身が持っている古い版
       （GitHub Pages は10分ほど持たせる）を飛ばすため。
       これが無いと、取りに行っても古いものが返ってくる。

       ⚠ ここで new Request(req, …) を使ってはいけない。
         ページを開く要求（mode が navigate）からは作り直せず、
         例外になって古いキャッシュに落ちる。URLから取り直す        */
    try {
      const res = await fetch(req.url, { cache: "reload", credentials: "same-origin" });
      if (res && res.ok) {
        cache.put(req, res.clone());
        return res;
      }
      if (cached) return cached;
      if (res) return res;
    } catch {
      // 圏外。下のキャッシュに落ちる
    }

    if (cached) return cached;

    if (req.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    return new Response("offline", { status: 503, statusText: "offline" });
  })());
});
