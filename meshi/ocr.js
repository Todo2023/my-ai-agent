/**
 * スクショから店名と場所を読み取る。
 *
 * tesseract.js と日本語データを `ocr/` に同梱してあるので、外部に画像を送らない。
 * ただし合計16MBあるので、**実際に使うときだけ**読み込む（起動時には触らない）。
 *
 * 読み取り結果からの店名の当て方は、次の考えに沿っている。
 *   スクショの中でいちばん大きい文字は、たいてい店名。
 *   食べログでも Google マップでも Instagram でも、店名が最大級で出る。
 * だから「文字の高さ」で選び、UIの決まり文句を除く。完璧は狙わない。
 * 外したら手で直せばいい（直すのは一瞬だが、全部を手で打つのは続かない）。
 */
(function (scope) {
  const BASE = new URL("./ocr/", location.href).href;
  const OCR_WIDTH = 1100;   // 読み取り用に縮める幅。大きすぎると遅く、小さすぎると読めない

  let workerPromise = null;
  let idleTimer = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => res();
      s.onerror = () => rej(new Error("読み込めない: " + src));
      document.head.appendChild(s);
    });
  }

  async function getWorker() {
    if (!workerPromise) {
      workerPromise = (async () => {
        if (!scope.Tesseract) await loadScript(BASE + "tesseract.min.js");
        return scope.Tesseract.createWorker("jpn", 1, {
          workerPath: BASE + "worker.min.js",
          corePath: BASE,
          langPath: BASE + "lang",
          gzip: true,
        });
      })().catch((e) => { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  /** しばらく使わなければ片付ける。読み取り機は50MBほど抱えるので、置きっぱなしにしない */
  function scheduleRelease() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      const p = workerPromise;
      workerPromise = null;
      try { (await p).terminate(); } catch (_) { /* すでに落ちていればよい */ }
    }, 30000);
  }

  /** 読み取り用に縮める。元のままだと1枚に十数秒かかる */
  async function shrink(blob) {
    let bmp;
    try { bmp = await createImageBitmap(blob); } catch (_) { return blob; }
    const w0 = bmp.width, h0 = bmp.height;
    const scale = Math.min(1, OCR_WIDTH / w0);
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    return new Promise((res) => canvas.toBlob((b) => res(b || blob), "image/png"));
  }

  /** 画像 → 行の一覧（文字の高さつき）。読めなければ空 */
  async function readLines(blob) {
    const worker = await getWorker();
    const img = await shrink(blob);
    const { data } = await worker.recognize(img, {}, { blocks: true });
    scheduleRelease();

    const lines = [];
    const pageHeight = (data.blocks || []).reduce((m, b) => Math.max(m, b.bbox ? b.bbox.y1 : 0), 0) || 1;

    for (const block of data.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          const text = clean(line.text);
          if (!text) continue;
          lines.push({
            text,
            height: line.bbox ? line.bbox.y1 - line.bbox.y0 : 0,
            top: line.bbox ? line.bbox.y0 / pageHeight : 0.5,
            confidence: line.confidence || 0,
          });
        }
      }
    }
    if (lines.length) return { lines, text: data.text || "" };

    // blocks が取れない版のための保険
    return {
      lines: (data.text || "").split("\n").map((t) => ({ text: clean(t), height: 0, top: 0.5, confidence: 60 }))
        .filter((l) => l.text),
      text: data.text || "",
    };
  }

  function clean(s) {
    return String(s || "")
      .replace(/\s+/g, " ")            // 日本語の途中に入る空白は誤検出が多い
      .replace(/[|｜'"`^~*_=<>\\]/g, "")
      .trim();
  }

  // 画面の部品や決まり文句。店名として拾ってしまうと邪魔になる
  const NOISE = /^(食べログ|ホーム|検索|メニュー|地図|写真|口コミ|レビュー|予約|保存|共有|電話|経路|営業時間|定休日|予算|席|地図を見る|ネット予約|クーポン|ランチ|ディナー|もっと見る|すべて見る|閉じる|お店の公式|投稿|フォロー|いいね|コメント|営業中|閉店|準備中|本日|今すぐ|空席|人気|おすすめ|新着|ページ|詳細|情報|アクセス|公式|写真をもっと見る)/;
  const ONLY_SYMBOLS = /^[\d\s.,:;/()（）%¥￥★☆♪→←↑↓+\-–—・､、。]*$/;

  /** 行の一覧から、店名・場所・食べログかどうかを推し量る */
  function guess({ lines, text }) {
    const usable = lines.filter((l) =>
      l.text.length >= 2 && l.text.length <= 28 &&
      !NOISE.test(l.text) &&
      !ONLY_SYMBOLS.test(l.text) &&
      l.confidence >= 35
    );

    // いちばん大きい文字＝店名とみなす。同じ高さなら上にあるものを採る
    const bySize = [...usable].sort((a, b) => (b.height - a.height) || (a.top - b.top));
    const name = bySize.length ? bySize[0].text : "";

    // 場所は「〜駅」を最優先。無ければ都道府県や市区町村を含む短い行
    let area = "";
    const all = lines.map((l) => l.text);
    for (const t of all) {
      const st = t.match(/([一-龥ぁ-んァ-ヶA-Za-z0-9]{1,10}駅)/);
      if (st) { area = st[1]; break; }
    }
    if (!area) {
      for (const t of all) {
        if (t.length <= 20 && /(東京都|北海道|大阪府|京都府|.{2,3}県)|[一-龥]{1,6}[区市町]/.test(t)) {
          const m = t.match(/([一-龥ぁ-んァ-ヶ]{1,8}[区市町])/);
          area = m ? m[1] : "";
          if (area) break;
        }
      }
    }

    return {
      name,
      area,
      tabelog: /食べログ/.test(text),
      candidates: bySize.slice(0, 5).map((l) => l.text),
    };
  }

  scope.MeshiOCR = {
    /** 画像1枚から { name, area, tabelog, candidates } を返す。読めなければ null */
    async read(blob) {
      try {
        const found = await readLines(blob);
        if (!found.lines.length) return null;
        return guess(found);
      } catch (e) {
        console.warn("読み取れなかった", e);
        throw e;
      }
    },
    async release() {
      clearTimeout(idleTimer);
      const p = workerPromise;
      workerPromise = null;
      if (p) { try { (await p).terminate(); } catch (_) { /* 無視 */ } }
    },
  };
})(self);
