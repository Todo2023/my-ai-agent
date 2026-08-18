/**
 * えほんの棚の絵本から、Instagram に出す下書きを作る。
 *
 *   node insta/tools/build-posts.mjs
 *
 * 作るもの
 *   insta/images/<slug>.jpg … 投稿用の画像（1080×1350 / JPEG）
 *   insta/posts.json        … キャプションの下書き
 *
 * ■ どこにも送らない
 *   これは**下書きを作るだけ**の道具。Instagram にも Supabase にも繋がない。
 *   出すのは人が見てからにする（insta/README.md）。
 *
 * ■ ehon/ は読むだけ
 *   絵本の中身は別の担当（sekkei/hikitsugi-biz.md の「触らない場所」）。
 *   ../ehon/books.json と表紙SVGを読むだけで、1バイトも書き換えない。
 *
 * ■ 依存パッケージなし
 *   このリポジトリは package.json を持たない。SVG→JPEG は
 *   **Chromium を1回起動して canvas で描く**ことで済ませている。
 *   ImageMagick も Playwright も要らない。
 *
 * ■ 日本語のフォントが要る
 *   タイトルを画像に焼くので、走らせる端末に日本語フォントが要る。
 *   無い環境では豆腐（□）になるので、出来た画像は必ず目で見ること。
 *   **画像は生成物としてコミットする**ので、作り直すときだけの話。
 */
import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const ehon = join(root, "..", "ehon");
const imagesDir = join(root, "images");

/** URLの根は ../../site.mjs にまとめてある。移設したらそこだけ直す */
import { EHON as SHELF, INSTA } from "../../site.mjs";

/** 投稿画像の大きさ。Instagram の縦長（4:5）。一覧で一番大きく出る形 */
const W = 1080;
const H = 1350;

/* ── Chromium を探す ────────────────────────────────
   環境ごとに置き場所が違う。CHROME= で名指しもできる           */
function findChrome() {
  const candidates = [
    process.env.CHROME,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new Error(
      "Chromium が見つかりません。CHROME=/path/to/chrome を付けて走らせてください",
    );
  }
  return found;
}

/* ── 画像を作る ────────────────────────────────── */

/**
 * 表紙SVGを、投稿用のJPEGにする。
 * 絵は横幅いっぱいに置き、余白は絵の隅から拾った色で埋める。
 * 下にタイトルと対象年齢を焼く（キャプションを読まなくても分かるように）。
 */
function pageHtml(svgDataUri, book) {
  const meta = `${book.age_min}〜${book.age_max}さい ・ ${book.reading_minutes}分`;
  return `<!doctype html><meta charset="utf-8"><body style="margin:0">
<div id="out">yet</div>
<script>
const img = new Image();
img.onerror = () => { document.getElementById("out").textContent = "ERR"; };
img.onload = () => {
  const TITLE = ${JSON.stringify(book.title)}, META = ${JSON.stringify(meta)};
  const c = document.createElement("canvas");
  c.width = ${W}; c.height = ${H};
  const g = c.getContext("2d");

  // 絵の左上の色を拾って、余白の色にする
  const t = document.createElement("canvas");
  t.width = img.width; t.height = img.height;
  t.getContext("2d").drawImage(img, 0, 0);
  const p = t.getContext("2d").getImageData(2, 2, 1, 1).data;
  g.fillStyle = "rgb(" + p[0] + "," + p[1] + "," + p[2] + ")";
  g.fillRect(0, 0, ${W}, ${H});

  // 背景が明るいか暗いかで、文字色を変える
  const bright = (p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000 > 140;
  const ink = bright ? "#1b2430" : "#ffffff";
  const dim = bright ? "rgba(27,36,48,.72)" : "rgba(255,255,255,.78)";

  // 絵は 1080×860 の枠に、はみ出したぶんを切って埋める（cover）。
  // そのまま置くと下が間延びするので、少しだけ左右を切って背を高くする
  const BOX = 860, TOP = 120;
  const scale = Math.max(1080 / img.width, BOX / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  g.save();
  g.beginPath(); g.rect(0, TOP, 1080, BOX); g.clip();
  g.drawImage(img, (1080 - dw) / 2, TOP + (BOX - dh) / 2, dw, dh);
  g.restore();

  const font = '"Hiragino Sans","Yu Gothic","Noto Sans JP","Noto Sans CJK JP",IPAGothic,sans-serif';
  const base = TOP + BOX + 110;

  g.textAlign = "center";
  g.fillStyle = ink;
  // 長いタイトルがはみ出さないように、収まるまで小さくする
  let size = 66;
  do {
    g.font = "700 " + size + "px " + font;
    if (g.measureText(TITLE).width <= 960) break;
    size -= 3;
  } while (size > 34);
  g.fillText(TITLE, 540, base);

  g.fillStyle = dim;
  g.font = "400 34px " + font;
  g.fillText(META, 540, base + 68);

  g.font = "400 27px " + font;
  g.fillText("えほんの棚", 540, 1350 - 62);

  document.getElementById("out").textContent = c.toDataURL("image/jpeg", 0.92);
};
img.src = ${JSON.stringify(svgDataUri)};
</script></body>`;
}

