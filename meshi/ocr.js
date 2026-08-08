/**
 * スクショから店名と場所を読み取る。
 *
 * tesseract.js と日本語データを `ocr/` に同梱してあるので、外部に画像を送らない。
 * ただし合計6MBあるので、**実際に使うときだけ**読み込む（起動時には触らない）。
 *
 * 読み取り結果からの店名の当て方は、次の考えに沿っている。
 *   スクショの中でいちばん大きい文字は、たいてい店名。
 *   食べログでも Google マップでも Instagram でも、店名が最大級で出る。
 * だから「文字の高さ」で選び、上のほうを少し優遇し、UIの決まり文句を除く。
 * そのうえで、選んだ場所だけを切り出して拡大し、もう一度読む。
 * 完璧は狙わない。外したら手で直せばいい
 * （直すのは一瞬だが、全部を手で打つのは続かない）。
 *
 * 測ったこと（食べログ／地図／Instagram／暗い背景に寄せた8枚で比較）:
 *   はじめの版                6件一致・1件惜しい・1件外れ
 *   英語モデルを足す          5件一致（漢字がラテン文字に化けて悪化。やめた）
 *   高精度モデル(16MB)        5件一致（重いうえに悪化。やめた）
 *   いまの版                  7件一致・1件惜しい・外れなし
 * 日本語データは軽い方(2MB)のほうが、この用途では素直に当たる。
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
          // ファイル名まで指定すると tesseract はそれをそのまま使う。
          // 既定のままだと端末の対応に合わせて別名（relaxedsimd 版など）を取りに行き、
          // 同梱していないものを要求して失敗する。中身の wasm はこの .js に入っている
          corePath: BASE + "tesseract-core-simd-lstm.wasm.js",
          langPath: BASE + "lang",
          gzip: true,
        }).then(async (worker) => {
          // 既定（1つの文章として読む）だと、いちばん大きい見出し＝店名を丸ごと
          // 落とすことがある。スクショは文章ではなく散らばった短い文字の集まりなので、
          // 「まばらな文字」モードで読む
          await worker.setParameters({ tessedit_pageseg_mode: "11" });
          return worker;
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

  /**
   * 読み取り用に整える。
   * 大きすぎると遅く、小さすぎると潰れる。あわせて灰色にして明暗を強め、
   * 背景の写真や色を薄くする（文字だけを残したい）。
   * 切り出す範囲（crop）と拡大率（scale）を指定できる。
   */
  async function prepare(blob, { crop, scale = 1, contrast = true } = {}) {
    let bmp;
    try { bmp = await createImageBitmap(blob); } catch (_) { return blob; }
    const sx = crop ? crop.x : 0;
    const sy = crop ? crop.y : 0;
    const sw = crop ? crop.w : bmp.width;
    const sh = crop ? crop.h : bmp.height;

    const fit = crop ? scale : Math.min(scale, OCR_WIDTH / bmp.width);
    const w = Math.max(1, Math.round(sw * fit));
    const h = Math.max(1, Math.round(sh * fit));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
    if (bmp.close) bmp.close();

    if (contrast) {
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        // 明るさだけ残し、中間調を白か黒へ寄せる
        let v = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
        v = v < 110 ? Math.max(0, v - 40) : v > 150 ? Math.min(255, v + 40) : v;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);
    }
    return new Promise((res) => canvas.toBlob((b) => res(b || blob), "image/png"));
  }

  /** 画像 → 行の一覧（文字の高さつき）。読めなければ空 */
  async function readLines(blob, prep, psm) {
    const worker = await getWorker();
    if (psm) await worker.setParameters({ tessedit_pageseg_mode: psm });
    const img = await prepare(blob, prep);
    const { data } = await worker.recognize(img, {}, { blocks: true });
    if (psm) await worker.setParameters({ tessedit_pageseg_mode: "11" });
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
            bbox: line.bbox || null,
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

  const JP = "[぀-ヿ一-龥ｦ-ﾟ々〆ヵヶー]";
  const BETWEEN_JP = new RegExp(`(${JP}) +(?=${JP})`, "g");

  function clean(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .replace(BETWEEN_JP, "$1")       // 「渋谷 駅」「ラー メン」のような、読み取りが挟む空白を詰める
      .replace(BETWEEN_JP, "$1")       // 1文字ずつ分かれた並びは2回かける必要がある
      .replace(/[|｜'"`^~*=<>\\]/g, "")
      .trim();
  }

  // 画面の部品や決まり文句。店名として拾ってしまうと邪魔になる
  const NOISE = /^(食べログ|ホーム|検索|メニュー|地図|写真|口コミ|レビュー|予約|保存|共有|電話|経路|営業時間|定休日|予算|席|地図を見る|ネット予約|クーポン|ランチ|ディナー|もっと見る|すべて見る|閉じる|お店の公式|投稿|フォロー|いいね|コメント|営業中|閉店|準備中|本日|今すぐ|空席|人気|おすすめ|新着|ページ|詳細|情報|アクセス|公式|写真をもっと見る)/;
  const ONLY_SYMBOLS = /^[\d\s.,:;/()（）%¥￥★☆♪→←↑↓+\-–—・､、。]*$/;

  /** 行の一覧から、店名と場所を推し量る */
  function guess({ lines }) {
    const usable = lines.filter((l) =>
      l.text.length >= 2 && l.text.length <= 28 &&
      !NOISE.test(l.text) &&
      !ONLY_SYMBOLS.test(l.text) &&
      l.confidence >= 35
    );

    // いちばん大きい文字＝店名。ただし大きさが近いものが複数あるときは、
    // 上にあるほうを採る（店名は画面の上のほうに出ることが多く、
    // 下のほうの大きい文字はたいてい説明文や口コミ）
    const tallest = usable.reduce((m, l) => Math.max(m, l.height), 0) || 1;
    const score = (l) => (l.height / tallest) - l.top * 0.28;
    const bySize = [...usable].sort((a, b) => score(b) - score(a));
    const best = bySize[0] || null;

    // 場所は「〜駅」を最優先。無ければ都道府県や市区町村を含む短い行
    let area = "";
    const all = lines.map((l) => l.text);
    for (const t of all) {
      // 「代々木上原駅」の々、「ヶ丘」のヶ、伸ばし棒も駅名の一部になる
      const st = t.match(/([一-龥ぁ-んァ-ヶA-Za-z0-9々ヶヵ〆ー・]{1,12}駅)/);
      if (st) { area = st[1]; break; }
    }
    if (!area) {
      for (const t of all) {
        if (t.length <= 20 && /(東京都|北海道|大阪府|京都府|.{2,3}県)|[一-龥々]{1,6}[区市町]/.test(t)) {
          const m = t.match(/([一-龥ぁ-んァ-ヶ々ヶー]{1,8}[区市町])/);
          area = m ? m[1] : "";
          if (area) break;
        }
      }
    }

    return {
      name: best ? best.text : "",
      nameBox: best ? best.bbox : null,
      area,
      candidates: bySize.slice(0, 5).map((l) => l.text),
    };
  }

  /**
   * 店名の場所だけを切り出し、大きく拡大して読み直す。
   * 全体を1度読むだけだと、店名の1文字が別の漢字に化けることが多い
   * （「鮨」が「指」になるなど）。狭い範囲を大きく見せれば当たりやすくなる。
   */
  async function reread(blob, box) {
    if (!box) return "";
    const pad = Math.round((box.y1 - box.y0) * 0.35);
    const crop = {
      x: Math.max(0, box.x0 - pad),
      y: Math.max(0, box.y0 - pad),
      w: (box.x1 - box.x0) + pad * 2,
      h: (box.y1 - box.y0) + pad * 2,
    };
    // 文字の高さが 90px 前後になるまで拡大する（tesseract が得意な大きさ）
    const scale = Math.min(6, Math.max(1, 90 / Math.max(1, box.y1 - box.y0)));
    const found = await readLines(blob, { crop, scale }, "7");   // 7 = 1行として読む
    const line = found.lines.sort((a, b) => b.confidence - a.confidence)[0];
    return line ? { text: line.text, confidence: line.confidence } : "";
  }

  const jpRatio = (t) => {
    const chars = [...String(t || "").replace(/\s/g, "")];
    if (!chars.length) return 0;
    return chars.filter((c) => /[぀-ヿ一-龥ｦ-ﾟ々]/.test(c)).length / chars.length;
  };

  /**
   * 読み直した結果を採るかどうか。
   * 拡大して読み直すと当たりやすくなるが、外すときは派手に外す
   * （漢字がラテン文字や数字に化ける）。日本語らしさが落ちたら退ける。
   */
  function better(original, again, beforeConfidence) {
    if (!again.text || again.text.length < 2) return false;
    if (again.confidence < 55) return false;
    if (again.confidence < beforeConfidence) return false;
    // 元が日本語なのにラテン文字だらけになったら、化けたとみなす
    if (jpRatio(original) >= 0.5 && jpRatio(again.text) < jpRatio(original) - 0.15) return false;
    if (/^[\d\s.,%-]+$/.test(again.text)) return false;
    return true;
  }

  scope.MeshiOCR = {
    /** 画像1枚から { name, area, candidates } を返す。読めなければ null */
    async read(blob) {
      try {
        const found = await readLines(blob);
        if (!found.lines.length) return null;
        const out = guess(found);

        // 見つけた店名を、その場所だけ拡大して読み直す。良くなったほうを採る
        if (out.nameBox) {
          try {
            const again = await reread(blob, out.nameBox);
            const before = (found.lines.find((l) => l.text === out.name) || {}).confidence || 0;
            if (again && better(out.name, again, before)) out.name = again.text;
          } catch (_) { /* 読み直せなくても1回目の結果を使う */ }
        }
        delete out.nameBox;
        return out;
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
