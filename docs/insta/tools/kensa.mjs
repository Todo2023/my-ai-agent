/**
 * 投稿の下書きを、出す前に機械で検品する。
 *
 *   node insta/tools/kensa.mjs <ファイル>     # 1本を検品する
 *   node insta/tools/kensa.mjs --self-test    # 自分自身を確かめる
 *
 * ■ お金はかからない
 *   AI を呼ばない。文字を数えて、決まった形を探すだけ。
 *   Claude API を使う「検品AI」は、この機械検品を通ったものだけに掛ける。
 *   **先にここで落とせるものを落としておくと、API に払う分が減る。**
 *
 * ■ 作るものと、疑うものを分ける
 *   投稿を作った側と同じ頭で確かめると、自分の文章を自分で褒めて終わる。
 *   だからこれは独立した道具にしてある。作る側とは口をきかない。
 *
 * ■ 落ちたら出さない
 *   「だめ」が1つでもあれば、終了コード 1 で終わる。
 *   unei.mjs の ok を打つ前に、これを通すこと。
 *
 * ■ 依存パッケージなし
 *   このリポジトリは package.json を持たない。標準の node だけで動く。
 */
import { readFile } from "node:fs/promises";

/* Instagram 側の上限。超えると弾かれる */
const MAX_CHARS = 2200;
const MAX_TAGS = 30;

/* 書いてはいけない言葉。
   景品表示法まわりで危ないものと、いま事実でないものを混ぜてある。
   「無料」は、体験期間を無料にするか決めていないため入れてある（決めたら外す）。 */
const NG = [
  { word: "必ず儲か", why: "断定できない。景品表示法で問題になりうる" },
  { word: "絶対に稼げ", why: "同上" },
  { word: "誰でも稼げ", why: "同上" },
  { word: "確実に内定", why: "断定できない" },
  { word: "100%", why: "断定に読める。割合を出すなら出典を添える" },
  { word: "無料", why: "体験期間を無料にするか未定。決まるまで書かない" },
  { word: "要記入", why: "書きかけが残っている" },
  { word: "TODO", why: "書きかけが残っている" },
];

/* 数字を出したら、出どころも出す。この語が近くにあれば出典とみなす */
const SOURCE_WORDS = ["出典", "参照", "調査", "白書", "公式", "より", "と報じ", "発表"];

/* 個人情報になりうるもの */
const PRIVATE = [
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/, why: "メールアドレスが入っている" },
  { re: /0\d{1,4}-\d{1,4}-\d{3,4}/, why: "電話番号が入っている" },
];

/** 本文を見て、指摘の一覧を返す。だめ=止める、気になる=読んでから判断 */
export function kensa(text) {
  const out = [];
  const ng = (m, why) => out.push({ level: "だめ", m, why });
  const warn = (m, why) => out.push({ level: "気になる", m, why });

  const body = String(text ?? "");
  const lines = body.split("\n");

  /* ① 長さ */
  if (body.length > MAX_CHARS) {
    ng(`本文が ${body.length} 文字`, `${MAX_CHARS} 文字を超えると Instagram に弾かれる`);
  }

  /* ② ハッシュタグ */
  const tags = body.match(/#[^\s#]+/g) ?? [];
  if (tags.length > MAX_TAGS) {
    ng(`ハッシュタグが ${tags.length} 個`, `${MAX_TAGS} 個を超えると弾かれる`);
  }

  /* ③ 行き先は1つに絞る。迷わせない */
  const urls = body.match(/https?:\/\/[^\s)]+/g) ?? [];
  const uniq = [...new Set(urls)];
  if (uniq.length > 1) {
    warn(`リンクが ${uniq.length} 本`, "行き先を1つに絞る。分岐を作ると誰も進まない");
  }

  /* ④ 書いてはいけない言葉 */
  for (const { word, why } of NG) {
    if (body.includes(word)) ng(`「${word}」がある`, why);
  }

  /* ⑤ 個人情報 */
  for (const { re, why } of PRIVATE) {
    if (re.test(body)) ng("個人情報らしきもの", why);
  }

  /* ⑥ 数字を出したら出どころも。行ごとに見る */
  for (const [i, line] of lines.entries()) {
    const hasNum = /\d+(?:\.\d+)?\s*(?:%|％|割|倍|人|件|円|時間|万)/.test(line);
    if (!hasNum) continue;
    const near = lines.slice(Math.max(0, i - 1), i + 3).join("");
    if (!SOURCE_WORDS.some((w) => near.includes(w))) {
      warn(`${i + 1}行目に出どころのない数字`, "数字を出すなら出典を添える。無いなら消す");
    }
  }

  /* ⑦ 最初の2行で指が止まるか。
     数字か、読み手の思い込みを否定する形があるか。どちらも無ければ弱い */
  const head = lines.filter((l) => l.trim()).slice(0, 2).join("");
  const stops =
    /\d/.test(head) ||
    /ではありません|ではない|違います|逆です|間違|ではなく/.test(head);
  if (head && !stops) {
    warn("最初の2行が弱い", "数字を出すか、読み手が用意している説明を先に否定する");
  }

  /* ⑧ 行き先が無い。売上まで繋がらない */
  if (uniq.length === 0 && !/プロフィール|リンク/.test(body)) {
    warn("行き先が無い", "投稿が伸びても、次に行く場所が無ければ売上にならない");
  }

  return out;
}

/* ---------- ここから下は動かすための部分 ---------- */

function show(items) {
  if (items.length === 0) {
    console.log("合格。指摘なし。");
    return 0;
  }
  const bad = items.filter((i) => i.level === "だめ");
  for (const i of items) {
    console.log(`[${i.level}] ${i.m}\n          → ${i.why}`);
  }
  console.log(`\nだめ ${bad.length} 件 ／ 気になる ${items.length - bad.length} 件`);
  if (bad.length) console.log("\n**出さないこと。** 直してからもう一度。");
  return bad.length ? 1 : 0;
}

function selfTest() {
  const cases = [
    ["空", "", 0],
    ["無料が入っている", "無料で配ります", 1],
    ["出どころのない数字", "利用率は86%でした。\n\n\n", 0],
    ["出どころのある数字", "白書によると利用率は86%でした。", 0],
    ["メールアドレス", "連絡は a@b.com まで", 1],
  ];
  let ng = 0;
  for (const [name, text, wantBad] of cases) {
    const got = kensa(text).filter((i) => i.level === "だめ").length;
    const ok = got === wantBad;
    if (!ok) ng++;
    console.log(`${ok ? "OK  " : "NG  "} ${name}（だめ ${got} 件／期待 ${wantBad}）`);
  }
  console.log(ng ? `\n${ng} 件しくじった` : "\n全部通った");
  return ng ? 1 : 0;
}

const arg = process.argv[2];
if (!arg) {
  console.log("使い方: node insta/tools/kensa.mjs <ファイル>\n        node insta/tools/kensa.mjs --self-test");
  process.exit(2);
} else if (arg === "--self-test") {
  process.exit(selfTest());
} else {
  const text = await readFile(arg, "utf8");
  process.exit(show(kensa(text)));
}