async function renderCover(chrome, book, tmpHtml) {
  const svgPath = join(ehon, "books", book.slug, book.cover);
  const svg = await readFile(svgPath, "utf8");
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  await writeFile(tmpHtml, pageHtml(uri, book), "utf8");
  const { stdout } = await run(chrome, [
    "--headless", "--disable-gpu", "--no-sandbox",
    "--virtual-time-budget=8000", "--dump-dom", `file://${tmpHtml}`,
  ], { maxBuffer: 64 * 1024 * 1024 });

  const m = stdout.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/);
  if (!m) throw new Error("画像を取り出せませんでした（Chromium の出力に JPEG がない）");
  return Buffer.from(m[1], "base64");
}

/* ── キャプションを作る ─────────────────────────────
   Claude API は使わない。book.json にあるものを並べるだけ。
   ここを機械が書くと、確かめる手間のほうが増える              */

function hashtags(book) {
  const ages = [];
  for (let a = book.age_min; a <= Math.min(book.age_max, 9); a++) ages.push(`#${a}歳`);
  return [
    "#絵本", "#えほん", "#読み聞かせ", "#よみきかせ", "#寝かしつけ",
    "#子育て", "#育児", "#絵本のある暮らし", "#無料で読める絵本",
    ...ages,
  ];
}

function caption(book) {
  const tags = hashtags(book);
  return [
    book.title,
    "",
    book.summary,
    "",
    `${book.age_min}〜${book.age_max}さい ／ ${book.reading_minutes}分で読めます ／ ${book.pages}ページ`,
    "スマホでそのまま読めます。プロフィールのリンクからどうぞ。",
    "",
    tags.join(" "),
  ].join("\n");
}

/* ── 走らせる ────────────────────────────────── */

const chrome = findChrome();
const { books } = JSON.parse(await readFile(join(ehon, "books.json"), "utf8"));
const tmpHtml = join(imagesDir, "_tmp.html");

const posts = [];
for (const book of books) {
  const jpg = await renderCover(chrome, book, tmpHtml);
  await writeFile(join(imagesDir, `${book.slug}.jpg`), jpg);

  const text = caption(book);
  posts.push({
    slug: book.slug,
    title: book.title,
    image: `images/${book.slug}.jpg`,
    // Meta はこのURLを取りに来る。公開されていないと投稿できない
    image_url: `${INSTA}images/${book.slug}.jpg`,
    link: `${SHELF}read.html?book=${book.slug}`,
    caption: text,
    caption_length: [...text].length,
    hashtag_count: hashtags(book).length,
    bytes: jpg.length,
  });
  console.log(`○ ${book.slug}　${Math.round(jpg.length / 1024)}KB　文字${[...text].length}　タグ${hashtags(book).length}`);
}

await rm(tmpHtml, { force: true });

// 置きっぱなしの画像を片づける（絵本が消えたとき）
const keep = new Set(books.map((b) => `${b.slug}.jpg`));
for (const name of await readdir(imagesDir)) {
  if (name.endsWith(".jpg") && !keep.has(name)) {
    await rm(join(imagesDir, name));
    console.log(`  消した画像: ${name}`);
  }
}

await writeFile(join(root, "posts.json"), `${JSON.stringify({ posts }, null, 2)}\n`, "utf8");

// Instagram の上限。超えたら投稿が弾かれる
const overText = posts.filter((p) => p.caption_length > 2200);
const overTags = posts.filter((p) => p.hashtag_count > 30);
if (overText.length) console.error(`× 文字数が2200を超えた: ${overText.map((p) => p.slug).join(", ")}`);
if (overTags.length) console.error(`× ハッシュタグが30を超えた: ${overTags.map((p) => p.slug).join(", ")}`);
if (overText.length || overTags.length) process.exitCode = 1;

console.log(`\n○ ${posts.length}件の下書きを作った（posts.json と images/）`);
console.log("　 insta/index.html を開いて目で確かめる。まだどこにも送っていない。");
