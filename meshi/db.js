/**
 * 保存場所（IndexedDB）の定義。
 *
 * アプリ本体（app.js）と Service Worker（共有シートからの受け取り）の両方が
 * 同じ DB を開くので、スキーマはこの1ファイルだけに置いて双方から読み込む。
 * sw.js は importScripts("./db.js")、app.html は <script src="./db.js">。
 *
 *   places  お店1軒。行きたい／行った・店名・メモ・タグ・リンク・評価
 *   shots   スクショ1枚のメタ情報＋一覧用の小さい画像（thumb）
 *   blobs   スクショの元画像。重いので詳細を開いたときだけ読む
 *   inbox   共有シートから届いた未処理のもの。Service Worker が書き、アプリが引き取る
 */
(function (scope) {
  const DB_NAME = "sukusho-meshi";
  const DB_VER = 1;

  let opening = null;

  function open() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("places")) {
          db.createObjectStore("places", { keyPath: "id" }).createIndex("status", "status");
        }
        if (!db.objectStoreNames.contains("shots")) {
          const shots = db.createObjectStore("shots", { keyPath: "id" });
          shots.createIndex("placeId", "placeId");
          // 同じスクショを二度取り込まないための指紋
          shots.createIndex("hash", "hash", { unique: true });
        }
        if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
        if (!db.objectStoreNames.contains("inbox")) db.createObjectStore("inbox", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return opening;
  }

  const ask = (req) => new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

  const finish = (tx) => new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });

  scope.MeshiDB = {
    open,

    async put(store, ...values) {
      const db = await open();
      const tx = db.transaction(store, "readwrite");
      for (const v of values) tx.objectStore(store).put(v);
      return finish(tx);
    },

    async del(store, ...keys) {
      const db = await open();
      const tx = db.transaction(store, "readwrite");
      for (const k of keys) tx.objectStore(store).delete(k);
      return finish(tx);
    },

    async get(store, key) {
      const db = await open();
      return ask(db.transaction(store).objectStore(store).get(key));
    },

    async all(store) {
      const db = await open();
      return ask(db.transaction(store).objectStore(store).getAll());
    },

    async allBy(store, index, key) {
      const db = await open();
      return ask(db.transaction(store).objectStore(store).index(index).getAll(key));
    },

    async getBy(store, index, key) {
      const db = await open();
      return ask(db.transaction(store).objectStore(store).index(index).get(key));
    },

    async clear(...stores) {
      const db = await open();
      const tx = db.transaction(stores, "readwrite");
      for (const s of stores) tx.objectStore(s).clear();
      return finish(tx);
    },
  };
})(self);
