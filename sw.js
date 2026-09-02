/**
 * 役目を終えた Service Worker。
 *
 * 以前ここ（サイト直下）にブロック崩しの Service Worker を置いていた。
 * ただし直下に置くと担当範囲が `/my-ai-agent/` 全体になり、
 * `meshi/` や `todo_game/` のページまで巻き込んでしまう。
 * ブロック崩しは `breakout/` に引っ越して自前の Service Worker を持ったので、
 * ここに残っている古い登録は自分で片付ける。
 *
 * すでに端末に入っている古い版は、次にこのファイルを取りに来たときに
 * これへ入れ替わり、下の処理で登録ごと消える。
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('breakout-')) await caches.delete(key);
    }
    await self.registration.unregister();
    // 開いているページを、担当のいない状態で読み直させる
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      client.navigate(client.url).catch(() => {});
    }
  })());
});
