/**
 * articles/*.md を読んで、次の2つを作る。
 *
 *   1. articles.json      … 一覧用のまとめ
 *   2. a/<slug>/index.html … 記事ごとの静的ページ（本文を埋め込んだHTML）
 *
 *   node biz/tools/build-index.mjs
 *
 * 配信にビルドは要らない（CLAUDE.md の決まり）。これは手元で走らせて、
 * 出来たものをコミットするための道具。CIでは動かさない。
 *
 * ■ 1 の理由
 *   一覧のたびに全記事を読みに行くと、記事が増えたときに遅くなる。
 *   一覧に出す情報だけを1ファイルにまとめておく。
 *
 * ■ 2 の理由
 *   `article.html?slug=xxx` のままだと、検索に載せたあとで形を変えたときに
 *   積み上げを失う。記事ごとに独立したURLを持たせておく（sekkei/hikitsugi-biz.md）。
 *
 * **コマンドは1つのまま。** 2つに分けると片方を忘れて、
 * 一覧には出るのに記事が開けない、という壊れ方をする。
 *
 * 作るところ（collect）と書くところを分けてあるのは、
 * check.mjs が「置いてあるものが最新か」を、書かずに確かめられるようにするため。
 */
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseFrontMatter, excerpt, readingMinutes } from "../md.js";
import { renderArticlePage, renderSitemap, NOINDEX } from "./render-page.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "..");
const dir = join(root, "articles");
export const pagesDir = join(root, "a");

/** DB側（supabase/community.sql）の slug の決まりと同じにしておく。
 *  ここを緩めるとファイル名やURLに変なものが混ざる */
export const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** `…/biz/a/` を直に開かれたときに一覧へ送る。ここに置くものは記事ではない */
export const REDIRECT = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex" />
<title>記事一覧へ | ハタラク文庫（仮）</title>
<meta http-equiv="refresh" content="0; url=../" />
<link rel="canonical" href="../" />
</head>
<body>
<p>記事の置き場です。<a href="../">記事一覧へ移動します</a>。</p>
</body>
</html>
`;

/**
 * articles/*.md から、置くべきものを組み立てる。**何も書かない。**
 * @returns {{indexJson:string, pages:Array<{slug:string,html:string}>,
 *            drafts:string[], errors:string[]}}
 */
export async function collect() {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const articles = [];
  const pages = [];
  const drafts = [];
  const errors = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const { meta, body } = parseFrontMatter(await readFile(join(dir, file), "utf8"));

    if (!SLUG.test(slug)) {
      errors.push(`${file}: ファイル名に使えない文字がある（英小文字・数字・ハイフンだけ）`);
      continue;
    }

    // published: false は下書き。一覧にも出さないし、ページも作らない
    if (meta.published === false) { drafts.push(slug); continue; }

    const missing = ["title", "published_at"].filter((k) => !meta[k]);
    if (missing.length) {
      errors.push(`${file}: ${missing.join(" と ")} がない`);
      continue;
    }

    articles.push({
      slug,
      title: meta.title,
      emoji: meta.emoji || "📝",
      topics: Array.isArray(meta.topics) ? meta.topics : (meta.topics ? [meta.topics] : []),
      author: meta.author || "",
      handle: meta.handle || "",
      published_at: meta.published_at,
      is_pr: meta.is_pr === true,
      excerpt: excerpt(body),
      minutes: readingMinutes(body),
    });

    pages.push({ slug, html: renderArticlePage({ slug, meta, body }) });
  }

  // 新しいものが上
  articles.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
  const topics = [...new Set(articles.flatMap((a) => a.topics))].sort();

  return {
    indexJson: `${JSON.stringify({ topics, articles }, null, 2)}\n`,
    // 検索避けを外したときだけ置く。付けたままなら null（＝置かない）
    sitemap: NOINDEX ? null : renderSitemap(articles),
    pages,
    drafts,
    errors,
  };
}

/** 生成物を置く。消えた記事のページも片づける */
async function writeAll() {
  const { indexJson, sitemap, pages, drafts, errors } = await collect();

  for (const e of errors) console.error(`× ${e}`);
  if (errors.length) process.exitCode = 1;

  await writeFile(join(root, "articles.json"), indexJson, "utf8");

  // 検索避けを外したときだけ地図を置く。戻したときは消す
  const sitemapPath = join(root, "sitemap.xml");
  if (sitemap) await writeFile(sitemapPath, sitemap, "utf8");
  else await rm(sitemapPath, { force: true });

  await mkdir(pagesDir, { recursive: true });
  for (const page of pages) {
    await mkdir(join(pagesDir, page.slug), { recursive: true });
    await writeFile(join(pagesDir, page.slug, "index.html"), page.html, "utf8");
  }

  // 下書きに戻した記事・消した記事のページが残らないようにする。
  // 消し忘れると、一覧に出ないURLだけが生き続けて検索に拾われる
  const keep = new Set(pages.map((p) => p.slug));
  const removed = [];
  for (const name of await readdir(pagesDir)) {
    if (name === "index.html" || keep.has(name)) continue;
    if (!SLUG.test(name)) continue;          // 見知らぬものは触らない
    await rm(join(pagesDir, name), { recursive: true, force: true });
    removed.push(name);
  }

  // `…/biz/a/` をそのまま開かれたときの行き先。無いと 404 になる
  await writeFile(join(pagesDir, "index.html"), REDIRECT, "utf8");

  console.log(`○ articles.json（公開 ${pages.length}本 / 下書き ${drafts.length}本）`);
  console.log(`○ a/<slug>/index.html を ${pages.length}本ぶん`);
  console.log(sitemap ? "○ sitemap.xml" : "‥ sitemap.xml は置かない（検索避けのあいだ）");
  if (drafts.length) console.log(`  下書き: ${drafts.join(", ")}`);
  if (removed.length) console.log(`  消したページ: ${removed.join(", ")}`);
  console.log("\n生成物もコミットする（配信にビルドを持たないため）。点検は node biz/tools/check.mjs");
}

// 直に走らせたときだけ書く。check.mjs から読まれたときは何もしない
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeAll();
}
