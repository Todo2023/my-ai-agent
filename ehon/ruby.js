/**
 * ふりがな（ルビ）
 *
 * 本文には青空文庫と同じ書き方でふりがなを入れる。
 *
 *   ｜小《ちい》さな      … ｜ から《》の前までに ちい と振る
 *   月《つき》あかり      … ｜ を省くと、直前の漢字のまとまりに振る
 *
 * ふりがなを本文とは別の列に分けて持つ案もあったが（sekkei/platform-kids.md）、
 * 実際に書いてみると「どの字に振るか」を別に持つのが煩わしかったので、
 * 本文に書き込んで、表示のときに分ける形にした。
 * 表示のオン・オフを切り替えられるという要件は、こちらでも満たせる。
 *
 * 4歳と9歳では要るものが違うので、切り替えは必ず残すこと。
 */

const RUBY = /｜([^｜《》]+)《([^《》]+)》|([一-鿿々-〇]+)《([^《》]+)》/g;

/**
 * 本文を、ふりがな付きのDOMにして返す。
 * innerHTML を使わないので、本文に記号が混ざっても壊れない。
 *
 * @param {string} text 本文（ルビ記法つき）
 * @param {boolean} showRuby false なら漢字だけ出す
 * @returns {DocumentFragment}
 */
export function rubyToDom(text, showRuby) {
  const frag = document.createDocumentFragment();
  const src = String(text ?? "");
  let last = 0;

  for (const m of src.matchAll(RUBY)) {
    const base = m[1] ?? m[3];
    const yomi = m[2] ?? m[4];

    if (m.index > last) frag.append(src.slice(last, m.index));

    if (showRuby) {
      const ruby = document.createElement("ruby");
      ruby.append(base);
      const rt = document.createElement("rt");
      rt.textContent = yomi;
      ruby.append(rt);
      frag.append(ruby);
    } else {
      frag.append(base);
    }
    last = m.index + m[0].length;
  }

  if (last < src.length) frag.append(src.slice(last));
  return frag;
}

/** 読み上げに渡す用。漢字を読みに置き換えて、記号を消す */
export function toSpeech(text) {
  return String(text ?? "")
    .replace(RUBY, (_, __, y1, ___, y2) => y1 ?? y2)
    .replace(/[｜《》]/g, "");
}

/** ルビ記法を外した、ふつうの文字列（一覧や alt に使う） */
export function toPlain(text) {
  return String(text ?? "")
    .replace(RUBY, (_, b1, __, b2) => b1 ?? b2)
    .replace(/[｜《》]/g, "");
}
