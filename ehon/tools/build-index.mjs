/**
 * books の各フォルダにある book.json を読んで、棚に出す books.json を作る。
 *
 *   node ehon/tools/build-index.mjs
 *
 * 配信にビルドは要らない（CLAUDE.md）。手元で走らせて、出来た books.json を
 * コミットするための道具。CIでは動かさない。
 *
 * ついでに、絵の重さも出す。絵本は1冊が重く、置き場所を間違えると
 * 無料枠が先に尽きるので、増えてきたら気づけるようにしておく（sekkei/platform-kids.md）。
 */
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const booksDir = join(root, "books");

const dirs = (await readdir(booksDir, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const books = [];
let totalBytes = 0;

for (const slug of dirs) {
  let book;
  try {
    book = JSON.parse(await readFile(join(booksDir, slug, "book.json"), "utf8"));
  } catch (err) {
    console.error(`× ${slug}: book.json を読めない（${err.message}）`);
    process.exitCode = 1;
    continue;
  }

  const missing = ["title", "pages"].filter((k) => !book[k]);
  if (missing.length || !Array.isArray(book.pages) || !book.pages.length) {
    console.error(`× ${slug}: ${missing.join(" と ") || "pages"} がない`);
    process.exitCode = 1;
    continue;
  }

  // 絵とふりがなの抜けは、公開してから気づくと直すのが面倒
  let bytes = 0;
  for (const [i, p] of book.pages.entries()) {
    const where = `${slug} の ${i + 1}ページ目`;
    if (!p.image) { console.error(`× ${where}: image がない`); process.exitCode = 1; continue; }
    if (!p.alt) console.warn(`△ ${where}: alt がない（読み上げ・目の不自由な人のために入れる）`);
    try {
      bytes += (await stat(join(booksDir, slug, p.image))).size;
    } catch {
      console.error(`× ${where}: ${p.image} が見つからない`);
      process.exitCode = 1;
    }
  }
  totalBytes += bytes;

  books.push({
    slug,
    title: book.title,
    // 英語の棚（en/）が使う。apply-en.mjs が book.json に書き込む
    title_en: book.title_en || "",
    author: book.author || "",
    summary: book.summary || "",
    summary_en: book.summary_en || "",
    // 1ページでも英語が抜けていたら、英語の棚には出さない（途中で切れるより出さない）
    has_en: Boolean(book.title_en) && book.pages.every((p) => p.text_en),
    age_min: Number(book.age_min ?? 0),
    age_max: Number(book.age_max ?? 99),
    reading_minutes: Number(book.reading_minutes ?? Math.max(1, Math.round(book.pages.length / 2))),
    cover: book.cover || book.pages[0].image,
    pages: book.pages.length,
    bytes,
  });
}

books.sort((a, b) => a.age_min - b.age_min || a.title.localeCompare(b.title, "ja"));

await writeFile(join(root, "books.json"), `${JSON.stringify({ books }, null, 2)}\n`, "utf8");

const mb = totalBytes / 1024 / 1024;
console.log(`○ books.json を書いた（${books.length}冊 / 絵ぜんぶで ${mb.toFixed(2)}MB）`);

// Cloudflare Pages は1プロジェクト2万ファイルまで。1冊20ページなら約1,000冊
const files = books.reduce((n, b) => n + b.pages, 0);
console.log(`  画像ファイル ${files}枚（無料で置けるのは2万枚まで＝およそ1,000冊）`);
