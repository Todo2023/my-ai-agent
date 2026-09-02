/**
 * 英語を book.json に書き込む（手元で走らせる道具）
 *
 *   node ehon/tools/apply-en.mjs
 *
 * _en.mjs にまとめた英語を、books/<slug>/book.json に足す。
 * 足すのは title_en / summary_en / pages[].text_en の3つだけで、
 * 日本語には いっさい さわらない。
 *
 * ■ 走らせる順番
 *   1. node ehon/tools/_make-books.mjs   … 絵と book.json を作り直す
 *   2. node ehon/tools/apply-en.mjs      … ここ。**1のあとで走らせること**
 *   3. node ehon/tools/build-index.mjs   … 棚の books.json を作る
 *   1を走らせると book.json は作り直されるので、2を飛ばすと英語が消える。
 *
 * ■ ページ数が合わないときは止まる
 *   日本語のページを足し引きしたのに英語を直し忘れると、
 *   1ページずつ ずれた本ができる。**ずれたまま出すより、止めるほうがよい。**
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EN } from "./_en.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const booksDir = join(root, "books");

const dirs = (await readdir(booksDir, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let done = 0;
const noEn = [];

for (const slug of dirs) {
  const path = join(booksDir, slug, "book.json");
  const book = JSON.parse(await readFile(path, "utf8"));
  const en = EN[slug];

  if (!en) { noEn.push(slug); continue; }

  if (en.pages.length !== book.pages.length) {
    console.error(
      `× ${slug}: ページ数が合わない（日本語 ${book.pages.length} / 英語 ${en.pages.length}）。_en.mjs を直すこと`,
    );
    process.exitCode = 1;
    continue;
  }

  book.title_en = en.title;
  book.summary_en = en.summary;
  book.pages = book.pages.map((p, i) => ({ ...p, text_en: en.pages[i] }));

  await writeFile(path, `${JSON.stringify(book, null, 2)}\n`, "utf8");
  done++;
}

// _en.mjs にあるのに、その絵本が無い（slug の書きまちがい）
const ghosts = Object.keys(EN).filter((s) => !dirs.includes(s));
if (ghosts.length) {
  console.error(`× _en.mjs にあるが絵本が無い: ${ghosts.join(", ")}`);
  process.exitCode = 1;
}

console.log(`○ ${done}冊に英語を書き込んだ`);
if (noEn.length) console.warn(`△ 英語がまだ無い: ${noEn.join(", ")}`);
console.log("つづけて node ehon/tools/build-index.mjs を走らせること。");
