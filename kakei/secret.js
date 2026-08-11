/**
 * 錠前。
 *
 * この家の家計（名前・生年月日・毎月の金額）は、公開されている場所には
 * **暗号文の形でしか置かない**（`preset.enc.json`）。合い言葉を入れて初めて開く。
 *
 * 暗号は端末の中の Web Crypto でかける。
 *   合い言葉 --PBKDF2-SHA256(31万回)--> 鍵 --AES-256-GCM--> 中身
 * 鍵も合い言葉もどこにも送らない。GitHub に置いてあるのは、塩・IV・暗号文だけ。
 *
 * 合い言葉を変える／中身を入れ替えるときは、書き出したJSONから作り直す:
 *   node kakei/_seal.js <書き出したJSON> [合い言葉]
 *
 * ここで守れるのは「公開されているファイル」だけ。いちど開いた端末では、
 * 家計は素のまま保存される（その端末を使える人には見えます）。
 */
(function (scope) {
  "use strict";

  const YEAR = new Date().getFullYear();

  /**
   * 合い言葉なしで使うときの見本。だれの家計でもない、ならしの数字。
   * 公開されて困らないものだけを置く。
   */
  const SAMPLE = {
    people: {
      me: { name: "あなた", short: "あなた", birth: [YEAR - 40, 1, 1] },
      partner: { name: "配偶者", short: "配偶者", birth: [YEAR - 38, 1, 1] },
    },
    income: [
      { label: "給与（あなた）", monthly: 300000, owner: "me", raise: 1 },
      { label: "給与（配偶者）", monthly: 200000, owner: "partner", raise: 1 },
    ],
    spend: [
      { group: "住まい", label: "家賃", monthly: 100000 },
      { group: "住まい", label: "電気代", monthly: 10000 },
      { group: "住まい", label: "ガス代", monthly: 5000 },
      { group: "住まい", label: "水道代", monthly: 4000 },
      { group: "食べる", label: "食品購入費", monthly: 60000 },
      { group: "食べる", label: "外食費", monthly: 20000 },
      { group: "くらし", label: "日用品", monthly: 15000 },
      { group: "くらし", label: "通信費", monthly: 10000 },
      { group: "くらし", label: "レジャー費", monthly: 20000 },
      { group: "くらし", label: "医療費", monthly: 5000 },
      { group: "交通", label: "交通費", monthly: 15000 },
      { group: "税・保険", label: "保険", monthly: 15000, inflate: false },
      { group: "貯める", label: "つみたて", monthly: 50000, saving: true, inflate: false, untilRetire: true },
    ],
  };

  /* ---------------- 合い言葉のならし ---------------- */

  // 五十音をローマ字に開く表。拗音（きゃ）と促音（っ）と長音（ー）は下で処理する
  const ROMA = {
    あ: "a", い: "i", う: "u", え: "e", お: "o",
    か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
    さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
    た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
    な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
    は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
    ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
    や: "ya", ゆ: "yu", よ: "yo",
    ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
    わ: "wa", ゐ: "i", ゑ: "e", を: "wo", ん: "n",
    が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
    ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
    だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
    ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
    ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
    ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゔ: "vu",
  };
  const SMALL_Y = { ゃ: "ya", ゅ: "yu", ょ: "yo" };

  /**
   * 打ち方の違いを吸収して、1つの形（小文字ローマ字）に寄せる。
   *
   * 「トド」「とど」「ﾄﾄﾞ」「TODO」「Todo」「と ど」——どれで打っても同じ鍵になる。
   * スマホで日本語と英語のどちらの入力になっているかは、打つ人には制御しづらい。
   * そこで合い言葉は**読みが同じなら通す**ことにした。
   * 鍵はこの形から作るので、封をする側（_seal.js）と開ける側で同じ関数を使うこと。
   */
  function canon(input) {
    // 半角カナや全角英数をならし、空白と記号のゆれを落とす
    let s = String(input == null ? "" : input).normalize("NFKC").toLowerCase().replace(/\s+/g, "");

    // カタカナ → ひらがな（濁点つきもまとめて動く）
    s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];

      if (c === "っ") {                       // 促音：次の子音を重ねる
        const next = ROMA[s[i + 1]] || "";
        out += next ? next[0] : "";
        continue;
      }
      if (c === "ー") {                       // 長音：直前の母音をもう一度
        out += /[aiueo]$/.test(out) ? out[out.length - 1] : "";
        continue;
      }

      const base = ROMA[c];
      if (!base) { out += c; continue; }      // かな以外（英数字など）はそのまま

      const small = SMALL_Y[s[i + 1]];
      if (small && base.endsWith("i")) {      // 拗音：き＋ゃ → kya、し＋ゃ → sha
        const stem = base.slice(0, -1);
        out += (stem === "sh" || stem === "ch" || stem === "j") ? stem + small.slice(1) : stem + small;
        i++;
        continue;
      }
      out += base;
    }
    return out;
  }

  const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKey(pass, salt, iter) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  }

  /**
   * 合い言葉で中身を取り出す。合わなければ null（AES-GCM は改ざんも中身違いも
   * 同じように失敗するので、「違います」以上のことは言えないし、言う必要もない）。
   */
  async function unlock(pass) {
    if (!crypto || !crypto.subtle) throw new Error("この画面では暗号が使えません（https で開いてください）");
    const box = await fetch("./preset.enc.json", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error("暗号ファイルが読めません");
      return r.json();
    });
    try {
      const key = await deriveKey(canon(pass), b64ToBytes(box.salt), box.iter);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64ToBytes(box.iv) },
        key,
        b64ToBytes(box.data)
      );
      return JSON.parse(new TextDecoder().decode(plain));
    } catch (_) {
      return null;
    }
  }

  scope.KakeiSecret = { SAMPLE, unlock, canon };
})(typeof self !== "undefined" ? self : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof self !== "undefined" ? self : globalThis).KakeiSecret;
}
