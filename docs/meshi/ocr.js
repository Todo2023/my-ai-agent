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
 * 測ったこと。合成画像8枚（食べログ／地図／Instagram／暗い背景に寄せたもの）と、
 * 実機で撮った Google マップのスクショ4枚（暗いテーマ）で比べた:
 *
 *                            合成8枚      実機4枚
 *   はじめの版               6件一致      0件一致   ← 合成だけ見て良しとしていた
 *   英語モデルを足す         5件一致      -         （漢字がラテン文字に化ける。やめた）
 *   高精度モデル(16MB)       5件一致      -         （重いうえに悪化。やめた）
 *   選び方を作り直した       7件一致      4件一致
 *
 * 実機を見て分かった、合成では絶対に出なかったこと:
 *   - **いちばん大きい文字はあてにならない**。地図の道路や記号を文字と
 *     誤検出した塊が最大になる。ただしそれらは確信度が 0〜25 と低い
 *   - 店名は確信度が高い（70前後）。だから**確信度を土台にする**
 *   - Google マップは検索窓とカードの2箇所に店名が出る。
 *     **同じ文字が2回出たら店名**、という信号がとても強い
 *   - カードの中では店名が2行に折れることがある（「STEAMAN（スチー」）。
 *     検索窓には全体が入っているので、長いほうを採る
 *
 * 日本語データは軽い方(2MB)のほうが、この用途では素直に当たる。
 * 検証に使った実機のスクショは個人の記録なので、リポジトリには置いていない。
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

  /**
   * 端末が持っている文字認識（Shape Detection API）。
   * Android Chrome では Google Play の仕組みが後ろにいて、
   * 同梱の tesseract より日本語がよく当たる。使えるなら先にこちらを使う。
   * 使えない端末（iPhone や PC）では静かに false を返し、tesseract に回す。
   */
  let deviceOCR = null;   // null = 未確認 / false = 使えない / それ以外 = 使える

  async function readWithDevice(blob) {
    if (deviceOCR === false) return null;
    if (!("TextDetector" in scope)) { deviceOCR = false; return null; }
    try {
      if (!deviceOCR) deviceOCR = new scope.TextDetector();
      const bmp = await createImageBitmap(blob);
      const found = await deviceOCR.detect(bmp);
      const pageHeight = bmp.height || 1;
      if (bmp.close) bmp.close();
      if (!found || !found.length) return null;

      const lines = found.map((r) => {
        const b = r.boundingBox;
        return {
          text: clean(r.rawValue),
          height: b ? b.height : 0,
          top: b ? b.y / pageHeight : 0.5,
          bbox: b ? { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height } : null,
          confidence: 90,   // この API は確信度を返さないので、高めに扱う
        };
      }).filter((l) => l.text);

      if (!lines.length) return null;
      return { lines, text: lines.map((l) => l.text).join("\n"), source: "device" };
    } catch (_) {
      deviceOCR = false;   // 一度失敗したら以降は tesseract に任せる
      return null;
    }
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

  /**
   * 行の一覧から店名を推し量る。
   *
   * 本物の Google マップのスクショで測って分かったこと:
   *   - 「いちばん大きい文字」はあてにならない。地図の道路や記号を
   *     文字と誤検出した塊が、いちばん大きく出る（確信度は 0〜25 と低い）
   *   - 店名は**確信度が高い**。そして Google マップでは
   *     上の検索窓と下のカードの2箇所に出るので、**同じ文字が2回**現れる
   *   - 点数・価格・ジャンル・営業時間の行のすぐ上が店名（食べログも同じ）
   * この3つを足し合わせて選ぶ。大きさは補助でしかない。
   */

  // 店名の下によく置かれる行。これを見つけたら、そのすぐ上が店名
  const ANCHOR = /(★|☆|\d\.\d\s*[★☆(（]|\(\d+\)|（\d+）|[¥￥]\s*[\d,]|営業中|営業時間外|営業終了|営業開始|定休日|口コミ|レビュー|料理店|レストラン|居酒屋|焼肉店|和食店|喫茶|ラーメン|カフェ|バー|徒歩\d|\d+\s*分)/;

  const MEANINGFUL = /[぀-ヿ一-龥ｦ-ﾟ々A-Za-z0-9]/g;

  /** 記号や誤検出のかけらを落とす。地図の上の塊はここでほぼ消える */
  function looksLikeText(t) {
    const chars = [...t.replace(/\s/g, "")];
    if (chars.length < 2) return false;
    const good = (t.match(MEANINGFUL) || []).length;
    return good >= 2 && good / chars.length >= 0.6;
  }

  function guess({ lines }) {
    const norm = (t) => t.replace(/\s/g, "");

    const usable = lines.filter((l) =>
      l.text.length >= 2 && l.text.length <= 30 &&
      !NOISE.test(l.text) &&
      !ONLY_SYMBOLS.test(l.text) &&
      looksLikeText(l.text) &&
      l.confidence >= 55        // ここを上げるのが効く。地図の誤検出は軒並み低い
    );

    // 同じ文字が何回出たか（検索窓とカードの両方に出る＝店名の可能性が高い）
    const seen = new Map();
    for (const l of usable) seen.set(norm(l.text), (seen.get(norm(l.text)) || 0) + 1);

    // 点数や営業時間の行の位置。そのすぐ上を店名とみなす
    const anchors = lines.filter((l) => ANCHOR.test(l.text) && l.bbox);

    const tallest = usable.reduce((m, l) => Math.max(m, l.height), 0) || 1;

    const score = (l) => {
      let v = l.confidence;                       // 確信度が土台
      v += (l.height / tallest) * 35;             // 大きさは補助
      if ((seen.get(norm(l.text)) || 0) > 1) v += 45;   // 2回出たら店名らしい
      if (l.top < 0.08) v += 20;                  // いちばん上＝検索窓に入れた言葉
      for (const a of anchors) {
        if (!l.bbox) break;
        const gap = a.bbox.y0 - l.bbox.y1;        // 点数行のすぐ上か
        // 店名は、点数や営業時間の行より**目に見えて大きい**。
        // 同じ大きさなら、それは駅名や説明の行なので数えない
        if (gap >= -5 && gap < l.height * 2.2 && l.height >= a.height * 1.25) { v += 55; break; }
      }
      if (/^[ぁ-ん]{2,4}$/.test(norm(l.text))) v -= 25;   // 「るぷき」のような、ひらがなだけの短い誤読
      return v;
    };

    const ranked = [...usable].sort((a, b) => score(b) - score(a));
    let best = ranked[0] || null;

    // カードの中で店名が2行に折り返されていると、切れた片方が選ばれてしまう
    // （「STEAMAN（スチー」）。検索窓には全体が入っているので、
    // 上位の候補に「選んだ文字を含む、もっと長いもの」があればそちらを採る
    if (best) {
      const short = norm(best.text);
      const fuller = ranked.slice(0, 5).find((l) => {
        const t = norm(l.text);
        return t.length > short.length && t.includes(short);
      });
      if (fuller) best = fuller;
    }

    // 場所は「〜駅」を最優先。無ければ市区町村
    let area = "";
    const all = lines.map((l) => l.text);
    for (const t of all) {
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

    // 候補は重複を除いて、選ばれた順に
    const cands = [];
    for (const l of ranked) {
      if (!cands.some((c) => norm(c) === norm(l.text))) cands.push(l.text);
      if (cands.length >= 6) break;
    }

    return {
      name: best ? best.text : "",
      nameBox: best ? best.bbox : null,
      // どれくらい自信があるか。低いときは店名を入れず、候補だけ出す
      // （見たことのない画面で、それらしい別の行を店名にしてしまうのを防ぐ）
      strength: best ? score(best) : 0,
      area,
      candidates: cands,
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
        // まず端末の文字認識。だめなら同梱の tesseract
        const found = (await readWithDevice(blob)) || await readLines(blob);
        if (!found.lines.length) return null;
        const out = guess(found);
        out.source = found.source || "tesseract";
        out.confidence = (found.lines.find((l) => l.text === out.name) || {}).confidence || 0;

        // 端末側で読めたなら、拡大して読み直す必要はない（もともと精度が高い）
        if (found.source === "device") { delete out.nameBox; return out; }

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
