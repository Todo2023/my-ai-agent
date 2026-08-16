/**
 * articles/*.md を読んで、一覧用の articles.json を作る。
 *
 *   node biz/tools/build-index.mjs
 *
 * 配信にビルドは要らない（CLAUDE.md の決まり）。これは手元で走らせて、
 * 出来た articles.json をコミットするための道具。CIでは動かさない。
 *
 * 一覧のたびに全記事を読みに行くと、記事が増えたときに遅くなる。
 * 一覧に出す情報だけを1ファイルにまとめておくのが目的。
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontMatter, excerpt, readingMinutes } from "../md.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dir = join(root, "articles");

const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
const articles = [];
const skipped = [];

for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  const { meta, body } = parseFrontMatter(await readFile(join(dir, file), "utf8"));

  // published: false は下書き。一覧に出さない
  if (meta.published === false) { skipped.push(slug); continue; }

  const missing = ["title", "published_at"].filter((k) => !meta[k]);
  if (missing.length) {
    console.error(`× ${file}: ${missing.join(" と ")} がない`);
    process.exitCode = 1;
    continue;
  }

  articles.push({
    slug,
    title: meta.title,
    emoji: meta.emoji || "📝",
    topics: Array.isArray(meta.topics) ? meta.topics : (meta.topics ? [meta.topics] : []),
    author: meta.author || "",
    published_at: meta.published_at,
    is_pr: meta.is_pr === true,
    excerpt: excerpt(body),
    minutes: readingMinutes(body),
  });
}

// 新しいものが上
articles.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));

const topics = [...new Set(articles.flatMap((a) => a.topics))].sort();

await writeFile(
  join(root, "articles.json"),
  `${JSON.stringify({ topics, articles }, null, 2)}\n`,
  "utf8",
);

console.log(`○ articles.json を書いた（公開 ${articles.length}本 / 下書き ${skipped.length}本）`);
if (skipped.length) console.log(`  下書き: ${skipped.join(", ")}`);
